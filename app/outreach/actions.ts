'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/outreach/db'
import { getSettings, patchSettings } from '@/lib/outreach/settings'
import { runPipeline } from '@/lib/outreach/run'
import { scanProspect } from '@/lib/outreach/scan'
import { processInbound } from '@/lib/outreach/handler'
import { normaliseDomain, normaliseWebsite } from '@/lib/outreach/signals'
import { renderStep } from '@/lib/outreach/templates'
import { draftStep1 } from '@/lib/outreach/claude'
import type { OutreachSettings, Prospect, ProspectStatus } from '@/lib/types'

type Result = { ok: boolean; error?: string; message?: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PATHS = ['/outreach', '/outreach/outbox', '/outreach/conversations', '/outreach/prospects', '/outreach/settings']

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  return supabase
}

function revalidateAll(extra?: string) {
  for (const p of PATHS) revalidatePath(p)
  if (extra) revalidatePath(extra)
}

const str = (fd: FormData, k: string) => ((fd.get(k) as string) ?? '').trim()

// ---------- pipeline ----------
export async function runNow(formData: FormData): Promise<Result> {
  await requireUser()
  const only = str(formData, 'only')
  try {
    const r = await runPipeline({ trigger: 'manual', budgetMs: 55_000, only: only ? only.split(',') : undefined })
    revalidateAll()
    const failed = r.steps.filter(s => !s.ok)
    return { ok: failed.length === 0, message: r.steps.map(s => `${s.name}: ${s.ok ? s.summary : 'FAILED ' + s.error}`).join('\n'), error: failed.length ? `${failed.length} step(s) failed` : undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Run failed' }
  }
}

export async function toggleEnabled(formData: FormData) {
  const supabase = await requireUser()
  const enabled = formData.get('enabled') === 'true'
  await supabase.from('outreach_settings').update({ enabled, paused_until: enabled ? null : undefined, pause_reason: enabled ? null : undefined }).eq('id', 1)
  revalidateAll()
}

export async function markInboxChecked() {
  const supabase = await requireUser()
  await supabase.from('outreach_settings').update({ last_inbox_check_at: new Date().toISOString() }).eq('id', 1)
  revalidateAll()
}

export async function clearPause() {
  const supabase = await requireUser()
  await supabase.from('outreach_settings').update({ paused_until: null, pause_reason: null }).eq('id', 1)
  revalidateAll()
}

// ---------- outbox ----------
export async function approveMessage(formData: FormData): Promise<Result> {
  const supabase = await requireUser()
  const id = str(formData, 'id')
  const subject = str(formData, 'subject')
  const body = str(formData, 'body')
  if (!id || !subject || !body) return { ok: false, error: 'Subject and body are required.' }
  const { error } = await supabase.from('outreach_messages').update({ subject, body, status: 'approved', error: null }).eq('id', id).in('status', ['draft', 'failed', 'rejected'])
  if (error) return { ok: false, error: error.message }
  revalidateAll()
  return { ok: true }
}

export async function saveDraft(formData: FormData): Promise<Result> {
  const supabase = await requireUser()
  const id = str(formData, 'id')
  const subject = str(formData, 'subject')
  const body = str(formData, 'body')
  const { error } = await supabase.from('outreach_messages').update({ subject, body }).eq('id', id).eq('status', 'draft')
  if (error) return { ok: false, error: error.message }
  revalidateAll()
  return { ok: true }
}

export async function rejectMessage(formData: FormData) {
  const supabase = await requireUser()
  const id = str(formData, 'id')
  await supabase.from('outreach_messages').update({ status: 'rejected' }).eq('id', id).in('status', ['draft', 'approved', 'failed'])
  revalidateAll()
}

export async function unapproveMessage(formData: FormData) {
  const supabase = await requireUser()
  const id = str(formData, 'id')
  await supabase.from('outreach_messages').update({ status: 'draft' }).eq('id', id).eq('status', 'approved')
  revalidateAll()
}

export async function redraftMessage(formData: FormData): Promise<Result> {
  const supabase = await requireUser()
  const id = str(formData, 'id')
  const { data: m } = await supabase.from('outreach_messages').select('*, prospects(*)').eq('id', id).single()
  if (!m) return { ok: false, error: 'Draft not found.' }
  const p = m.prospects as Prospect
  const s = await getSettings(supabase)
  const ai = m.step === 1 ? await draftStep1(p, s) : null
  const d = ai ?? { ...renderStep(p, m.step ?? 1, s), model: 'template' }
  await supabase.from('outreach_messages').update({ subject: d.subject, body: d.body, model: d.model, status: 'draft' }).eq('id', id)
  revalidateAll()
  return { ok: true, message: ai ? 'Redrafted with the model.' : 'Model unavailable; template used.' }
}

// ---------- prospects ----------
export async function addProspect(formData: FormData): Promise<Result> {
  const supabase = await requireUser()
  const company = str(formData, 'company')
  if (!company) return { ok: false, error: 'Company is required.' }
  const email = str(formData, 'email').toLowerCase() || null
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: 'That email does not look valid.' }
  const website = normaliseWebsite(str(formData, 'website')) || null
  const row = {
    company, email, website, domain: normaliseDomain(website),
    contact_name: str(formData, 'contact_name') || null,
    phone: str(formData, 'phone') || null,
    city: str(formData, 'city') || null,
    state: str(formData, 'state') || null,
    segment: str(formData, 'segment') || null,
    source: 'manual',
    status: website ? 'found' : email ? 'qualified' : 'no_email',
    notes: str(formData, 'notes') || null,
  }
  const { error } = await supabase.from('prospects').insert(row)
  if (error) return { ok: false, error: error.code === '23505' ? 'A prospect with that email or website already exists.' : error.message }
  revalidateAll()
  return { ok: true }
}

// CSV columns: company,website,email,contact_name,segment,city,state  (header optional)
export async function importProspects(formData: FormData): Promise<Result & { imported?: number; skipped?: number }> {
  const supabase = await requireUser()
  const raw = str(formData, 'csv')
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (!lines.length) return { ok: false, error: 'Nothing to import.' }
  if (/company/i.test(lines[0]) && /email|website/i.test(lines[0])) lines.shift()
  let imported = 0, skipped = 0
  for (const line of lines) {
    const [company, websiteRaw, emailRaw, contact_name, segment, city, state] = line.split(',').map(x => (x || '').trim().replace(/^"|"$/g, ''))
    const email = (emailRaw || '').toLowerCase() || null
    const website = normaliseWebsite(websiteRaw) || null
    if (!company || (email && !EMAIL_RE.test(email)) || (!email && !website)) { skipped++; continue }
    const { error } = await supabase.from('prospects').insert({
      company, email, website, domain: normaliseDomain(website), contact_name: contact_name || null,
      segment: ['builder', 'distributor', 'studio', 'spa', 'other'].includes(segment) ? segment : null,
      city: city || null, state: state || null, source: 'csv',
      status: website ? 'found' : 'qualified',
    })
    if (error) skipped++; else imported++
  }
  revalidateAll()
  return { ok: true, imported, skipped }
}

export async function setProspectStatus(formData: FormData) {
  const supabase = await requireUser()
  const id = str(formData, 'id')
  const status = str(formData, 'status') as ProspectStatus
  const patch: Record<string, unknown> = { status }
  if (['skipped', 'unsubscribed', 'bounced', 'customer'].includes(status)) patch.next_due_at = null
  await supabase.from('prospects').update(patch).eq('id', id)
  if (['skipped', 'unsubscribed', 'bounced', 'customer'].includes(status)) {
    await supabase.from('outreach_messages').update({ status: 'rejected', error: `prospect marked ${status}` }).eq('prospect_id', id).eq('direction', 'out').in('status', ['draft', 'approved'])
  }
  revalidateAll(`/outreach/conversations/${id}`)
}

export async function updateProspect(formData: FormData): Promise<Result> {
  const supabase = await requireUser()
  const id = str(formData, 'id')
  const email = str(formData, 'email').toLowerCase()
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: 'That email does not look valid.' }
  const patch: Record<string, unknown> = {
    email: email || null,
    contact_name: str(formData, 'contact_name') || null,
    segment: str(formData, 'segment') || null,
    notes: str(formData, 'notes') || null,
  }
  const current = await supabase.from('prospects').select('status').eq('id', id).single()
  if (email && current.data?.status === 'no_email') patch.status = 'qualified'
  const { error } = await supabase.from('prospects').update(patch).eq('id', id)
  if (error) return { ok: false, error: error.code === '23505' ? 'Another prospect already uses that email.' : error.message }
  revalidateAll(`/outreach/conversations/${id}`)
  return { ok: true }
}

export async function scanNow(formData: FormData): Promise<Result> {
  const supabase = await requireUser()
  const id = str(formData, 'id')
  const { data } = await supabase.from('prospects').select('*').eq('id', id).single()
  if (!data) return { ok: false, error: 'Prospect not found.' }
  const r = await scanProspect(adminClient(), data as Prospect)
  revalidateAll()
  return { ok: true, message: r }
}

export async function deleteProspect(formData: FormData) {
  const supabase = await requireUser()
  await supabase.from('prospects').delete().eq('id', str(formData, 'id'))
  revalidateAll()
}

// ---------- conversations ----------
export async function logReply(formData: FormData): Promise<Result> {
  const supabase = await requireUser()
  const prospectId = str(formData, 'prospect_id')
  const email = str(formData, 'email').toLowerCase()
  const text = str(formData, 'text')
  const subject = str(formData, 'subject')
  if (!text) return { ok: false, error: 'Paste the reply text.' }
  let q = supabase.from('prospects').select('*')
  q = prospectId ? q.eq('id', prospectId) : q.eq('email', email)
  const { data: p } = await q.maybeSingle()
  if (!p) return { ok: false, error: 'No prospect with that email.' }
  const s = await getSettings(supabase)
  const r = await processInbound(adminClient(), p as Prospect, s, { fromEmail: (p as Prospect).email || email, subject: subject || `Re: ${(p as Prospect).thread_subject || ''}`, text })
  await supabase.from('outreach_settings').update({ last_inbox_check_at: new Date().toISOString() }).eq('id', 1)
  revalidateAll(`/outreach/conversations/${(p as Prospect).id}`)
  return { ok: true, message: `Recorded as ${r}.` }
}

// ---------- settings ----------
export async function saveOutreachSettings(formData: FormData): Promise<Result> {
  const supabase = await requireUser()
  const num = (k: string, fallback: number) => { const v = Number(str(formData, k)); return Number.isFinite(v) ? v : fallback }
  const list = (k: string) => str(formData, k).split(/[\s,]+/).map(x => x.trim()).filter(Boolean)
  const warm = str(formData, 'warmup').split(/\n|;/).map(l => l.trim()).filter(Boolean).map(l => l.split(/[,\s]+/).map(Number) as [number, number]).filter(([d, c]) => d > 0 && c > 0)
  const followups = list('followup_days').map(Number).filter(n => n > 0)
  const patch: Partial<OutreachSettings> = {
    sender_name: str(formData, 'sender_name') || 'Hydro Heat',
    sender_email: str(formData, 'sender_email'),
    postal_address: str(formData, 'postal_address') || null,
    catalog_url: str(formData, 'catalog_url') || 'https://www.hydroheatco.com',
    you_sell: str(formData, 'you_sell'),
    ideal_customer: str(formData, 'ideal_customer'),
    verified_facts: str(formData, 'verified_facts'),
    timezone: str(formData, 'timezone') || 'America/New_York',
    quiet_start: num('quiet_start', 19),
    quiet_end: num('quiet_end', 8),
    send_weekends: formData.get('send_weekends') === 'on',
    warmup: warm.length ? warm : [[7, 4], [14, 8], [21, 12], [28, 18]],
    max_daily_cap: num('max_daily_cap', 30),
    send_gap_minutes: num('send_gap_minutes', 12),
    send_max_per_run: num('send_max_per_run', 1),
    followup_days: followups.length ? followups : [4, 6],
    max_steps: Math.min(Math.max(num('max_steps', 3), 1), 5),
    auto_approve_followups: formData.get('auto_approve_followups') === 'on',
    require_inbox_check_for_followups: formData.get('require_inbox_check_for_followups') === 'on',
    inbox_check_valid_hours: num('inbox_check_valid_hours', 3),
    scout_enabled: formData.get('scout_enabled') === 'on',
    scout_areas: list('scout_areas').map(a => a.toUpperCase()),
    scout_name_regex: str(formData, 'scout_name_regex') || 'sauna',
    scan_max_per_run: num('scan_max_per_run', 6),
    write_max_per_run: num('write_max_per_run', 5),
    max_pending_drafts: num('max_pending_drafts', 20),
  }
  if (!EMAIL_RE.test(patch.sender_email || '')) return { ok: false, error: 'Sender email is not valid.' }
  try { new Intl.DateTimeFormat('en-US', { timeZone: patch.timezone }) } catch { return { ok: false, error: 'Unknown timezone.' } }
  try {
    await patchSettings(supabase, patch)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save.' }
  }
  revalidateAll()
  return { ok: true }
}

// Plain <form action> wrappers (form actions must return void)
export async function updateProspectForm(formData: FormData) { await updateProspect(formData) }
export async function retryMessage(formData: FormData) { await approveMessage(formData) }
