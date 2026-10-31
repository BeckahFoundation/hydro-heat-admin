// Scout: find sauna-related businesses in OpenStreetMap (free, no key). One area per run,
// rotating through settings.scout_areas (ISO 3166-2 codes such as US-WA).
import type { Db } from './db'
import type { OutreachSettings } from '@/lib/types'
import { patchSettings } from './settings'
import { normaliseDomain, normaliseWebsite } from './signals'

const OVERPASS = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter'

type OsmElement = {
  type: 'node' | 'way' | 'relation'
  id: number
  tags?: Record<string, string>
}

export async function runScout(db: Db, s: OutreachSettings): Promise<string> {
  if (!s.scout_enabled) return 'scout disabled'
  const areas = (s.scout_areas || []).filter(Boolean)
  if (!areas.length) return 'no scout areas configured'
  const idx = ((s.scout_cursor || 0) % areas.length + areas.length) % areas.length
  const area = areas[idx]
  await patchSettings(db, { scout_cursor: idx + 1 })

  const safeRegex = (s.scout_name_regex || 'sauna').replace(/"/g, '')
  const query = `[out:json][timeout:50];
area["ISO3166-2"="${area}"]->.a;
(
  nwr["leisure"="sauna"](area.a);
  nwr["amenity"="sauna"](area.a);
  nwr["amenity"="public_bath"](area.a);
  nwr["shop"~"sauna",i](area.a);
  nwr["craft"~"sauna",i](area.a);
  nwr["name"~"${safeRegex}",i](area.a);
);
out tags;`

  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'hydro-heat-outreach/1.0 (contact: sales@hydroheatco.com)' },
    body: 'data=' + encodeURIComponent(query),
    signal: AbortSignal.timeout(55_000),
  })
  if (!res.ok) throw new Error(`Overpass ${res.status} for ${area}`)
  const json = (await res.json()) as { elements?: OsmElement[] }
  const elements = (json.elements || []).filter(e => e.tags?.name)

  let added = 0, seen = 0
  for (const el of elements) {
    const t = el.tags!
    seen++
    const website = normaliseWebsite(t.website || t['contact:website'] || t.url || null)
    const email = (t.email || t['contact:email'] || '').trim().toLowerCase() || null
    if (!website && !email) continue  // nothing to read, nothing to write to
    const row = {
      company: t.name!.trim().slice(0, 200),
      website,
      domain: normaliseDomain(website),
      email,
      phone: (t.phone || t['contact:phone'] || '').trim() || null,
      city: t['addr:city'] || null,
      state: t['addr:state'] || area.replace(/^US-/, ''),
      country: 'US',
      source: 'osm',
      external_id: `osm:${el.type}/${el.id}`,
      status: website ? 'found' : 'qualified',
      signals: website ? [] : [{ key: 'osm_listing', label: 'Listed on OpenStreetMap as a sauna business', evidence: `${t.name} (${t.leisure || t.amenity || t.shop || t.craft || 'name match'})` }],
    }
    const { error } = await db.from('prospects').insert(row)
    if (!error) added++
    else if (error.code !== '23505') throw new Error(`prospects insert: ${error.message}`)
    // 23505 = already known (same osm id, domain or email): skip quietly
  }
  return `${area}: ${seen} places found, ${added} new prospects`
}
