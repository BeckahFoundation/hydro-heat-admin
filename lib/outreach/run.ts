// One pipeline run, in Harvey's order: handle replies -> send -> write -> prospect -> analyse.
// Each step is isolated; a failure is logged and the next step still runs.
import { adminClient } from './db'
import { getSettings } from './settings'
import { runHandler } from './handler'
import { runSender } from './sender'
import { runWriter } from './planner'
import { runScout } from './scout'
import { runScan } from './scan'
import { getStats } from './stats'
import type { OutreachRunStep } from '@/lib/types'

export type RunOptions = { trigger: 'cron' | 'manual'; budgetMs?: number; only?: string[] }

export async function runPipeline(opts: RunOptions) {
  const db = adminClient()
  const started = Date.now()
  const deadline = started + (opts.budgetMs ?? 50_000)
  const { data: runRow } = await db.from('outreach_runs').insert({ trigger: opts.trigger }).select('id').single()
  const steps: OutreachRunStep[] = []
  let settings = await getSettings(db)
  const wants = (name: string) => !opts.only || opts.only.includes(name)

  const step = async (name: string, fn: () => Promise<string>) => {
    if (!wants(name)) return
    const t = Date.now()
    try {
      const summary = await fn()
      steps.push({ name, ok: true, summary, ms: Date.now() - t })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[outreach] ${name} failed:`, msg)
      steps.push({ name, ok: false, summary: '', error: msg.slice(0, 500), ms: Date.now() - t })
    }
    settings = await getSettings(db) // steps may patch settings (cursor, pause, inbox check)
  }

  if (!settings.enabled && opts.trigger === 'cron') {
    steps.push({ name: 'pipeline', ok: true, summary: 'outreach is switched off; nothing run', ms: 0 })
  } else {
    await step('handle_replies', () => runHandler(db, settings, deadline))
    await step('send', () => runSender(db, settings, deadline))
    await step('write', () => runWriter(db, settings, deadline))
    await step('prospect', async () => {
      const scan = await runScan(db, settings, deadline)
      let scout = 'skipped (out of time)'
      if (Date.now() < deadline - 25_000) scout = await runScout(db, settings)
      return `scan: ${scan} | scout: ${scout}`
    })
    await step('analyze', async () => {
      const st = await getStats(db, settings)
      return `${st.prospectsTotal} prospects, ${st.sentTotal} sent, ${st.repliesTotal} replies, ${st.waitingOnYou} waiting on you`
    })
  }

  const ok = steps.every(s => s.ok)
  if (runRow?.id) {
    await db.from('outreach_runs').update({ finished_at: new Date().toISOString(), ok, steps, error: ok ? null : steps.filter(s => !s.ok).map(s => `${s.name}: ${s.error}`).join('\n') }).eq('id', runRow.id)
  }
  return { ok, steps, ms: Date.now() - started }
}
