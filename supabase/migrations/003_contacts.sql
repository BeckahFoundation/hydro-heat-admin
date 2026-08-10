-- CRM contacts: prospects + customers for outreach and product-announcement campaigns.
-- Admin-only (authenticated). Campaign sending/unsubscribe is handled in Zoho Campaigns;
-- this table is Hydro Heat's source of truth and what we sync into Zoho lists.

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text,
  company text,
  email text not null unique,   -- always stored lowercased by the app; enables upsert on conflict
  phone text,
  -- who they are to us
  type text not null default 'prospect' check (type in ('prospect','customer','partner')),
  -- lifecycle
  status text not null default 'new' check (status in ('new','contacted','active','unsubscribed','bounced')),
  -- business segment for targeting
  segment text check (segment in ('builder','distributor','studio','spa','other')),
  tags text[] default '{}',
  source text,                         -- where the lead came from
  opted_in boolean not null default false,  -- explicit marketing opt-in (customers/partners typically true)
  unsubscribe_token uuid not null default gen_random_uuid(),
  notes text,
  last_contacted_at timestamptz,
  synced_to_zoho boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_type_idx on contacts (type);
create index if not exists contacts_status_idx on contacts (status);
create index if not exists contacts_segment_idx on contacts (segment);

alter table contacts enable row level security;

-- Admins only; no anonymous access to the contact list.
drop policy if exists "auth full access on contacts" on contacts;
create policy "auth full access on contacts" on contacts
  for all to authenticated using (true) with check (true);

-- reuse the shared updated_at trigger fn (created in 002_inquiries.sql)
drop trigger if exists contacts_updated_at on contacts;
create trigger contacts_updated_at before update on contacts
  for each row execute function set_updated_at();
