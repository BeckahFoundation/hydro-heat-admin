# Hydro Heat — Admin Setup Guide

## 1. Supabase Project

1. Go to [supabase.com](https://supabase.com) → New project
2. Copy your **Project URL** and **anon key** from Settings → API
3. Copy your **service_role key** (keep secret)

### Run the migration

In Supabase → SQL Editor, paste and run `supabase/migrations/001_initial_schema.sql`

### Create Storage Bucket

In Supabase → Storage → New bucket:
- Name: `products`
- Public: ✅ (checked)

Then add this policy for authenticated uploads:
```sql
-- Allow authenticated users to upload
create policy "Authenticated upload" on storage.objects
  for insert with check (bucket_id = 'products' AND auth.role() = 'authenticated');

create policy "Public read" on storage.objects
  for select using (bucket_id = 'products');

create policy "Authenticated delete" on storage.objects
  for delete using (bucket_id = 'products' AND auth.role() = 'authenticated');
```

### Create Admin User

In Supabase → Authentication → Users → Add user:
- Email: your admin email
- Password: strong password

## 2. Local Development

```bash
cp .env.example .env.local
# Fill in your Supabase credentials

npm install
npm run dev
# Open http://localhost:3000
```

## 3. Deploy to Vercel via GitHub

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy → Done!

## Features

| Feature | Location |
|---------|----------|
| Admin login | `/login` |
| Dashboard overview | `/dashboard` |
| Product CRUD + images | `/products` |
| Order management | `/orders` |
| Inventory tracking | `/inventory` |

## 4. Outreach (cold email engine)

Admin → **Outreach**. Replaces the local `outreach/outreach.py` script with a pipeline that runs
inside the app: find sauna businesses → read their website → draft one short email each →
you approve in the Outbox → send under warm-up caps → read replies → draft answers.
Nothing is ever sent without an approved draft and a postal address (CAN-SPAM).

### Run the migration

Supabase → SQL Editor → run `supabase/migrations/004_outreach.sql`.

### Environment variables (Vercel → Settings → Environment Variables)

| Variable | Purpose |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Already required; the worker uses it when run by the scheduler |
| `CRON_SECRET` | Long random string. The scheduler must send `Authorization: Bearer <CRON_SECRET>` to `/api/outreach/run` |
| `ZOHO_SMTP_USER`, `ZOHO_SMTP_PASS` | The sales@ mailbox and its Zoho **app password** (Zoho → My Account → Security → App passwords) |
| `ANTHROPIC_API_KEY` | Optional. With it, step-1 emails are written per prospect from signals found on their site, replies are classified and answers drafted. Without it, templates are used and replies must be answered by hand |
| `OUTREACH_MODEL` | Optional, defaults to `claude-opus-5-5` |
| `ZOHO_IMAP_ENABLED` | `true` only on a paid Zoho plan (IMAP). On the free plan leave it unset and log replies in Conversations |

### Schedule

`vercel.json` registers a cron for `/api/outreach/run` every 15 minutes. **Vercel Hobby only allows
daily crons**, so either upgrade to Pro, or point any external scheduler (cron-job.org, GitHub Actions,
a Mac `launchd` job) at:

```
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/outreach/run
```

Every run does, in order: handle replies → send (max 1 per run, 12 min apart, quiet hours and weekends
off, warm-up cap) → write drafts → scout + scan → analyze. "Run now" on the Outreach page does the same.

### First-time flow

1. Outreach → Settings: fill in the **postal address**, check the pitch and verified facts, save.
2. Prospects: press **Scout & scan now** (or import a CSV). Scanned sites get an email + signals.
3. Outbox: approve, edit or reject each draft. The signature and unsubscribe footer are added on send.
4. Today: switch the pipeline **On**. Approved emails leave at the next allowed slot.
5. Each day, check the sales@ inbox, paste any replies into Conversations (free plan) or let IMAP do it.
   Follow-ups are held until the inbox was checked within 3 hours, so nobody who replied gets chased.

Zoho free throttled the mailbox twice (`550 5.4.6`). The sender detects that, pauses until the next day,
and the warm-up caps (4/day in week one, then 8, 12, 18, then 30) ramp slowly. A dedicated outreach
domain and mailbox is still the real fix for volume.
