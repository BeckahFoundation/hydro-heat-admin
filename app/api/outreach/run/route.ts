// Cron entry point. Vercel Cron calls GET with "Authorization: Bearer <CRON_SECRET>";
// any other scheduler can do the same (or pass ?key=<CRON_SECRET>).
import type { NextRequest } from 'next/server'
import { runPipeline } from '@/lib/outreach/run'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return Response.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  const header = request.headers.get('authorization') || ''
  const key = request.nextUrl.searchParams.get('key')
  if (header !== `Bearer ${secret}` && key !== secret) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const only = request.nextUrl.searchParams.get('only')?.split(',').filter(Boolean)
  const result = await runPipeline({ trigger: 'cron', budgetMs: 50_000, only: only?.length ? only : undefined })
  return Response.json(result)
}
