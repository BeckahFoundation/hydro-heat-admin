'use client'

import { useState, useTransition } from 'react'
import { Play, Check, X, RefreshCw, Save, Search, Send, Inbox } from 'lucide-react'
import type { OutreachMessage, Prospect } from '@/lib/types'

type Result = { ok: boolean; error?: string; message?: string; imported?: number; skipped?: number } | void
type Action = (fd: FormData) => Promise<Result>

export const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent'
const btnPrimary = 'inline-flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors'
const btnDark = 'inline-flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors'
const btnGhost = 'inline-flex items-center gap-1.5 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-60 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg transition-colors'

export function RunNowButton({ action, only, label = 'Run now' }: { action: Action; only?: string; label?: string }) {
  const [pending, start] = useTransition()
  const [out, setOut] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  function run() {
    setOut(null); setErr(null)
    start(async () => {
      const fd = new FormData()
      if (only) fd.set('only', only)
      const r = await action(fd)
      if (r && r.message) setOut(r.message)
      if (r && !r.ok) setErr(r.error || 'Run failed')
    })
  }
  return (
    <div>
      <button onClick={run} disabled={pending} className={btnDark}>
        <Play size={14} /> {pending ? 'Running…' : label}
      </button>
      {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
      {out && <pre className="mt-2 text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3 whitespace-pre-wrap max-w-2xl">{out}</pre>}
    </div>
  )
}

export function DraftCard({ m, approve, save, reject, redraft }: {
  m: OutreachMessage & { prospects: Prospect }
  approve: Action; save: Action; reject: (fd: FormData) => Promise<void>; redraft: Action
}) {
  const [subject, setSubject] = useState(m.subject)
  const [body, setBody] = useState(m.body)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const p = m.prospects
  const fd = () => { const f = new FormData(); f.set('id', m.id); f.set('subject', subject); f.set('body', body); return f }
  const call = (a: Action, okMsg: string) => { setMsg(null); setErr(null); start(async () => { const r = await a(fd()); if (r && !r.ok) setErr(r.error || 'Failed'); else setMsg((r && r.message) || okMsg) }) }
  const words = body.trim().split(/\s+/).filter(Boolean).length
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-semibold text-gray-900">{p.company}</p>
          <p className="text-xs text-gray-500">To: {p.email} · {m.kind === 'reply' ? 'reply' : `step ${m.step}`} · drafted by {m.model || 'template'} · {new Date(m.created_at).toLocaleString()}</p>
          {p.website && <a href={p.website} target="_blank" rel="noreferrer" className="text-xs text-orange-600 hover:underline">{p.domain || p.website}</a>}
        </div>
        <SignalChips signals={p.signals} />
      </div>
      <input value={subject} onChange={e => setSubject(e.target.value)} className={inputCls + ' mb-2 font-medium'} />
      <textarea value={body} onChange={e => setBody(e.target.value)} rows={Math.min(14, Math.max(6, body.split('\n').length + 1))} className={inputCls + ' font-mono text-xs leading-relaxed'} />
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button disabled={pending} onClick={() => call(approve, 'Approved. It goes out at the next send slot.')} className={btnPrimary}><Check size={14} /> Approve</button>
        <button disabled={pending} onClick={() => call(save, 'Saved.')} className={btnGhost}><Save size={14} /> Save edits</button>
        {m.kind === 'step' && <button disabled={pending} onClick={() => call(redraft, 'Redrafted.')} className={btnGhost}><RefreshCw size={14} /> Redraft</button>}
        <form action={reject} className="ml-auto"><input type="hidden" name="id" value={m.id} /><button disabled={pending} className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg"><X size={14} /> Reject</button></form>
        <span className={`text-xs ${words > 90 ? 'text-red-600' : 'text-gray-400'}`}>{words} words · signature and unsubscribe footer are added on send</span>
      </div>
      {msg && <p className="text-sm text-green-600 mt-2">{msg}</p>}
      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
    </div>
  )
}

export function SignalChips({ signals, max = 4 }: { signals: Prospect['signals']; max?: number }) {
  if (!signals?.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {signals.slice(0, max).map(s => (
        <span key={s.key} title={s.evidence} className={`text-xs px-2 py-0.5 rounded-full border ${s.key === 'competitor' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>{s.label}</span>
      ))}
      {signals.length > max && <span className="text-xs text-gray-400">+{signals.length - max}</span>}
    </div>
  )
}

export function AddProspectForm({ action }: { action: Action }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  function onSubmit(fd: FormData) {
    setMsg(null); setErr(null)
    start(async () => { const r = await action(fd); if (r && !r.ok) setErr(r.error || 'Could not save.'); else { setMsg('Prospect added.'); (document.getElementById('add-prospect') as HTMLFormElement)?.reset() } })
  }
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Add a prospect</h2>
      <form id="add-prospect" action={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input name="company" placeholder="Company *" required className={inputCls} />
          <input name="website" placeholder="Website" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input name="email" type="email" placeholder="Email (found on scan if blank)" className={inputCls} />
          <input name="contact_name" placeholder="Contact name" className={inputCls} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <select name="segment" className={inputCls} defaultValue="">
            <option value="">Segment…</option>
            <option value="builder">Builder</option>
            <option value="distributor">Distributor</option>
            <option value="studio">Studio</option>
            <option value="spa">Spa</option>
            <option value="other">Other</option>
          </select>
          <input name="city" placeholder="City" className={inputCls} />
          <input name="state" placeholder="State" className={inputCls} />
        </div>
        <button type="submit" disabled={pending} className={btnPrimary}>{pending ? 'Saving…' : 'Add prospect'}</button>
        {msg && <p className="text-sm text-green-600">{msg}</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </form>
    </div>
  )
}

export function ImportProspectsForm({ action }: { action: Action }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  function onSubmit(fd: FormData) {
    setMsg(null); setErr(null)
    start(async () => { const r = await action(fd); if (r && !r.ok) setErr(r.error || 'Import failed.'); else if (r) { setMsg(`Imported ${r.imported ?? 0}${r.skipped ? `, skipped ${r.skipped}` : ''}.`); (document.getElementById('import-prospects') as HTMLFormElement)?.reset() } })
  }
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Import CSV</h2>
      <p className="text-xs text-gray-400 mb-3">One per line: <code>company,website,email,contact_name,segment,city,state</code>. Website or email required. Duplicates are skipped.</p>
      <form id="import-prospects" action={onSubmit} className="space-y-3">
        <textarea name="csv" rows={5} placeholder={'Nordic Sauna Builders,https://nordicsaunas.example,,,builder,Portland,OR'} className={inputCls + ' font-mono text-xs'} />
        <button type="submit" disabled={pending} className={btnDark}>{pending ? 'Importing…' : 'Import'}</button>
        {msg && <p className="text-sm text-green-600">{msg}</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </form>
    </div>
  )
}

export function ActionButton({ action, id, label, icon, extra, confirmText }: {
  action: Action | ((fd: FormData) => Promise<void>); id: string; label: string; icon?: 'scan' | 'send' | 'inbox'; extra?: Record<string, string>; confirmText?: string
}) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const Icon = icon === 'scan' ? Search : icon === 'send' ? Send : icon === 'inbox' ? Inbox : null
  function go() {
    if (confirmText && !confirm(confirmText)) return
    setMsg(null)
    start(async () => {
      const fd = new FormData(); fd.set('id', id)
      for (const [k, v] of Object.entries(extra || {})) fd.set(k, v)
      const r = await (action as Action)(fd)
      if (r && r.message) setMsg(r.message)
      else if (r && !r.ok) setMsg(r.error || 'Failed')
    })
  }
  return (
    <span className="inline-flex flex-col items-start">
      <button onClick={go} disabled={pending} className={btnGhost + ' text-xs px-2 py-1'}>{Icon && <Icon size={12} />}{pending ? '…' : label}</button>
      {msg && <span className="text-xs text-gray-500 mt-1 max-w-xs">{msg}</span>}
    </span>
  )
}

export function LogReplyForm({ action, prospectId, email }: { action: Action; prospectId?: string; email?: string }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  function onSubmit(fd: FormData) {
    setMsg(null); setErr(null)
    start(async () => { const r = await action(fd); if (r && !r.ok) setErr(r.error || 'Failed'); else { setMsg((r && r.message) || 'Recorded.'); (document.getElementById('log-reply') as HTMLFormElement)?.reset() } })
  }
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Log a reply</h2>
      <p className="text-xs text-gray-400 mb-3">No IMAP on the free mailbox: paste the reply here. It is classified, the sequence stops, and an answer is drafted for approval.</p>
      <form id="log-reply" action={onSubmit} className="space-y-3">
        {prospectId ? <input type="hidden" name="prospect_id" value={prospectId} /> : <input name="email" type="email" placeholder="Their email address *" required className={inputCls} defaultValue={email} />}
        <input name="subject" placeholder="Subject (optional)" className={inputCls} />
        <textarea name="text" rows={5} required placeholder="Paste the reply text…" className={inputCls} />
        <button type="submit" disabled={pending} className={btnDark}>{pending ? 'Recording…' : 'Record reply'}</button>
        {msg && <p className="text-sm text-green-600">{msg}</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </form>
    </div>
  )
}

export function SettingsForm({ action, children }: { action: Action; children: React.ReactNode }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  function onSubmit(fd: FormData) {
    setMsg(null); setErr(null)
    start(async () => { const r = await action(fd); if (r && !r.ok) setErr(r.error || 'Could not save.'); else setMsg('Settings saved.') })
  }
  return (
    <form action={onSubmit} className="space-y-6">
      {children}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>{pending ? 'Saving…' : 'Save settings'}</button>
        {msg && <p className="text-sm text-green-600">{msg}</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </form>
  )
}
