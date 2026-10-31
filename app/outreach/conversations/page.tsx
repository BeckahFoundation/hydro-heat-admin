import AdminLayout from '@/components/AdminLayout'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Prospect } from '@/lib/types'
import OutreachNav from '../nav'
import { LogReplyForm } from '../ui'
import { logReply, markInboxChecked } from '../actions'
import { getSettings } from '@/lib/outreach/settings'
import { imapConfigured } from '@/lib/outreach/handler'
import { statusColors } from '../status'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // server actions here may call the model, scan a site or run the pipeline


export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view = 'replies' } = await searchParams
  const supabase = await createClient()
  const s = await getSettings(supabase)
  const statuses = view === 'all' ? ['contacted', 'replied', 'interested', 'objection', 'not_now', 'unsubscribed', 'bounced', 'customer'] : ['replied', 'interested', 'objection', 'not_now']
  const { data } = await supabase.from('prospects').select('*').in('status', statuses).order('updated_at', { ascending: false }).limit(200)
  const rows = (data ?? []) as Prospect[]
  const { data: pendingReplies } = await supabase.from('outreach_messages').select('prospect_id').eq('direction', 'out').eq('kind', 'reply').eq('status', 'draft')
  const hasDraft = new Set((pendingReplies ?? []).map(r => r.prospect_id))

  return (
    <AdminLayout>
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Conversations</h1>
        <p className="text-sm text-gray-500 mb-4">Everyone who wrote back, with a drafted answer waiting where the model could help.</p>
        <OutreachNav />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 space-y-3">
            <div className="flex gap-2">
              <Link href="/outreach/conversations" className={`px-3 py-1.5 rounded-lg text-sm font-medium ${view !== 'all' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>Replied</Link>
              <Link href="/outreach/conversations?view=all" className={`px-3 py-1.5 rounded-lg text-sm font-medium ${view === 'all' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>Everyone contacted</Link>
            </div>
            {rows.length === 0 && <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-6">No conversations yet.</p>}
            {rows.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-5 py-3 text-gray-500 font-medium">Prospect</th>
                      <th className="text-left px-5 py-3 text-gray-500 font-medium">Status</th>
                      <th className="text-left px-5 py-3 text-gray-500 font-medium">Step</th>
                      <th className="text-left px-5 py-3 text-gray-500 font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map(p => (
                      <tr key={p.id} className="hover:bg-orange-50">
                        <td className="px-5 py-3">
                          <Link href={`/outreach/conversations/${p.id}`} className="font-medium text-gray-900 hover:text-orange-600">{p.company}</Link>
                          <p className="text-xs text-gray-400">{p.email}</p>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[p.status]}`}>{p.status.replace('_', ' ')}</span>
                          {hasDraft.has(p.id) && <span className="ml-2 text-xs text-red-600 font-medium">answer waits for you</span>}
                        </td>
                        <td className="px-5 py-3 text-gray-500">{p.step}/{s.max_steps}</td>
                        <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{new Date(p.updated_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="space-y-4">
            {!imapConfigured() && (
              <>
                <LogReplyForm action={logReply} />
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                  <h2 className="text-sm font-semibold text-gray-900 mb-1">Inbox check</h2>
                  <p className="text-xs text-gray-400 mb-3">Follow-ups only go out if the inbox was reviewed within {s.inbox_check_valid_hours} hours. Last check: {s.last_inbox_check_at ? new Date(s.last_inbox_check_at).toLocaleString() : 'never'}.</p>
                  <form action={markInboxChecked}><button className="text-sm bg-gray-900 hover:bg-gray-800 text-white font-semibold px-4 py-2 rounded-lg">I checked sales@, nothing new</button></form>
                </div>
              </>
            )}
            {imapConfigured() && <p className="text-xs text-gray-400 bg-white rounded-xl border border-gray-100 p-5">Replies are read over IMAP each run. Last check: {s.last_inbox_check_at ? new Date(s.last_inbox_check_at).toLocaleString() : 'never'}.</p>}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
