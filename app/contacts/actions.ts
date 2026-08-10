'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ContactType, ContactStatus, ContactSegment } from '@/lib/types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function createContact(formData: FormData) {
  const supabase = await createClient()
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, error: 'A valid email address is required.' }
  }
  const payload = {
    name: (formData.get('name') as string)?.trim() || null,
    company: (formData.get('company') as string)?.trim() || null,
    email,
    phone: (formData.get('phone') as string)?.trim() || null,
    type: (formData.get('type') as ContactType) || 'prospect',
    segment: ((formData.get('segment') as string) || null) as ContactSegment | null,
    source: (formData.get('source') as string)?.trim() || null,
    opted_in: formData.get('opted_in') === 'on',
  }
  const { error } = await supabase.from('contacts').insert(payload)
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'That email is already in your contacts.' }
    return { ok: false, error: 'Could not save the contact. Please try again.' }
  }
  revalidatePath('/contacts')
  return { ok: true }
}

export async function updateContact(formData: FormData) {
  const id = formData.get('id') as string
  const supabase = await createClient()
  const update: Record<string, unknown> = {}
  const type = formData.get('type') as ContactType | null
  const status = formData.get('status') as ContactStatus | null
  const segment = formData.get('segment') as string | null
  const optedIn = formData.get('opted_in')
  const notes = formData.get('notes') as string | null
  if (type) update.type = type
  if (status) update.status = status
  if (segment !== null) update.segment = segment || null
  if (optedIn !== null) update.opted_in = optedIn === 'on' || optedIn === 'true'
  if (notes !== null) update.notes = notes
  await supabase.from('contacts').update(update).eq('id', id)
  revalidatePath('/contacts')
}

export async function deleteContact(formData: FormData) {
  const id = formData.get('id') as string
  const supabase = await createClient()
  await supabase.from('contacts').delete().eq('id', id)
  revalidatePath('/contacts')
}

// Paste CSV: columns name,company,email,phone,type,segment,source (header row optional)
export async function importContacts(formData: FormData) {
  const raw = (formData.get('csv') as string) || ''
  const defaultType = (formData.get('type') as ContactType) || 'prospect'
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (!lines.length) return { ok: false, error: 'Nothing to import.' }

  // drop a header row if present
  if (/email/i.test(lines[0]) && /name|company|phone|type/i.test(lines[0])) lines.shift()

  const rows: Record<string, unknown>[] = []
  let skipped = 0
  for (const line of lines) {
    const c = line.split(',').map(s => s.trim())
    const [name, company, email, phone, type, segment, source] = c
    const e = (email || '').toLowerCase()
    if (!e || !EMAIL_RE.test(e)) { skipped++; continue }
    rows.push({
      name: name || null,
      company: company || null,
      email: e,
      phone: phone || null,
      type: (['prospect', 'customer', 'partner'].includes(type) ? type : defaultType),
      segment: (['builder', 'distributor', 'studio', 'spa', 'other'].includes(segment) ? segment : null),
      source: source || 'csv-import',
    })
  }
  if (!rows.length) return { ok: false, error: 'No valid email rows found.' }

  const supabase = await createClient()
  // upsert on email so re-imports don't duplicate
  const { error, count } = await supabase
    .from('contacts')
    .upsert(rows, { onConflict: 'email', ignoreDuplicates: true, count: 'exact' })
  if (error) return { ok: false, error: 'Import failed: ' + error.message }

  revalidatePath('/contacts')
  return { ok: true, imported: count ?? rows.length, skipped }
}
