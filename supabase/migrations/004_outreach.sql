-- Outreach engine: prospect discovery, drafting, approval-gated sending, reply handling.
-- Admin-only tables (authenticated). The cron worker uses the service-role key.

-- ---------- settings (single row) ----------
create table if not exists outreach_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,              -- master switch for the cron pipeline
  sender_name text not null default 'Hydro Heat',
  sender_email text not null default 'sales@hydroheatco.com',
  postal_address text,                                 -- CAN-SPAM footer; nothing sends without it
  catalog_url text not null default 'https://www.hydroheatco.com',
  you_sell text not null default 'Sauna components for builders, installers, dealers and operators: UL/ETL-certified heaters and control systems, sauna doors, benches and backrest frames, lighting, ventilation and sauna rocks, all shipped from a US warehouse at trade pricing.',
  ideal_customer text not null default 'US companies that build or install saunas, dealers and distributors that resell sauna equipment, and bathhouse, studio or spa operators that buy replacement heaters and parts.',
  verified_facts text not null default E'- Heaters and control systems are UL/ETL certified.\n- Stock ships from a US warehouse.\n- Pricing is on request (never quote numbers).\n- Trade pricing is available to builders, installers and dealers.\n- Catalog: https://www.hydroheatco.com',
  timezone text not null default 'America/New_York',
  quiet_start int not null default 19,                 -- no sends from this hour (inclusive)...
  quiet_end int not null default 8,                    -- ...until this hour (exclusive), sender timezone
  send_weekends boolean not null default false,
  warmup jsonb not null default '[[7,4],[14,8],[21,12],[28,18]]', -- [[days since first send, daily cap], ...]
  max_daily_cap int not null default 30,               -- cap after warm-up
  send_gap_minutes int not null default 12,            -- minimum minutes between two sends
  send_max_per_run int not null default 1,
  followup_days jsonb not null default '[4,6]',        -- days after step N before step N+1 is due
  max_steps int not null default 3,
  auto_approve_followups boolean not null default false,
  require_inbox_check_for_followups boolean not null default true,
  inbox_check_valid_hours int not null default 3,
  last_inbox_check_at timestamptz,
  scout_enabled boolean not null default true,
  scout_areas jsonb not null default '["US-WA","US-OR","US-CA","US-CO","US-MN","US-WI","US-MI","US-NY","US-MA","US-TX","US-FL","US-UT","US-ID","US-MT"]',
  scout_name_regex text not null default 'sauna|banya|bathhouse|bath house|cold plunge|thermal',
  scout_cursor int not null default 0,
  scan_max_per_run int not null default 6,
  write_max_per_run int not null default 5,
  max_pending_drafts int not null default 20,          -- stop drafting when this many wait for approval
  paused_until timestamptz,
  pause_reason text,
  updated_at timestamptz not null default now()
);
insert into outreach_settings (id) values (1) on conflict (id) do nothing;

alter table outreach_settings enable row level security;
drop policy if exists "auth full access on outreach_settings" on outreach_settings;
create policy "auth full access on outreach_settings" on outreach_settings
  for all to authenticated using (true) with check (true);

drop trigger if exists outreach_settings_updated_at on outreach_settings;
create trigger outreach_settings_updated_at before update on outreach_settings
  for each row execute function set_updated_at();

-- ---------- prospects ----------
create table if not exists prospects (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  website text,
  domain text,                                         -- normalised host, used for dedupe
  email text,                                          -- lowercased
  phone text,
  contact_name text,
  city text,
  state text,
  country text not null default 'US',
  source text not null default 'manual',               -- osm | csv | manual
  external_id text,                                    -- e.g. osm:node/123
  segment text check (segment in ('builder','distributor','studio','spa','other')),
  status text not null default 'found' check (status in (
    'found',        -- discovered, website not read yet
    'qualified',    -- has an email and is worth contacting
    'no_email',     -- website read, no address found (needs a manual email)
    'skipped',      -- founder or scanner decided not to contact
    'contacted',    -- at least one sequence email sent
    'replied',      -- replied, not yet classified
    'interested',
    'objection',
    'not_now',
    'unsubscribed',
    'bounced',
    'customer'
  )),
  step int not null default 0,                         -- last sequence step sent
  signals jsonb not null default '[]',                 -- [{key,label,evidence}]
  site_summary text,
  scanned_at timestamptz,
  last_sent_at timestamptz,
  next_due_at timestamptz,
  thread_subject text,
  notes text,
  contact_id uuid references contacts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists prospects_external_id_idx on prospects (source, external_id) where external_id is not null;
create unique index if not exists prospects_email_idx on prospects (email) where email is not null;
create unique index if not exists prospects_domain_idx on prospects (domain) where domain is not null;
create index if not exists prospects_status_idx on prospects (status);
create index if not exists prospects_next_due_idx on prospects (next_due_at);

alter table prospects enable row level security;
drop policy if exists "auth full access on prospects" on prospects;
create policy "auth full access on prospects" on prospects
  for all to authenticated using (true) with check (true);

drop trigger if exists prospects_updated_at on prospects;
create trigger prospects_updated_at before update on prospects
  for each row execute function set_updated_at();

-- ---------- messages (outbox, sent mail, inbound replies) ----------
create table if not exists outreach_messages (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  direction text not null check (direction in ('out','in')),
  kind text not null default 'step' check (kind in ('step','reply')),
  step int,                                            -- 1..max_steps for sequence emails
  subject text not null,
  body text not null,
  status text not null check (status in ('draft','approved','rejected','sent','failed','received')),
  message_id text,                                     -- RFC 5322 Message-ID
  in_reply_to text,
  references_header text,
  classification text check (classification in ('interested','objection','not_now','unsubscribe','bounce','auto_reply','other')),
  from_email text,
  model text,                                          -- which model drafted it, or 'template'
  error text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outreach_messages_prospect_idx on outreach_messages (prospect_id, created_at);
create index if not exists outreach_messages_status_idx on outreach_messages (direction, status);
create unique index if not exists outreach_messages_message_id_idx on outreach_messages (message_id) where message_id is not null;

alter table outreach_messages enable row level security;
drop policy if exists "auth full access on outreach_messages" on outreach_messages;
create policy "auth full access on outreach_messages" on outreach_messages
  for all to authenticated using (true) with check (true);

drop trigger if exists outreach_messages_updated_at on outreach_messages;
create trigger outreach_messages_updated_at before update on outreach_messages
  for each row execute function set_updated_at();

-- ---------- run log ----------
create table if not exists outreach_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null default 'cron',                -- cron | manual
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  steps jsonb not null default '[]',                   -- [{name, ok, summary, error, ms}]
  error text
);
create index if not exists outreach_runs_started_idx on outreach_runs (started_at desc);

alter table outreach_runs enable row level security;
drop policy if exists "auth full access on outreach_runs" on outreach_runs;
create policy "auth full access on outreach_runs" on outreach_runs
  for all to authenticated using (true) with check (true);
