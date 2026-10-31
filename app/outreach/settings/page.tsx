import AdminLayout from '@/components/AdminLayout'
import { createClient } from '@/lib/supabase/server'
import { getSettings } from '@/lib/outreach/settings'
import { MODEL, modelAvailable } from '@/lib/outreach/claude'
import OutreachNav from '../nav'
import { SettingsForm, inputCls } from '../ui'
import { saveOutreachSettings } from '../actions'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // server actions here may call the model, scan a site or run the pipeline

export default async function OutreachSettingsPage() {
  const supabase = await createClient()
  const s = await getSettings(supabase)

  return (
    <AdminLayout>
      <div className="p-8 max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Outreach settings</h1>
        <p className="text-sm text-gray-500 mb-4">What we sell, who we write to, and the guard rails on sending.</p>
        <OutreachNav />
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <SettingsForm action={saveOutreachSettings}>
            <Section title="Pitch (what the writer is allowed to say)">
              <Field label="You sell" name="you_sell" rows={3} defaultValue={s.you_sell} />
              <Field label="Ideal customer" name="ideal_customer" rows={2} defaultValue={s.ideal_customer} />
              <Field label="Verified facts (one per line; the model may not claim anything else)" name="verified_facts" rows={6} defaultValue={s.verified_facts} mono />
              <Field label="Catalog URL" name="catalog_url" defaultValue={s.catalog_url} />
              <p className="text-xs text-gray-400">Drafting model: {modelAvailable() ? MODEL : 'none (ANTHROPIC_API_KEY not set, templates are used)'}. Override with OUTREACH_MODEL.</p>
            </Section>

            <Section title="Sender">
              <div className="grid grid-cols-2 gap-3">
                <Field label="From name" name="sender_name" defaultValue={s.sender_name} />
                <Field label="From email" name="sender_email" defaultValue={s.sender_email} />
              </div>
              <Field label="Business postal address (required by CAN-SPAM, printed in the footer)" name="postal_address" defaultValue={s.postal_address ?? ''} placeholder="123 Main St, Suite 4, Springfield, IL 62701" />
            </Section>

            <Section title="Sending limits">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Timezone" name="timezone" defaultValue={s.timezone} />
                <Field label="Quiet from (hour)" name="quiet_start" type="number" defaultValue={String(s.quiet_start)} />
                <Field label="Quiet until (hour)" name="quiet_end" type="number" defaultValue={String(s.quiet_end)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Minutes between sends" name="send_gap_minutes" type="number" defaultValue={String(s.send_gap_minutes)} />
                <Field label="Sends per run" name="send_max_per_run" type="number" defaultValue={String(s.send_max_per_run)} />
                <Field label="Cap after warm-up (per day)" name="max_daily_cap" type="number" defaultValue={String(s.max_daily_cap)} />
              </div>
              <Field label="Warm-up: one line per stage as 'days_since_first_send, daily_cap'" name="warmup" rows={4} mono defaultValue={(s.warmup || []).map(([d, c]) => `${d}, ${c}`).join('\n')} />
              <Check name="send_weekends" label="Send on weekends" checked={s.send_weekends} />
            </Section>

            <Section title="Sequence">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Steps in the sequence (1-5)" name="max_steps" type="number" defaultValue={String(s.max_steps)} />
                <Field label="Days before each follow-up (comma separated)" name="followup_days" defaultValue={(s.followup_days || []).join(', ')} />
              </div>
              <Check name="auto_approve_followups" label="Queue follow-ups (steps 2+) without approval. Step 1 and replies always need approval." checked={s.auto_approve_followups} />
              <Check name="require_inbox_check_for_followups" label="Hold follow-ups unless the inbox was checked recently (never follow up someone who already replied)" checked={s.require_inbox_check_for_followups} />
              <Field label="Inbox check valid for (hours)" name="inbox_check_valid_hours" type="number" defaultValue={String(s.inbox_check_valid_hours)} />
            </Section>

            <Section title="Prospecting">
              <Check name="scout_enabled" label="Scout OpenStreetMap for new businesses (one area per run)" checked={s.scout_enabled} />
              <Field label="Areas to rotate through (ISO 3166-2 codes, e.g. US-WA US-OR)" name="scout_areas" rows={2} mono defaultValue={(s.scout_areas || []).join(' ')} />
              <Field label="Name match (regex, case-insensitive)" name="scout_name_regex" defaultValue={s.scout_name_regex} mono />
              <div className="grid grid-cols-3 gap-3">
                <Field label="Websites to scan per run" name="scan_max_per_run" type="number" defaultValue={String(s.scan_max_per_run)} />
                <Field label="New drafts per run" name="write_max_per_run" type="number" defaultValue={String(s.write_max_per_run)} />
                <Field label="Max drafts waiting" name="max_pending_drafts" type="number" defaultValue={String(s.max_pending_drafts)} />
              </div>
            </Section>
          </SettingsForm>
        </div>
      </div>
    </AdminLayout>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pb-5 border-b border-gray-100 last:border-0">
      <h2 className="font-semibold text-gray-700 mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, name, defaultValue, type = 'text', rows, mono, placeholder }: { label: string; name: string; defaultValue?: string; type?: string; rows?: number; mono?: boolean; placeholder?: string }) {
  const cls = inputCls + (mono ? ' font-mono text-xs' : '')
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {rows ? <textarea name={name} rows={rows} defaultValue={defaultValue} placeholder={placeholder} className={cls} /> : <input type={type} name={name} defaultValue={defaultValue} placeholder={placeholder} className={cls} />}
    </div>
  )
}

function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex items-start gap-2 text-sm text-gray-700">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5 w-4 h-4 accent-orange-600" />
      {label}
    </label>
  )
}
