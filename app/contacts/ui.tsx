'use client'

import { useState, useTransition } from 'react'
import { UserPlus, Upload, Download, Check } from 'lucide-react'
import type { Contact } from '@/lib/types'

type ActionResult = { ok: boolean; error?: string; imported?: number; skipped?: number } | void

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent'

export function AddContactForm({ action }: { action: (fd: FormData) => Promise<ActionResult> }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onSubmit(fd: FormData) {
    setMsg(null); setErr(null)
    start(async () => {
      const r = await action(fd)
      if (r && !r.ok) setErr(r.error || 'Could not save.')
      else { setMsg('Contact added.'); (document.getElementById('add-contact-form') as HTMLFormElement)?.reset() }
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-4"><UserPlus size={16} /> Add a contact</h2>
      <form id="add-contact-form" action={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input name="name" placeholder="Name" className={inputCls} />
          <input name="company" placeholder="Company" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input name="email" type="email" placeholder="Email *" required className={inputCls} />
          <input name="phone" placeholder="Phone" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <select name="type" className={inputCls} defaultValue="prospect">
            <option value="prospect">Prospect</option>
            <option value="customer">Customer</option>
            <option value="partner">Partner</option>
          </select>
          <select name="segment" className={inputCls} defaultValue="">
            <option value="">Segment…</option>
            <option value="builder">Builder</option>
            <option value="distributor">Distributor</option>
            <option value="studio">Studio</option>
            <option value="spa">Spa</option>
            <option value="other">Other</option>
          </select>
        </div>
        <input name="source" placeholder="Source (e.g. website, referral)" className={inputCls} />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" name="opted_in" className="w-4 h-4 accent-orange-600" />
          Opted in to marketing emails
        </label>
        <button type="submit" disabled={pending}
          className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors">
          {pending ? 'Saving…' : 'Add contact'}
        </button>
        {msg && <p className="text-sm text-green-600">{msg}</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </form>
    </div>
  )
}

export function ImportForm({ action }: { action: (fd: FormData) => Promise<ActionResult> }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onSubmit(fd: FormData) {
    setMsg(null); setErr(null)
    start(async () => {
      const r = await action(fd)
      if (r && !r.ok) setErr(r.error || 'Import failed.')
      else if (r && r.ok) { setMsg(`Imported ${r.imported ?? 0}${r.skipped ? `, skipped ${r.skipped} invalid` : ''}.`); (document.getElementById('import-form') as HTMLFormElement)?.reset() }
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-1"><Upload size={16} /> Import CSV</h2>
      <p className="text-xs text-gray-400 mb-3">One per line: <code>name,company,email,phone,type,segment,source</code>. Email required. Re-imports won&apos;t duplicate.</p>
      <form id="import-form" action={onSubmit} className="space-y-3">
        <textarea name="csv" rows={5} placeholder={'Jane Doe,Acme Saunas,jane@acme.com,,prospect,builder,haven-of-heat'} className={inputCls + ' font-mono text-xs'} />
        <div className="flex items-center gap-3">
          <select name="type" className={inputCls + ' max-w-[180px]'} defaultValue="prospect">
            <option value="prospect">Default: Prospect</option>
            <option value="customer">Default: Customer</option>
            <option value="partner">Default: Partner</option>
          </select>
          <button type="submit" disabled={pending}
            className="bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors">
            {pending ? 'Importing…' : 'Import'}
          </button>
        </div>
        {msg && <p className="text-sm text-green-600">{msg}</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </form>
    </div>
  )
}

// Build a Zoho Campaigns–ready CSV from the currently listed contacts, split by mailability.
export function ExportZohoButton({ contacts }: { contacts: Contact[] }) {
  const [open, setOpen] = useState(false)

  function download(list: Contact[], filename: string) {
    const header = ['Email', 'Contact Name', 'Company', 'Phone', 'Type', 'Segment']
    const esc = (v: string) => `"${(v || '').replace(/"/g, '""')}"`
    const body = list.map(c => [c.email, c.name || '', c.company || '', c.phone || '', c.type, c.segment || ''].map(esc).join(','))
    const csv = [header.join(','), ...body].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  const mailable = contacts.filter(c => c.opted_in && c.status !== 'unsubscribed' && c.status !== 'bounced')
  const customers = mailable.filter(c => c.type === 'customer' || c.type === 'partner')
  const prospects = contacts.filter(c => c.type === 'prospect' && c.status !== 'unsubscribed' && c.status !== 'bounced')

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-white border border-gray-200 hover:border-orange-500 hover:text-orange-600 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
        <Download size={16} /> Export for Zoho Campaigns
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-2 z-10">
          <p className="text-xs text-gray-400 px-2 py-1.5">Download a list, then import it into a Zoho Campaigns list and send from there.</p>
          <button onClick={() => download(customers, 'hydroheat-customers-optedin.csv')}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm">
            <span className="font-medium text-gray-900 flex items-center gap-2"><Check size={13} className="text-green-600" /> Customers &amp; partners (opted-in)</span>
            <span className="text-xs text-gray-400">{customers.length} contacts · safe to blast</span>
          </button>
          <button onClick={() => download(prospects, 'hydroheat-prospects.csv')}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm">
            <span className="font-medium text-gray-900">Cold prospects</span>
            <span className="text-xs text-gray-400">{prospects.length} contacts · send throttled / personalized</span>
          </button>
        </div>
      )}
    </div>
  )
}

// Inline type + status quick-edit that submits on change.
export function TypeStatusControls({ contact, action }: { contact: Contact; action: (fd: FormData) => Promise<void> }) {
  const [pending, start] = useTransition()
  function submit(patch: Record<string, string>) {
    const fd = new FormData()
    fd.set('id', contact.id)
    fd.set('type', contact.type)
    fd.set('status', contact.status)
    fd.set('opted_in', contact.opted_in ? 'true' : 'false')
    Object.entries(patch).forEach(([k, v]) => fd.set(k, v))
    start(() => action(fd))
  }
  const sel = 'text-xs border border-gray-200 rounded-md px-1.5 py-1 text-gray-600 bg-white disabled:opacity-50'
  return (
    <div className="flex items-center gap-1.5">
      <select disabled={pending} value={contact.status} onChange={e => submit({ status: e.target.value })} className={sel} title="Status">
        {['new', 'contacted', 'active', 'unsubscribed', 'bounced'].map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  )
}
