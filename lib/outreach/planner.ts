// Writer/planner: turns qualified prospects into step-1 drafts and due prospects into
// follow-up drafts. Everything lands in the outbox as 'draft' (or 'approved' for
// follow-ups when auto_approve_followups is on).
import type { Db } from './db'
import type { OutreachSettings, Prospect } from '@/lib/types'
import { draftStep1 } from './claude'
import { renderStep } from './templates'
import { STOP_STATUSES } from './sender'

export async function runWriter(db: Db, s: OutreachSettings, deadline: number): Promise<string> {
  const now = new Date().toISOString()
  const out: string[] = []

  // 1) follow-ups that are due
  const { data: due } = await db.from('prospects').select('*').eq('status', 'contacted').lte('next_due_at', now).lt('step', s.max_steps).limit(20)
  let followups = 0
  for (const p of (due ?? []) as Prospect[]) {
    if (await hasOpenDraft(db, p.id)) continue
    const step = p.step + 1
    const { subject, body } = renderStep(p, step, s)
    await db.from('outreach_messages').insert({
      prospect_id: p.id, direction: 'out', kind: 'step', step, subject, body,
      status: s.auto_approve_followups ? 'approved' : 'draft', model: 'template',
    })
    followups++
  }
  if (followups) out.push(`${followups} follow-up${followups > 1 ? 's' : ''} drafted`)

  // 2) new first-touch drafts, up to write_max_per_run, unless the outbox is already full
  const { count: pending } = await db.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('direction', 'out').eq('status', 'draft')
  if ((pending ?? 0) >= s.max_pending_drafts) {
    out.push(`outbox has ${pending} drafts waiting; not drafting more`)
    return out.join('; ')
  }
  const room = Math.min(s.write_max_per_run, s.max_pending_drafts - (pending ?? 0))
  const { data: fresh } = await db.from('prospects').select('*').eq('status', 'qualified').not('email', 'is', null).eq('step', 0)
    .order('created_at', { ascending: true }).limit(room * 3)
  let drafted = 0, template = 0
  const seenDomains = new Set<string>()
  for (const p of (fresh ?? []) as Prospect[]) {
    if (drafted >= room) break
    if (Date.now() > deadline - 20_000) { out.push('(stopped: out of time)'); break }
    if (STOP_STATUSES.has(p.status)) continue
    const dom = (p.email || '').split('@')[1]
    if (dom && seenDomains.has(dom)) continue
    if (await hasOpenDraft(db, p.id)) continue
    const ai = await draftStep1(p, s)
    const d = ai ?? { ...renderStep(p, 1, s), model: 'template', note: '' }
    if (!ai) template++
    await db.from('outreach_messages').insert({
      prospect_id: p.id, direction: 'out', kind: 'step', step: 1, subject: d.subject, body: d.body, status: 'draft', model: d.model,
    })
    if (dom) seenDomains.add(dom)
    drafted++
  }
  if (drafted) out.push(`${drafted} first-touch draft${drafted > 1 ? 's' : ''}${template ? ` (${template} from template)` : ''}`)
  return out.join('; ') || 'nothing to draft'
}

async function hasOpenDraft(db: Db, prospectId: string): Promise<boolean> {
  const { count } = await db.from('outreach_messages').select('id', { count: 'exact', head: true })
    .eq('prospect_id', prospectId).eq('direction', 'out').in('status', ['draft', 'approved'])
  return (count ?? 0) > 0
}
