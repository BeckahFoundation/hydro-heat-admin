import AdminLayout from '@/components/AdminLayout'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSettings } from '@/lib/outreach/settings'
import { getStats } from '@/lib/outreach/stats'
import { modelAvailable } from '@/lib/outreach/claude'
import { smtpConfigured } from '@/lib/outreach/mailer'
import { imapConfigured } from '@/lib/outreach/handler'
import { inboxCheckFresh } from '@/lib/outreach/sender'
import { Users, Send, MessageSquare, Clock, Power } from 'lucide-react'
import OutreachNav from './nav'
import { RunNowButton } from './ui'
import { runNow, toggleEnabled, clearPause, markInboxChecked } from './actions'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // server actions here may call the model, scan a site or run the pipeline

export default async function OutreachTodayPage() {
  const supabase = await createClient()
  const s = await getSettings(supabase)
  const st = await getStats(supabase, s)

  const tiles = [
    { label: 'Contacts found', value: st.prospectsTotal, sub: `${st.prospectsFoundToday} today · ${st.toScan} to scan`, icon: Users, color: 'bg-blue-500', href: '/outreach/prospects' },
    { label: 'Emails sent', value: st.sentTotal, sub: `${st.sentToday}/${st.window.cap} today (warm-up cap)`, icon: Send, color: 'bg-orange-500', href: '/outreach/outbox?view=sent' },
    { label: 'Conversations', value: st.conversations, sub: `${st.repliesTotal} replies · ${st.interested} interested`, icon: MessageSquare, color: 'bg-green-500', href: '/outreach/conversations' },
    { label: 'Waiting on you', value: st.waitingOnYou, sub: `${st.queued} approved & queued`, icon: Clock, color: st.waitingOnYou ? 'bg-red-500' : 'bg-gray-400', href: '/outreach/outbox' },
  ]

  const checks = [
    { ok: s.enabled, label: s.enabled ? 'Pipeline is on' : 'Pipeline is off (switch it on when you are ready to send)' },
    { ok: Boolean(s.postal_address), label: s.postal_address ? 'Postal address set (CAN-SPAM)' : 'Postal address missing: set it in Settings before anything can send' },
    { ok: smtpConfigured(), label: smtpConfigured() ? 'SMTP configured' : 'SMTP not configured (ZOHO_SMTP_USER / ZOHO_SMTP_PASS)' },
    { ok: modelAvailable(), label: modelAvailable() ? 'Model drafting on' : 'No ANTHROPIC_API_KEY: drafts use templates, replies are not auto-drafted' },
    { ok: imapConfigured() || inboxCheckFresh(s), label: imapConfigured() ? 'IMAP reply reading on' : `Manual inbox mode: last check ${s.last_inbox_check_at ? new Date(s.last_inbox_check_at).toLocaleString() : 'never'} (follow-ups need a check within ${s.inbox_check_valid_hours}h)` },
    { ok: !s.paused_until || new Date(s.paused_until) < new Date(), label: s.paused_until && new Date(s.paused_until) > new Date() ? `Paused until ${new Date(s.paused_until).toLocaleString()}: ${s.pause_reason}` : 'Not throttled' },
  ]

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Outreach</h1>
            <p className="text-sm text-gray-500 mt-1">Finds sauna businesses, drafts one email each, sends only what you approve, and tracks replies.</p>
          </div>
          <div className="flex items-center gap-2">
            <form action={toggleEnabled}>
              <input type="hidden" name="enabled" value={s.enabled ? 'false' : 'true'} />
              <button className={`inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg ${s.enabled ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                <Power size={14} /> {s.enabled ? 'On · click to pause' : 'Off · click to start'}
              </button>
            </form>
            <RunNowButton action={runNow} />
          </div>
        </div>
        <OutreachNav counts={{ '/outreach/outbox': st.waitingOnYou }} />

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
          {tiles.map(({ label, value, sub, icon: Icon, color, href }) => (
            <Link key={label} href={href} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-gray-500">{label}</span>
                <div className={`${color} p-2 rounded-lg`}><Icon className="text-white" size={18} /></div>
              </div>
              <p className="text-3xl font-bold text-gray-900 tabular-nums">{value}</p>
              <p className="text-sm text-gray-400 mt-1">{sub}</p>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-4">Send status</h2>
            <p className={`text-sm font-medium mb-4 ${st.window.blockedBy ? 'text-amber-700' : 'text-green-700'}`}>
              {st.window.blockedBy ? `Not sending right now: ${st.window.blockedBy}` : `Ready to send (${st.sentToday}/${st.window.cap} used today, ${st.queued} queued).`}
            </p>
            <ul className="space-y-2">
              {checks.map(c => (
                <li key={c.label} className="flex items-start gap-2 text-sm">
                  <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${c.ok ? 'bg-green-500' : 'bg-amber-500'}`} />
                  <span className="text-gray-700">{c.label}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 mt-4">
              {!imapConfigured() && (
                <form action={markInboxChecked}><button className="text-sm bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg">I just checked the sales@ inbox</button></form>
              )}
              {s.paused_until && new Date(s.paused_until) > new Date() && (
                <form action={clearPause}><button className="text-sm bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg">Clear throttle pause</button></form>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-4">Order every run: handle replies → send → write → prospect → analyze. Sends {s.send_max_per_run}/run, {s.send_gap_minutes} min apart, quiet {s.quiet_start}:00–{s.quiet_end}:00 {s.timezone}{s.send_weekends ? '' : ', weekdays only'}.</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-4">Recent runs</h2>
            {st.runs.length === 0 && <p className="text-sm text-gray-400">No runs yet. Press “Run now” or wait for the schedule.</p>}
            <ul className="divide-y divide-gray-50">
              {st.runs.map(r => (
                <li key={r.id} className="py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{new Date(r.started_at).toLocaleString()} · {r.trigger}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.ok === false ? 'bg-red-100 text-red-700' : r.ok ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{r.ok === null ? 'running' : r.ok ? 'ok' : 'errors'}</span>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {(r.steps || []).map((st2, i) => (
                      <li key={i} className={`text-xs ${st2.ok ? 'text-gray-500' : 'text-red-600'}`}><span className="font-medium">{st2.name}</span>: {st2.ok ? st2.summary : st2.error}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
