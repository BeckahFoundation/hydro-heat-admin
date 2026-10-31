import AdminLayout from '@/components/AdminLayout'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Prospect } from '@/lib/types'
import OutreachNav from '../nav'
import { AddProspectForm, ImportProspectsForm, SignalChips, ActionButton, RunNowButton } from '../ui'
import { addProspect, importProspects, scanNow, setProspectStatus, deleteProspect, runNow } from '../actions'
import { statusColors } from '../status'
import DeleteButton from '@/components/DeleteButton'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // server actions here may call the model, scan a site or run the pipeline

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'found', label: 'To scan' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'no_email', label: 'No email' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'skipped', label: 'Skipped' },
]

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status = 'all', q } = await searchParams
  const supabase = await createClient()
  let query = supabase.from('prospects').select('*').order('created_at', { ascending: false }).limit(300)
  if (status !== 'all') query = query.eq('status', status)
  if (q) query = query.or(`company.ilike.%${q}%,email.ilike.%${q}%,domain.ilike.%${q}%`)
  const { data } = await query
  const rows = (data ?? []) as Prospect[]
  const { data: all } = await supabase.from('prospects').select('status')
  const counts: Record<string, number> = { all: all?.length ?? 0 }
  for (const r of all ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-1">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Prospects</h1>
            <p className="text-sm text-gray-500 mt-1">Found on OpenStreetMap, imported, or added by hand. Each website is read once for an email and signals.</p>
          </div>
          <RunNowButton action={runNow} only="prospect" label="Scout & scan now" />
        </div>
        <OutreachNav />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <AddProspectForm action={addProspect} />
          <ImportProspectsForm action={importProspects} />
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {FILTERS.map(f => (
            <Link key={f.key} href={`/outreach/prospects?status=${f.key}`} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${status === f.key ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
              {f.label} <span className="opacity-70">({counts[f.key] ?? 0})</span>
            </Link>
          ))}
          <form className="ml-auto"><input name="q" defaultValue={q} placeholder="Search company, email, domain" className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white" /></form>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">Company</th>
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">Status</th>
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">Segment</th>
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">Signals</th>
                  <th className="text-right px-5 py-3 text-gray-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">No prospects match.</td></tr>}
                {rows.map(p => (
                  <tr key={p.id} className="align-top hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <Link href={`/outreach/conversations/${p.id}`} className="font-medium text-gray-900 hover:text-orange-600">{p.company}</Link>
                      <p className="text-xs text-gray-400">{p.email || <span className="italic">no email</span>}{p.domain ? ` · ${p.domain}` : ''}</p>
                      <p className="text-xs text-gray-400">{[p.city, p.state].filter(Boolean).join(', ')}{p.source ? ` · ${p.source}` : ''}</p>
                    </td>
                    <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[p.status]}`}>{p.status.replace('_', ' ')}</span></td>
                    <td className="px-5 py-3 text-gray-600">{p.segment ?? '—'}</td>
                    <td className="px-5 py-3"><SignalChips signals={p.signals} max={3} /></td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {p.website && (p.status === 'found' || p.status === 'no_email' || p.status === 'skipped') && <ActionButton action={scanNow} id={p.id} label="Scan" icon="scan" />}
                        {p.status === 'skipped' && p.email && <ActionButton action={setProspectStatus} id={p.id} label="Qualify" extra={{ status: 'qualified' }} />}
                        {(p.status === 'found' || p.status === 'qualified' || p.status === 'no_email') && <ActionButton action={setProspectStatus} id={p.id} label="Skip" extra={{ status: 'skipped' }} />}
                        {p.step === 0 && <DeleteButton action={deleteProspect} id={p.id} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
