// Sender: pushes APPROVED drafts out, one at a time, under the warm-up cap, the gap between
// sends, quiet hours and the "never follow up blind" rule. Mirrors outreach/outreach.py.
import type { Db } from './db'
import type { OutreachMessage, OutreachSettings, Prospect } from '@/lib/types'
import { addDays, daysBetween, inQuietHours, isWeekend, localDate, nextLocalMidnight } from './time'
import { newMessageId, sendMail, smtpConfigured } from './mailer'
import { finalText } from './templates'
import { patchSettings } from './settings'

export const STOP_STATUSES = new Set(['unsubscribed', 'bounced', 'skipped', 'customer'])

export type SendWindow = {
  cap: number
  sentToday: number
  firstSendAt: Date | null
  lastSendAt: Date | null
  blockedBy: string | null   // human-readable reason nothing can go out right now
}

export async function sendWindow(db: Db, s: OutreachSettings, now = new Date()): Promise<SendWindow> {
  const { data } = await db.from('outreach_messages').select('sent_at').eq('direction', 'out').eq('status', 'sent').not('sent_at', 'is', null)
  const sentAts = (data ?? []).map(r => new Date(r.sent_at as string)).sort((a, b) => a.getTime() - b.getTime())
  const first = sentAts[0] ?? null
  const last = sentAts[sentAts.length - 1] ?? null
  const today = localDate(now, s.timezone)
  const sentToday = sentAts.filter(d => localDate(d, s.timezone) === today).length
  const cap = dailyCap(s, first, now)

  let blockedBy: string | null = null
  if (!s.enabled) blockedBy = 'Outreach is paused (master switch off).'
  else if (!s.postal_address) blockedBy = 'Set the business postal address in Outreach settings (CAN-SPAM).'
  else if (!smtpConfigured()) blockedBy = 'ZOHO_SMTP_USER / ZOHO_SMTP_PASS are not set on the server.'
  else if (s.paused_until && new Date(s.paused_until) > now) blockedBy = `Paused until ${new Date(s.paused_until).toLocaleString()}: ${s.pause_reason || ''}`
  else if (!s.send_weekends && isWeekend(now, s.timezone)) blockedBy = 'Weekend: sends resume on Monday.'
  else if (inQuietHours(now, s.timezone, s.quiet_start, s.quiet_end)) blockedBy = `Quiet hours (${s.quiet_start}:00-${s.quiet_end}:00 ${s.timezone}).`
  else if (sentToday >= cap) blockedBy = `Daily cap reached (${sentToday}/${cap}).`
  else if (last && now.getTime() - last.getTime() < s.send_gap_minutes * 60_000) blockedBy = `Waiting ${s.send_gap_minutes} min between sends.`
  return { cap, sentToday, firstSendAt: first, lastSendAt: last, blockedBy }
}

export function dailyCap(s: OutreachSettings, firstSend: Date | null, now: Date): number {
  const warm = (s.warmup || []) as [number, number][]
  if (!warm.length) return s.max_daily_cap
  if (!firstSend) return warm[0][1]
  const age = daysBetween(firstSend, now)
  for (const [days, cap] of warm) if (age < days) return cap
  return s.max_daily_cap
}

export function inboxCheckFresh(s: OutreachSettings, now = new Date()): boolean {
  if (!s.last_inbox_check_at) return false
  return now.getTime() - new Date(s.last_inbox_check_at).getTime() < s.inbox_check_valid_hours * 3_600_000
}

export async function runSender(db: Db, s: OutreachSettings, deadline: number): Promise<string> {
  const now = new Date()
  const w = await sendWindow(db, s, now)
  if (w.blockedBy) return `not sending: ${w.blockedBy}`

  const { data, error } = await db.from('outreach_messages')
    .select('*, prospects(*)')
    .eq('direction', 'out').eq('status', 'approved')
    .order('scheduled_for', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
    .limit(10)
  if (error) throw new Error(error.message)
  const queue = (data ?? []) as OutreachMessage[]
  if (!queue.length) return 'queue empty'

  const results: string[] = []
  let sent = 0
  let sentToday = w.sentToday
  let lastSend = w.lastSendAt
  for (const m of queue) {
    if (sent >= Math.max(1, s.send_max_per_run)) break
    if (Date.now() > deadline - 15_000) { results.push('(stopped: out of time)'); break }
    if (sentToday >= w.cap) { results.push('daily cap reached'); break }
    if (lastSend && Date.now() - lastSend.getTime() < s.send_gap_minutes * 60_000) { results.push('gap not elapsed'); break }
    const p = m.prospects as Prospect | undefined
    if (!p || !p.email) { await fail(db, m, 'prospect has no email'); continue }
    if (STOP_STATUSES.has(p.status) || (m.kind === 'step' && ['replied', 'interested', 'objection', 'not_now'].includes(p.status))) {
      await fail(db, m, `prospect status is ${p.status}; sequence stopped`); continue
    }
    if (m.kind === 'step' && m.step && m.step > 1 && s.require_inbox_check_for_followups && !inboxCheckFresh(s, now)) {
      results.push(`${p.email}: follow-up held until the inbox has been checked (last check ${s.last_inbox_check_at ? new Date(s.last_inbox_check_at).toLocaleString() : 'never'})`)
      continue
    }
    if (m.scheduled_for && new Date(m.scheduled_for) > now) continue

    // threading
    const { data: prior } = await db.from('outreach_messages').select('message_id, direction, sent_at, received_at')
      .eq('prospect_id', p.id).in('status', ['sent', 'received']).not('message_id', 'is', null).order('created_at', { ascending: true })
    const ids = (prior ?? []).map(r => r.message_id as string)
    const inReplyTo = m.in_reply_to || (ids.length ? ids[ids.length - 1] : null)
    const references = ids.length ? ids.join(' ') : null
    const messageId = newMessageId(s.sender_email.split('@')[1] || 'hydroheatco.com')
    const subject = m.step && m.step > 1 && !/^re:/i.test(m.subject) ? 'Re: ' + m.subject : m.subject

    try {
      await sendMail({
        fromName: s.sender_name, fromEmail: s.sender_email, to: p.email, subject,
        text: finalText(m.body, s), messageId, inReplyTo, references,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await fail(db, m, msg)
      results.push(`SMTP error on ${p.email}: ${msg}`)
      if (/5\.4\.6|unusual sending|rate ?limit|too many/i.test(msg)) {
        await patchSettings(db, { paused_until: nextLocalMidnight(now, s.timezone).toISOString(), pause_reason: 'Zoho throttled the mailbox (5.4.6). Sending resumes tomorrow at the warm-up cap.' })
        results.push('paused until tomorrow (Zoho throttle)')
      }
      break
    }

    const sentAt = new Date()
    await db.from('outreach_messages').update({ status: 'sent', sent_at: sentAt.toISOString(), message_id: messageId, in_reply_to: inReplyTo, references_header: references, subject, error: null }).eq('id', m.id)
    const patch: Record<string, unknown> = { last_sent_at: sentAt.toISOString() }
    if (m.kind === 'step' && m.step) {
      patch.step = m.step
      patch.status = 'contacted'
      if (m.step === 1) patch.thread_subject = subject
      const gaps = (s.followup_days || []) as number[]
      const gap = gaps[m.step - 1]
      patch.next_due_at = m.step < s.max_steps && gap ? addDays(sentAt, gap).toISOString() : null
    }
    await db.from('prospects').update(patch).eq('id', p.id)
    sent++; sentToday++; lastSend = sentAt
    results.push(`sent ${m.kind === 'step' ? `step ${m.step}` : 'reply'} -> ${p.email}`)
  }
  return results.join('; ') || 'nothing due'
}

async function fail(db: Db, m: OutreachMessage, error: string) {
  await db.from('outreach_messages').update({ status: 'failed', error }).eq('id', m.id)
}
