import type { Db } from './db'
import type { OutreachRun, OutreachSettings } from '@/lib/types'
import { localDate } from './time'
import { sendWindow } from './sender'

export async function getStats(db: Db, s: OutreachSettings) {
  const now = new Date()
  const today = localDate(now, s.timezone)
  const [prospects, messages, runs, window] = await Promise.all([
    db.from('prospects').select('status, created_at, step'),
    db.from('outreach_messages').select('direction, status, kind, classification, sent_at, received_at, created_at'),
    db.from('outreach_runs').select('*').order('started_at', { ascending: false }).limit(8),
    sendWindow(db, s, now),
  ])
  const P = prospects.data ?? []
  const M = messages.data ?? []
  const inToday = (iso: string | null) => Boolean(iso) && localDate(new Date(iso as string), s.timezone) === today
  const byStatus: Record<string, number> = {}
  for (const p of P) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1
  return {
    today,
    prospectsTotal: P.length,
    prospectsFoundToday: P.filter(p => inToday(p.created_at)).length,
    byStatus,
    sentTotal: M.filter(m => m.direction === 'out' && m.status === 'sent').length,
    sentToday: M.filter(m => m.direction === 'out' && m.status === 'sent' && inToday(m.sent_at)).length,
    repliesTotal: M.filter(m => m.direction === 'in' && m.classification !== 'auto_reply' && m.classification !== 'bounce').length,
    repliesToday: M.filter(m => m.direction === 'in' && inToday(m.received_at)).length,
    interested: byStatus.interested ?? 0,
    conversations: P.filter(p => ['replied', 'interested', 'objection', 'not_now'].includes(p.status)).length,
    waitingOnYou: M.filter(m => m.direction === 'out' && m.status === 'draft').length,
    queued: M.filter(m => m.direction === 'out' && m.status === 'approved').length,
    failed: M.filter(m => m.direction === 'out' && m.status === 'failed').length,
    toScan: byStatus.found ?? 0,
    noEmail: byStatus.no_email ?? 0,
    window,
    runs: (runs.data ?? []) as OutreachRun[],
  }
}
