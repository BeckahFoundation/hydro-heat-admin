// All model calls for outreach live here: step-1 drafting, reply classification and reply
// drafting. Every call degrades gracefully: if there is no API key or the model refuses,
// callers fall back to templates / regex rules and the pipeline keeps running.
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { OutreachMessage, OutreachSettings, Prospect, ReplyClassification } from '@/lib/types'
import { greeting, wordCount } from './templates'

export const MODEL = process.env.OUTREACH_MODEL || 'claude-opus-5-5'

let client: Anthropic | null | undefined
function getClient(): Anthropic | null {
  if (client !== undefined) return client
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) { client = null; return null }
  client = new Anthropic({ timeout: 45_000, maxRetries: 1 })
  return client
}

export function modelAvailable(): boolean {
  return getClient() !== null
}

function systemPrompt(s: OutreachSettings): string {
  return [
    `You write short, plain-text cold emails on behalf of ${s.sender_name}, a US supplier.`,
    '',
    'WHAT WE SELL',
    s.you_sell,
    '',
    'IDEAL CUSTOMER',
    s.ideal_customer,
    '',
    'VERIFIED FACTS (the only claims you may make about us)',
    s.verified_facts,
    '',
    'RULES',
    '- Company voice ("we"). Friendly, direct, no hype, no exclamation marks.',
    '- Under 75 words in the body. One short paragraph for context, one clear ask.',
    '- Reference ONE concrete thing from the prospect\'s own website, quoted or closely paraphrased from the evidence you are given. Never invent details about them.',
    '- Never quote prices, discounts or lead times. Pricing is on request.',
    '- Do not add a greeting line, signature, links or an unsubscribe line: those are added by the system. Start the body with the first sentence after the greeting.',
    '- Subject under 8 words, no clickbait, mention their company name or what they do.',
    '- If the evidence is weak or generic, write a plain, honest email rather than a forced personalisation.',
  ].join('\n')
}

const DraftSchema = z.object({
  subject: z.string(),
  body: z.string(),
  personalisation: z.string().describe('The one detail from their site you referenced, in a few words'),
})

export async function draftStep1(p: Prospect, s: OutreachSettings): Promise<{ subject: string; body: string; model: string; note: string } | null> {
  const c = getClient()
  if (!c) return null
  const signals = (p.signals || []).map(sg => `- ${sg.label}: "${sg.evidence}"`).join('\n') || '- (no signals detected)'
  const user = [
    `Prospect company: ${p.company}`,
    `Segment: ${p.segment || 'unknown'}`,
    p.city || p.state ? `Location: ${[p.city, p.state].filter(Boolean).join(', ')}` : '',
    p.website ? `Website: ${p.website}` : '',
    '',
    'SIGNALS FROM THEIR WEBSITE (evidence is verbatim text from their pages)',
    signals,
    '',
    'EXCERPT OF THEIR SITE',
    (p.site_summary || '').slice(0, 1200) || '(none)',
    '',
    `Write email 1 of a 3-step sequence. The greeting line will be: "${greeting(p)}" (do not repeat it).`,
  ].filter(l => l !== undefined).join('\n')

  try {
    const res = await c.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      system: [{ type: 'text', text: systemPrompt(s), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
      output_config: { effort: 'medium', format: zodOutputFormat(DraftSchema) },
    })
    if (res.stop_reason === 'refusal' || !res.parsed_output) return null
    let { subject, body } = res.parsed_output
    subject = subject.replace(/^re:\s*/i, '').trim().slice(0, 120)
    body = body.trim()
    // strip a greeting the model added anyway
    body = body.replace(/^(hi|hello|dear)\b[^\n]*\n+/i, '').trim()
    if (!subject || wordCount(body) < 15 || wordCount(body) > 110) return null
    return { subject, body: greeting(p) + '\n\n' + body + '\n', model: MODEL, note: res.parsed_output.personalisation }
  } catch (e) {
    if (e instanceof Anthropic.APIError) console.error('[outreach] draft failed', e.status, e.message)
    else console.error('[outreach] draft failed', e)
    return null
  }
}

const ClassSchema = z.object({
  classification: z.enum(['interested', 'objection', 'not_now', 'unsubscribe', 'bounce', 'auto_reply', 'other']),
  summary: z.string().describe('One sentence: what they said'),
})

const NO_WORDS = /^\s*(no|stop|unsubscribe|remove( me)?|not interested|please remove)\b/i

export function classifyByRules(fromEmail: string, subject: string, text: string): ReplyClassification {
  const f = fromEmail.toLowerCase()
  if (/mailer-daemon|postmaster|mail delivery|delivery (status|failure)/i.test(f + ' ' + subject)) return 'bounce'
  if (/undeliverable|delivery (has )?failed|could not be delivered/i.test(subject + ' ' + text.slice(0, 400))) return 'bounce'
  if (/out of (the )?office|auto(-| )?reply|automatic reply|on vacation|away from (my )?(email|desk)/i.test(subject + ' ' + text.slice(0, 400))) return 'auto_reply'
  if (NO_WORDS.test(text)) return 'unsubscribe'
  return 'other'
}

export async function classifyInbound(fromEmail: string, subject: string, text: string): Promise<{ classification: ReplyClassification; summary: string; model: string }> {
  const rules = classifyByRules(fromEmail, subject, text)
  if (rules === 'bounce' || rules === 'auto_reply' || rules === 'unsubscribe') return { classification: rules, summary: '', model: 'rules' }
  const c = getClient()
  if (!c) return { classification: 'other', summary: '', model: 'rules' }
  try {
    const res = await c.messages.parse({
      model: MODEL,
      max_tokens: 512,
      system: 'You classify replies to a B2B cold email from a sauna-components supplier. interested = wants pricing, a quote, a call or more info. objection = pushes back (already have a supplier, too expensive, wrong fit) but is engaging. not_now = polite deferral, maybe later. unsubscribe = asks not to be contacted. bounce = delivery failure. auto_reply = out-of-office or automated. other = anything else.',
      messages: [{ role: 'user', content: `From: ${fromEmail}\nSubject: ${subject}\n\n${text.slice(0, 4000)}` }],
      output_config: { effort: 'low', format: zodOutputFormat(ClassSchema) },
    })
    if (res.stop_reason === 'refusal' || !res.parsed_output) return { classification: 'other', summary: '', model: 'rules' }
    return { ...res.parsed_output, model: MODEL }
  } catch (e) {
    console.error('[outreach] classify failed', e instanceof Anthropic.APIError ? e.message : e)
    return { classification: 'other', summary: '', model: 'rules' }
  }
}

const ReplySchema = z.object({ body: z.string() })

export async function draftReply(p: Prospect, thread: OutreachMessage[], inbound: OutreachMessage, s: OutreachSettings): Promise<{ body: string; model: string } | null> {
  const c = getClient()
  if (!c) return null
  const history = thread
    .filter(m => m.id !== inbound.id && (m.status === 'sent' || m.status === 'received'))
    .slice(-6)
    .map(m => `${m.direction === 'out' ? 'US' : 'THEM'} (${(m.sent_at || m.received_at || m.created_at).slice(0, 10)}):\n${m.body.slice(0, 1500)}`)
    .join('\n\n---\n\n')
  const user = [
    `Prospect: ${p.company}${p.contact_name ? ` (${p.contact_name})` : ''}, segment ${p.segment || 'unknown'}.`,
    `Their latest reply was classified as: ${inbound.classification || 'other'}.`,
    '',
    'CONVERSATION SO FAR',
    history || '(none)',
    '',
    'THEIR LATEST MESSAGE',
    inbound.body.slice(0, 3000),
    '',
    `Write our reply body (plain text, under 120 words). Greeting will be "${greeting(p)}", do not repeat it. ` +
    'Answer what they asked using only the verified facts. If they ask for prices, say we will send trade pricing and ask for the items or room size you need to quote. ' +
    'If they object, acknowledge it honestly and leave the door open without pressure. Do not add a signature.',
  ].join('\n')
  try {
    const res = await c.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      system: [{ type: 'text', text: systemPrompt(s), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
      output_config: { effort: 'medium', format: zodOutputFormat(ReplySchema) },
    })
    if (res.stop_reason === 'refusal' || !res.parsed_output) return null
    let body = res.parsed_output.body.trim().replace(/^(hi|hello|dear)\b[^\n]*\n+/i, '').trim()
    if (wordCount(body) < 5) return null
    body = greeting(p) + '\n\n' + body + '\n'
    return { body, model: MODEL }
  } catch (e) {
    console.error('[outreach] reply draft failed', e instanceof Anthropic.APIError ? e.message : e)
    return null
  }
}
