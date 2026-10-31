import AdminLayout from '@/components/AdminLayout'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { OutreachMessage, Prospect } from '@/lib/types'
import OutreachNav from '../nav'
import { DraftCard } from '../ui'
import { approveMessage, saveDraft, rejectMessage, redraftMessage, unapproveMessage, retryMessage } from '../actions'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // server actions here may call the model, scan a site or run the pipeline

type Row = OutreachMessage & { prospects: Prospect }

export default async function OutboxPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view = 'drafts' } = await searchParams
  const supabase = await createClient()
  const status = view === 'queued' ? ['approved'] : view === 'sent' ? ['sent'] : view === 'failed' ? ['failed', 'rejected'] : ['draft']
  const { data } = await supabase.from('outreach_messages').select('*, prospects(*)').eq('direction', 'out').in('status', status)
    .order(view === 'sent' ? 'sent_at' : 'created_at', { ascending: view !== 'sent' && view !== 'failed' }).limit(100)
  const rows = (data ?? []) as Row[]
  const { data: counts } = await supabase.from('outreach_messages').select('status').eq('direction', 'out')
  const n = (st: string[]) => (counts ?? []).filter(c => st.includes(c.status)).length

  const tabs = [
    { key: 'drafts', label: 'Waiting on you', count: n(['draft']) },
    { key: 'queued', label: 'Approved, queued', count: n(['approved']) },
    { key: 'sent', label: 'Sent', count: n(['sent']) },
    { key: 'failed', label: 'Failed / rejected', count: n(['failed', 'rejected']) },
  ]

  return (
    <AdminLayout>
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Outbox</h1>
        <p className="text-sm text-gray-500 mb-4">Nothing leaves without your approval. Edit freely; the signature and unsubscribe footer are added on send.</p>
        <OutreachNav counts={{ '/outreach/outbox': n(['draft']) }} />
        <div className="flex gap-2 mb-4">
          {tabs.map(t => (
            <Link key={t.key} href={`/outreach/outbox?view=${t.key}`} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${view === t.key ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
              {t.label} <span className="opacity-70">({t.count})</span>
            </Link>
          ))}
        </div>

        {rows.length === 0 && <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-6">Nothing here.</p>}

        {view === 'drafts' && (
          <div className="space-y-4">
            {rows.map(m => <DraftCard key={m.id} m={m} approve={approveMessage} save={saveDraft} reject={rejectMessage} redraft={redraftMessage} />)}
          </div>
        )}

        {view !== 'drafts' && rows.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">To</th>
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">Subject</th>
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">Step</th>
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">{view === 'sent' ? 'Sent' : 'When'}</th>
                  <th className="text-right px-5 py-3 text-gray-500 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(m => (
                  <tr key={m.id} className="align-top">
                    <td className="px-5 py-3">
                      <Link href={`/outreach/conversations/${m.prospect_id}`} className="font-medium text-gray-900 hover:text-orange-600">{m.prospects?.company}</Link>
                      <p className="text-xs text-gray-400">{m.prospects?.email}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-700">
                      {m.subject}
                      {m.error && <p className="text-xs text-red-600 mt-1">{m.error}</p>}
                    </td>
                    <td className="px-5 py-3 text-gray-500">{m.kind === 'reply' ? 'reply' : m.step}</td>
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{new Date(m.sent_at || m.updated_at).toLocaleString()}</td>
                    <td className="px-5 py-3 text-right">
                      {view === 'queued' && (
                        <form action={unapproveMessage}><input type="hidden" name="id" value={m.id} /><button className="text-xs text-gray-500 hover:text-gray-900">Back to drafts</button></form>
                      )}
                      {view === 'failed' && m.status === 'failed' && (
                        <form action={retryMessage}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="subject" value={m.subject} /><input type="hidden" name="body" value={m.body} /><button className="text-xs text-orange-600 hover:underline">Retry</button></form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
