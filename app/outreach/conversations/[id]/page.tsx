import AdminLayout from '@/components/AdminLayout'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Globe, Mail, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { OutreachMessage, Prospect, ProspectStatus } from '@/lib/types'
import { DraftCard, LogReplyForm, SignalChips, ActionButton, inputCls } from '../../ui'
import { approveMessage, saveDraft, rejectMessage, redraftMessage, logReply, setProspectStatus, updateProspectForm, scanNow } from '../../actions'
import { statusColors } from '../../status'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // server actions here may call the model, scan a site or run the pipeline

const STATUS_OPTIONS: ProspectStatus[] = ['found', 'qualified', 'no_email', 'skipped', 'contacted', 'replied', 'interested', 'objection', 'not_now', 'unsubscribed', 'bounced', 'customer']

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: pr } = await supabase.from('prospects').select('*').eq('id', id).maybeSingle()
  const p = pr as Prospect | null
  if (!p) notFound()
  const { data: ms } = await supabase.from('outreach_messages').select('*').eq('prospect_id', id).order('created_at', { ascending: true })
  const messages = (ms ?? []) as OutreachMessage[]
  const drafts = messages.filter(m => m.direction === 'out' && m.status === 'draft')
  const timeline = messages.filter(m => m.status === 'sent' || m.status === 'received' || m.status === 'approved' || m.status === 'failed')

  return (
    <AdminLayout>
      <div className="p-8 max-w-5xl">
        <Link href="/outreach/conversations" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4"><ArrowLeft size={14} /> Back</Link>
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{p.company}</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-1">
              {p.email && <span className="inline-flex items-center gap-1"><Mail size={13} /> {p.email}</span>}
              {p.website && <a href={p.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-orange-600 hover:underline"><Globe size={13} /> {p.domain || p.website}</a>}
              {(p.city || p.state) && <span className="inline-flex items-center gap-1"><MapPin size={13} /> {[p.city, p.state].filter(Boolean).join(', ')}</span>}
              <span>source: {p.source}</span>
            </div>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[p.status]}`}>{p.status.replace('_', ' ')} · step {p.step}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            {drafts.map(m => <DraftCard key={m.id} m={{ ...m, prospects: p }} approve={approveMessage} save={saveDraft} reject={rejectMessage} redraft={redraftMessage} />)}

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-4">Thread</h2>
              {timeline.length === 0 && <p className="text-sm text-gray-400">Nothing sent yet.</p>}
              <div className="space-y-4">
                {timeline.map(m => (
                  <div key={m.id} className={`rounded-lg border p-4 ${m.direction === 'in' ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs text-gray-500">
                      <span><span className="font-semibold text-gray-700">{m.direction === 'in' ? 'Them' : 'Us'}</span> · {m.kind === 'reply' ? 'reply' : `step ${m.step}`} · {m.status}{m.classification ? ` · ${m.classification.replace('_', ' ')}` : ''}</span>
                      <span>{new Date(m.sent_at || m.received_at || m.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-800 mb-1">{m.subject}</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{m.body}</p>
                    {m.error && <p className="text-xs text-red-600 mt-2">{m.error}</p>}
                  </div>
                ))}
              </div>
            </div>

            <LogReplyForm action={logReply} prospectId={p.id} />
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">Signals</h2>
              {p.signals?.length ? (
                <ul className="space-y-2">
                  {p.signals.map(sg => (
                    <li key={sg.key} className="text-sm"><span className="font-medium text-gray-800">{sg.label}</span><p className="text-xs text-gray-500 italic">“{sg.evidence}”</p></li>
                  ))}
                </ul>
              ) : <p className="text-sm text-gray-400">None detected{p.website ? '' : ' (no website)'}.</p>}
              <div className="mt-3"><SignalChips signals={[]} />{p.website && <ActionButton action={scanNow} id={p.id} label="Re-scan website" icon="scan" />}</div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">Status</h2>
              <form action={setProspectStatus} className="space-y-2">
                <input type="hidden" name="id" value={p.id} />
                <select name="status" defaultValue={p.status} className={inputCls}>
                  {STATUS_OPTIONS.map(st => <option key={st} value={st}>{st.replace('_', ' ')}</option>)}
                </select>
                <button className="w-full bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-2 rounded-lg">Update status</button>
              </form>
              <p className="text-xs text-gray-400 mt-2">Skipped, unsubscribed, bounced or customer cancels anything queued.</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">Details</h2>
              <form action={updateProspectForm} className="space-y-2">
                <input type="hidden" name="id" value={p.id} />
                <input name="email" defaultValue={p.email ?? ''} placeholder="Email" className={inputCls} />
                <input name="contact_name" defaultValue={p.contact_name ?? ''} placeholder="Contact name" className={inputCls} />
                <select name="segment" defaultValue={p.segment ?? ''} className={inputCls}>
                  <option value="">Segment…</option>
                  {['builder', 'distributor', 'studio', 'spa', 'other'].map(sg => <option key={sg} value={sg}>{sg}</option>)}
                </select>
                <textarea name="notes" defaultValue={p.notes ?? ''} rows={4} placeholder="Notes" className={inputCls} />
                <button className="w-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg">Save details</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
