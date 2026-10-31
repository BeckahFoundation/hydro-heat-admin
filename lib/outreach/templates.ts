// Fallback copy, ported from outreach/templates.py. Used for follow-ups (steps 2-3) and for
// step 1 whenever the model is unavailable. Company voice ("we"), short, no prices.
import type { ContactSegment, OutreachSettings, Prospect } from '@/lib/types'

type Group = 'builders' | 'resellers' | 'operators'

export function groupFor(segment: ContactSegment | null | undefined): Group {
  if (segment === 'distributor') return 'resellers'
  if (segment === 'studio' || segment === 'spa') return 'operators'
  return 'builders'
}

const STEP1: Record<Group, { subject: string; body: string }> = {
  builders: {
    subject: 'Sauna components for {company}',
    body:
      "{greeting}\n\n" +
      "We're Hydro Heat, a US supplier of sauna components for builders and installers. " +
      'Everything ships from our US warehouse: UL/ETL-certified heaters and control systems, ' +
      'sauna doors, benches and backrest frames, lighting, ventilation and sauna rocks.\n\n' +
      "If {company} buys components for the saunas you build, we'd welcome the chance to quote " +
      "your next project. Send us a parts list or the room size and we'll reply with trade pricing " +
      'and availability.\n\n' +
      'Our catalog: {catalog}\n',
  },
  resellers: {
    subject: 'US-stocked sauna components for {company}',
    body:
      "{greeting}\n\n" +
      "We're Hydro Heat, a US supplier of sauna components. We stock UL/ETL-certified heaters " +
      'and control systems, sauna doors, benches, lighting, ventilation, rocks and accessories ' +
      'in our US warehouse, and we work with dealers at trade pricing.\n\n' +
      "If {company} is looking to add or re-source sauna components, we'd be glad to send " +
      'trade pricing on the items that fit your line.\n\n' +
      'Our catalog: {catalog}\n',
  },
  operators: {
    subject: 'Sauna heaters and parts for {company}',
    body:
      "{greeting}\n\n" +
      "We're Hydro Heat, a US supplier of sauna components. We stock UL/ETL-certified heaters " +
      'and control systems, replacement doors, benches, lighting, ventilation and sauna rocks ' +
      'in our US warehouse.\n\n' +
      "If {company} is adding rooms or replacing equipment, tell us what you need and we'll " +
      'reply with trade pricing and availability.\n\n' +
      'Our catalog: {catalog}\n',
  },
}

const STEP2 =
  '{greeting}\n\n' +
  'Following up on our note below. To make it easy, these are the items we can quote fastest: ' +
  'a certified heater with its control system, a sauna door, or benches and backrest frames ' +
  'built to your room size.\n\n' +
  'Is any of those on your list this season? A one-line reply is all we need to send pricing.\n'

const STEP3 =
  '{greeting}\n\n' +
  "We don't want to fill your inbox, so this is our last note. If sauna components aren't something " +
  "{company} buys, just let us know and we won't follow up. If the timing is off, our catalog is " +
  'here whenever you need it: {catalog}\n'

export function signature(s: OutreachSettings): string {
  return (
    '\nBest regards,\n' +
    `${s.sender_name}\n` +
    'Sauna & heat-therapy components, shipped from the US\n' +
    `${s.sender_email} | ${s.catalog_url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}\n`
  )
}

export function footer(s: OutreachSettings): string {
  return (
    '\n--\n' +
    `${s.sender_name}, ${s.postal_address ?? ''}\n` +
    'If you\'d rather not hear from us, reply "no" and we won\'t email you again.\n'
  )
}

export function firstName(p: Prospect): string {
  const n = (p.contact_name || '').trim().split(/\s+/)
  return n[0] && n[0].replace(/\.$/, '').length > 1 ? n[0] : ''
}

export function greeting(p: Prospect): string {
  const fn = firstName(p)
  return fn ? `Hi ${fn},` : `Hello ${p.company || 'there'} team,`
}

function fill(t: string, p: Prospect, s: OutreachSettings): string {
  return t
    .replace(/\{greeting\}/g, greeting(p))
    .replace(/\{company\}/g, p.company || 'your team')
    .replace(/\{catalog\}/g, s.catalog_url)
}

export function renderStep(p: Prospect, step: number, s: OutreachSettings): { subject: string; body: string } {
  if (step === 1) {
    const t = STEP1[groupFor(p.segment)]
    return { subject: fill(t.subject, p, s), body: fill(t.body, p, s) }
  }
  const subject = 'Re: ' + (p.thread_subject || fill(STEP1[groupFor(p.segment)].subject, p, s))
  return { subject, body: fill(step === 2 ? STEP2 : STEP3, p, s) }
}

// Final email text = body + signature + CAN-SPAM footer. Body never includes these.
export function finalText(body: string, s: OutreachSettings): string {
  return body.replace(/\s+$/, '') + '\n' + signature(s) + footer(s)
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}
