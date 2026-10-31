// Scan: read a prospect's website (at most 3 plain HTTP requests, no model call), pull an
// email address and the signals that make the pitch specific.
import type { Db } from './db'
import type { OutreachSettings, Prospect } from '@/lib/types'
import { detectSignals, extractEmails, guessSegment, htmlToText, worthContacting } from './signals'

const UA = 'Mozilla/5.0 (compatible; HydroHeatBot/1.0; +https://www.hydroheatco.com)'
const MAX_BYTES = 600_000

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    if (ct && !/html|text/i.test(ct)) return null
    const text = await res.text()
    return text.slice(0, MAX_BYTES)
  } catch {
    return null
  }
}

function contactLinks(html: string, base: string): string[] {
  const out = new Set<string>()
  for (const m of html.matchAll(/href=["']([^"'#?]+)[^"']*["']/gi)) {
    const href = m[1]
    if (!/contact|about|dealer|wholesale|trade|commercial/i.test(href)) continue
    try {
      const u = new URL(href, base)
      if (u.hostname === new URL(base).hostname) out.add(u.toString())
    } catch { /* ignore */ }
    if (out.size >= 2) break
  }
  return [...out]
}

export async function scanProspect(db: Db, p: Prospect): Promise<string> {
  if (!p.website) return 'no website'
  const home = await fetchPage(p.website)
  if (!home) {
    await db.from('prospects').update({ status: p.email ? 'qualified' : 'skipped', scanned_at: new Date().toISOString(), notes: appendNote(p.notes, 'Website did not load during scan.') }).eq('id', p.id)
    return 'unreachable'
  }
  const pages = [home]
  for (const link of contactLinks(home, p.website)) {
    const h = await fetchPage(link)
    if (h) pages.push(h)
  }
  const html = pages.join('\n')
  const text = htmlToText(html)
  const emails = extractEmails(html, text)
  const signals = detectSignals(text)
  const email = p.email || emails[0] || null
  const segment = p.segment || guessSegment(signals, text)
  let status: Prospect['status']
  if (!email) status = 'no_email'
  else if (signals.some(s => s.key === 'competitor')) status = 'skipped'
  else status = 'qualified'
  const summary = text.slice(0, 1500)
  const patch: Record<string, unknown> = {
    email, segment, signals, status, site_summary: summary, scanned_at: new Date().toISOString(),
  }
  if (status === 'skipped') patch.notes = appendNote(p.notes, 'Scanner: looks like a components wholesaler (possible competitor).')
  const { error } = await db.from('prospects').update(patch).eq('id', p.id)
  if (error) {
    if (error.code === '23505') {
      // email already belongs to another prospect: keep this one but without the duplicate address
      await db.from('prospects').update({ ...patch, email: null, status: 'skipped', notes: appendNote(p.notes, 'Scanner: email already used by another prospect.') }).eq('id', p.id)
      return 'duplicate email'
    }
    throw new Error(`prospects update: ${error.message}`)
  }
  return `${status}${signals.length ? ` (${signals.map(s => s.key).join(', ')})` : ''}${worthContacting(signals) ? '' : ' - no strong signal'}`
}

export async function runScan(db: Db, s: OutreachSettings, deadline: number): Promise<string> {
  const { data, error } = await db.from('prospects').select('*').eq('status', 'found').not('website', 'is', null)
    .order('created_at', { ascending: true }).limit(Math.max(1, s.scan_max_per_run))
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Prospect[]
  if (!rows.length) return 'nothing to scan'
  const results: string[] = []
  for (const p of rows) {
    if (Date.now() > deadline - 12_000) { results.push('(stopped: out of time)'); break }
    const r = await scanProspect(db, p)
    results.push(`${p.company}: ${r}`)
  }
  return results.join('; ')
}

function appendNote(existing: string | null, line: string): string {
  return [existing?.trim(), line].filter(Boolean).join('\n')
}
