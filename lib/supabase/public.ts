import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Cookie-free anon client for public, cacheable reads (sitemap). RLS still applies.
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )
}
