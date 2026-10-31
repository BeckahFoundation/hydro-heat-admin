// Signal detection: what a prospect's website tells us, without a model call.
// Each rule yields a short label plus the sentence it matched (the "evidence"), which is
// what the writer is allowed to reference. Nothing here is invented by a model.
import type { ProspectSignal } from '@/lib/types'
import type { ContactSegment } from '@/lib/types'

type Rule = { key: string; label: string; re: RegExp; worth: boolean }

export const RULES: Rule[] = [
  { key: 'builds_custom', label: 'Builds or installs custom saunas', worth: true,
    re: /custom[- ](built )?saunas?|we (build|design|install|construct)|sauna (builder|builders|building|construction|installation|installer|installers|contractor)|design[- ]build/i },
  { key: 'sells_kits', label: 'Sells sauna kits or outdoor saunas', worth: true,
    re: /sauna kits?|barrel saunas?|cabin saunas?|outdoor saunas?|prefab(ricated)? saunas?|indoor saunas?/i },
  { key: 'dealer', label: 'Dealer / wholesale language', worth: true,
    re: /\b(dealer|dealers|distributor|distributors|wholesale|trade pricing|contractor pricing|become a dealer|contractors welcome)\b/i },
  { key: 'heater_brands', label: 'Names specific heater brands', worth: true,
    re: /\b(harvia|huum|saunum|narvi|helo|tyl[oö]|finnleo|sawo|kuuma|amerec|polar|scandia|homecraft)\b/i },
  { key: 'commercial', label: 'Serves commercial or wellness clients', worth: true,
    re: /\b(commercial saunas?|gyms?|fitness (center|centre|club)|hotels?|resorts?|wellness (center|centre|studio)|bathhouse|bath house|banya|athletic club)\b/i },
  { key: 'operator', label: 'Operates a sauna, studio or bathhouse', worth: true,
    re: /\b(book (a|your) (session|sauna)|day pass|memberships?|class schedule|sessions? (start|are) at|open (daily|7 days)|reserve (a|your) (spot|session|sauna))\b/i },
  { key: 'cold_plunge', label: 'Offers cold plunge / contrast therapy', worth: false,
    re: /cold plunge|ice bath|contrast therapy|cold therapy/i },
  { key: 'wood_burning', label: 'Works with wood-burning stoves', worth: false,
    re: /wood[- ](burning|fired) (stove|heater|sauna)|wood stove/i },
  { key: 'imports', label: 'Imports equipment from Europe', worth: false,
    re: /imported from|made in (finland|estonia|sweden|germany)|from finland|finnish[- ]made/i },
  { key: 'online_store', label: 'Has an online store', worth: false,
    re: /add to cart|checkout|shop now|shop all|view cart|free shipping/i },
  { key: 'competitor', label: 'May sell sauna components wholesale (possible competitor)', worth: false,
    re: /wholesale sauna (components|parts|heaters|supplies)|sauna (parts|components|supply) (supplier|distributor|wholesaler)|sauna heater manufacturer/i },
]

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const BAD_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js)$|example\.|sentry|wixpress|godaddy|domain\.com|email\.com|yourdomain|squarespace|shopify|wordpress|@[0-9.]+$/i
const ROLE_PRIORITY = ['sales', 'info', 'hello', 'contact', 'office', 'orders', 'admin', 'support']

export function extractEmails(html: string, text: string): string[] {
  const found = new Set<string>()
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) found.add(decodeURIComponent(m[1]).toLowerCase())
  for (const m of text.matchAll(EMAIL_RE)) found.add(m[0].toLowerCase())
  for (const m of html.matchAll(EMAIL_RE)) found.add(m[0].toLowerCase())
  const ok = [...found].filter(e => !BAD_EMAIL.test(e) && e.length < 80)
  ok.sort((a, b) => rank(a) - rank(b))
  return ok
}

function rank(email: string): number {
  const local = email.split('@')[0]
  const i = ROLE_PRIORITY.findIndex(r => local.startsWith(r))
  return i === -1 ? ROLE_PRIORITY.length : i
}

// First sentence-ish fragment around a match, trimmed, so the writer can quote something real.
function evidenceAround(text: string, index: number, len: number): string {
  const start = Math.max(0, text.lastIndexOf('.', index) + 1, index - 140)
  const endDot = text.indexOf('.', index + len)
  const end = Math.min(text.length, endDot === -1 ? index + len + 140 : endDot + 1, index + len + 160)
  return text.slice(start, end).replace(/\s+/g, ' ').trim()
}

export function detectSignals(text: string): ProspectSignal[] {
  const out: ProspectSignal[] = []
  for (const rule of RULES) {
    const m = rule.re.exec(text)
    if (!m) continue
    out.push({ key: rule.key, label: rule.label, evidence: evidenceAround(text, m.index, m[0].length) })
  }
  return out
}

export function worthContacting(signals: ProspectSignal[]): boolean {
  if (signals.some(s => s.key === 'competitor')) return false
  return signals.some(s => RULES.find(r => r.key === s.key)?.worth)
}

export function guessSegment(signals: ProspectSignal[], text: string): ContactSegment {
  const has = (k: string) => signals.some(s => s.key === k)
  if (has('dealer') && !has('builds_custom')) return 'distributor'
  if (has('builds_custom') || has('sells_kits')) return 'builder'
  if (/\b(spa|day spa|massage)\b/i.test(text) && has('operator')) return 'spa'
  if (has('operator') || has('commercial')) return 'studio'
  return 'other'
}

// Strip HTML to readable text (good enough for regex signals; no DOM dependency).
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article|header|footer)>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .replace(/(\. )+/g, '. ')
    .trim()
}

export function normaliseDomain(website: string | null | undefined): string | null {
  if (!website) return null
  let w = website.trim().toLowerCase()
  if (!w) return null
  if (!/^https?:\/\//.test(w)) w = 'https://' + w
  try {
    const u = new URL(w)
    return u.hostname.replace(/^www\./, '')
  } catch { return null }
}

export function normaliseWebsite(website: string | null | undefined): string | null {
  if (!website) return null
  let w = website.trim()
  if (!w) return null
  if (!/^https?:\/\//i.test(w)) w = 'https://' + w
  try { return new URL(w).toString() } catch { return null }
}
