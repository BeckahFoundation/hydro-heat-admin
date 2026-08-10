import AdminLayout from '@/components/AdminLayout'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import DeleteButton from '@/components/DeleteButton'
import type { Contact } from '@/lib/types'
import { createContact, updateContact, deleteContact, importContacts } from './actions'
import { AddContactForm, ImportForm, ExportZohoButton, TypeStatusControls } from './ui'

const typeColors: Record<string, string> = {
  prospect: 'bg-blue-100 text-blue-700',
  customer: 'bg-green-100 text-green-700',
  partner: 'bg-purple-100 text-purple-700',
}
const statusColors: Record<string, string> = {
  new: 'bg-gray-100 text-gray-600',
  contacted: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  unsubscribed: 'bg-red-100 text-red-600',
  bounced: 'bg-orange-100 text-orange-700',
}

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ type?: string; segment?: string }> }) {
  const { type, segment } = await searchParams
  const supabase = await createClient()

  let query = supabase.from('contacts').select('*').order('created_at', { ascending: false })
  if (type) query = query.eq('type', type)
  if (segment) query = query.eq('segment', segment)
  const { data: contacts } = await query

  const { data: all } = await supabase.from('contacts').select('type, opted_in, status')
  const rows = all ?? []
  const counts = {
    total: rows.length,
    prospect: rows.filter(r => r.type === 'prospect').length,
    customer: rows.filter(r => r.type === 'customer').length,
    partner: rows.filter(r => r.type === 'partner').length,
    mailable: rows.filter(r => r.opted_in && r.status !== 'unsubscribed' && r.status !== 'bounced').length,
  }

  const filters = [
    { label: 'All', href: '/contacts', active: !type && !segment },
    { label: 'Prospects', href: '/contacts?type=prospect', active: type === 'prospect' },
    { label: 'Customers', href: '/contacts?type=customer', active: type === 'customer' },
    { label: 'Partners', href: '/contacts?type=partner', active: type === 'partner' },
  ]

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
            <p className="text-sm text-gray-500 mt-1">Prospects and customers for outreach &amp; product announcements.</p>
          </div>
          <ExportZohoButton contacts={(contacts ?? []) as Contact[]} />
        </div>

        {/* summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { k: 'Total', v: counts.total },
            { k: 'Prospects', v: counts.prospect },
            { k: 'Customers', v: counts.customer },
            { k: 'Partners', v: counts.partner },
            { k: 'Mailable (opted-in)', v: counts.mailable },
          ].map(s => (
            <div key={s.k} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
              <p className="text-xs text-gray-500">{s.k}</p>
              <p className="text-xl font-bold text-gray-900 tabular-nums">{s.v}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <AddContactForm action={createContact} />
          <ImportForm action={importContacts} />
        </div>

        <div className="flex gap-2 mb-4">
          {filters.map(f => (
            <Link key={f.label} href={f.href}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                f.active ? 'bg-orange-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}>
              {f.label}
            </Link>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-3 text-gray-500 font-medium">Contact</th>
                  <th className="text-left px-6 py-3 text-gray-500 font-medium">Type</th>
                  <th className="text-left px-6 py-3 text-gray-500 font-medium">Status</th>
                  <th className="text-left px-6 py-3 text-gray-500 font-medium">Opt-in</th>
                  <th className="text-left px-6 py-3 text-gray-500 font-medium">Segment</th>
                  <th className="text-right px-6 py-3 text-gray-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(contacts ?? []).map((c: Contact) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors align-top">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{c.name || c.company || c.email}</p>
                      <p className="text-xs text-gray-400">{c.email}</p>
                      {c.company && c.name && <p className="text-xs text-gray-400">{c.company}</p>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[c.type]}`}>{c.type}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[c.status]}`}>{c.status}</span>
                    </td>
                    <td className="px-6 py-4">
                      {c.opted_in
                        ? <span className="text-green-600 text-xs font-medium">Opted in</span>
                        : <span className="text-gray-400 text-xs">No</span>}
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-xs">{c.segment || '—'}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <TypeStatusControls contact={c} action={updateContact} />
                        <DeleteButton action={deleteContact} id={c.id} />
                      </div>
                    </td>
                  </tr>
                ))}
                {!contacts?.length && (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">No contacts yet. Add one above or import a CSV.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
