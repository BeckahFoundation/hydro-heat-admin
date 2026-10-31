// Service-role Supabase client for the outreach worker (cron route + "Run now").
// Bypasses RLS, so it is only ever used server-side after the caller is authenticated
// (cookie session) or authorised (CRON_SECRET).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type Db = SupabaseClient

export function adminClient(): Db {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
