import type { Db } from './db'
import type { OutreachSettings } from '@/lib/types'

export async function getSettings(db: Db): Promise<OutreachSettings> {
  const { data, error } = await db.from('outreach_settings').select('*').eq('id', 1).maybeSingle()
  if (error) throw new Error(`outreach_settings: ${error.message}`)
  if (!data) {
    const { data: created, error: e2 } = await db.from('outreach_settings').insert({ id: 1 }).select('*').single()
    if (e2) throw new Error(`outreach_settings insert: ${e2.message}`)
    return created as OutreachSettings
  }
  return data as OutreachSettings
}

export async function patchSettings(db: Db, patch: Partial<OutreachSettings>) {
  const { error } = await db.from('outreach_settings').update(patch).eq('id', 1)
  if (error) throw new Error(`outreach_settings update: ${error.message}`)
}
