// Handler: reads replies (IMAP when enabled, or replies pasted in the admin), classifies
// them, stops the sequence, and drafts an answer for approval.
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import type { Db } from './db'
import type { OutreachMessage, OutreachSettings, Prospect, ReplyClassification } from '@/lib/types'
import { classifyInbound, draftReply } from './claude'
import { patchSettings } from './settings'

export function imapConfigured(): boolean {
  return process.env.ZOHO_IMAP_ENABLED === 'true' && Boolean(process.env.ZOHO_SMTP_USER && process.env.ZOHO_SMTP_PASS)
}

export type Inbound = {
  fromEmail: string
  subject: string
  text: string
  messageId?: string | null
  inReplyTo?: string | null
  receivedAt?: Date
}

const STATUS_FOR: Partial<Record<ReplyClassification, Prospect['status']>> = {
  interested: 'interested', objection: 'objection', not_now: 'not_now', unsubscribe: 'unsubscribed', bounce: 'bounced', other: 'replied',
}

// Record one inbound message for a prospect, classify it, stop pending follow-ups, draft a reply.
export async function processInbound(db: Db, p: Prospect, s: OutreachSettings, inb: Inbound): Promise<string> {
  if (inb.messageId) {
    const { count } = await db.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('message_id', inb.messageId)
    if ((count ?? 0) > 0) return 'already recorded'
  }
  const cls = await classifyInbound(inb.fromEmail, inb.subject, inb.text)
  const { data: saved, error } = await db.from('outreach_messages').insert({
    prospect_id: p.id, direction: 'in', kind: 'reply', subject: inb.subject || '(no subject)', body: inb.text || '(empty)',
    status: 'received', message_id: inb.messageId || null, in_reply_to: inb.inReplyTo || null,
    classification: cls.classification, from_email: inb.fromEmail, model: cls.model,
    received_at: (inb.receivedAt || new Date()).toISOString(),
  }).select('*').single()
  if (error) throw new Error(`inbound insert: ${error.message}`)
  const inbound = saved as OutreachMessage

  if (cls.classification !== 'auto_reply') {
    // stop the sequence and cancel anything queued for this prospect
    await db.from('outreach_messages').update({ status: 'rejected', error: 'superseded by a reply' })
      .eq('prospect_id', p.id).eq('direction', 'out').eq('kind', 'step').in('status', ['draft', 'approved'])
    const status = STATUS_FOR[cls.classification] || 'replied'
    const patch: Record<string, unknown> = { next_due_at: null }
    if (!['unsubscribed', 'bounced', 'customer'].includes(p.status)) patch.status = status
    if (cls.summary) patch.notes = [p.notes?.trim(), `${new Date().toISOString().slice(0, 10)} reply: ${cls.summary}`].filter(Boolean).join('\n')
    await db.from('prospects').update(patch).eq('id', p.id)
  }

  let drafted = ''
  if (['interested', 'objection', 'not_now', 'other'].includes(cls.classification)) {
    const { data: thread } = await db.from('outreach_messages').select('*').eq('prospect_id', p.id).order('created_at', { ascending: true })
    const reply = await draftReply(p, (thread ?? []) as OutreachMessage[], inbound, s)
    if (reply) {
      const subject = /^re:/i.test(inb.subject) ? inb.subject : 'Re: ' + (p.thread_subject || inb.subject || 'Sauna components')
      await db.from('outreach_messages').insert({
        prospect_id: p.id, direction: 'out', kind: 'reply', subject, body: reply.body, status: 'draft', model: reply.model, in_reply_to: inb.messageId || null,
      })
      drafted = ', answer drafted for approval'
    } else {
      drafted = ', no answer drafted (model unavailable), reply by hand'
    }
  }
  return `${cls.classification}${drafted}`
}

// Match a bounce notice to the prospect whose address appears in it.
async function prospectForBounce(db: Db, text: string, active: Prospect[]): Promise<Prospect | null> {
  const lower = text.toLowerCase()
  return active.find(p => p.email && lower.includes(p.email)) ?? null
}

export async function runHandler(db: Db, s: OutreachSettings, deadline: number): Promise<string> {
  if (!imapConfigured()) return 'IMAP off: replies are logged by hand in Conversations'
  const { data: sentRows } = await db.from('prospects').select('*').gt('step', 0)
  const active = (sentRows ?? []) as Prospect[]
  if (!active.length) return 'no emails sent yet'
  const byEmail = new Map(active.filter(p => p.email).map(p => [p.email!.toLowerCase(), p]))
  const { data: firstSent } = await db.from('outreach_messages').select('sent_at').eq('status', 'sent').order('sent_at', { ascending: true }).limit(1).maybeSingle()
  const since = firstSent?.sent_at ? new Date(firstSent.sent_at as string) : new Date(Date.now() - 30 * 86_400_000)

  const client = new ImapFlow({
    host: process.env.ZOHO_IMAP_HOST || 'imap.zoho.com', port: 993, secure: true,
    auth: { user: process.env.ZOHO_SMTP_USER!, pass: process.env.ZOHO_SMTP_PASS! },
    logger: false,
  })
  const results: string[] = []
  let handled = 0
  try {
    await client.connect()
    for (const folder of ['INBOX', 'Spam']) {
      let lock
      try { lock = await client.getMailboxLock(folder) } catch { continue }
      try {
        const uids = await client.search({ since }, { uid: true })
        for (const uid of (uids || []).slice(-200)) {
          if (Date.now() > deadline - 15_000) { results.push('(stopped: out of time)'); break }
          const msg = await client.fetchOne(String(uid), { envelope: true, source: true }, { uid: true })
          if (!msg || !msg.envelope) continue
          const from = (msg.envelope.from?.[0]?.address || '').toLowerCase()
          const mid = msg.envelope.messageId || null
          if (mid) {
            const { count } = await db.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('message_id', mid)
            if ((count ?? 0) > 0) continue
          }
          const prospect = byEmail.get(from)
          const isBounce = /mailer-daemon|postmaster/.test(from)
          if (!prospect && !isBounce) continue
          const parsed = msg.source ? await simpleParser(msg.source) : null
          const text = (parsed?.text || '').trim() || (parsed?.html ? String(parsed.html).replace(/<[^>]+>/g, ' ') : '')
          const subject = msg.envelope.subject || parsed?.subject || ''
          const target = prospect ?? (await prospectForBounce(db, text, active))
          if (!target) continue
          const r = await processInbound(db, target, s, {
            fromEmail: from, subject, text, messageId: mid, inReplyTo: msg.envelope.inReplyTo || null, receivedAt: msg.envelope.date ? new Date(msg.envelope.date) : new Date(),
          })
          handled++
          results.push(`${target.company}: ${r}`)
        }
      } finally {
        lock.release()
      }
    }
    await client.logout()
  } catch (e) {
    try { await client.logout() } catch { /* ignore */ }
    throw e
  }
  await patchSettings(db, { last_inbox_check_at: new Date().toISOString() })
  return handled ? results.join('; ') : 'inbox checked, no new replies'
}
