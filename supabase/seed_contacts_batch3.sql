-- Batch 3 outreach leads (verified emails, researched 2026-08)
-- Run in Supabase SQL editor (project hyossrbbzzujjhjlveen).
-- Idempotent: upserts on email, never downgrades an existing row's status.

insert into contacts (name, company, email, type, status, segment, source, opted_in, notes)
values
  (null, 'Infrared Sauna Dealer', 'infrared@infraredsaunadealer.com', 'prospect', 'new', 'distributor', 'batch3-research', false, 'US infrared sauna dealer — verified email'),
  (null, 'Cedarbrook Sauna',      'info@cedarbrooksauna.com',         'prospect', 'new', 'builder',     'batch3-research', false, 'Custom sauna builder — verified email'),
  (null, 'Sauna Company USA',     'info@saunacompanyusa.com',         'prospect', 'new', 'distributor', 'batch3-research', false, 'US sauna company — verified email')
on conflict (email) do update
  set company = excluded.company,
      segment = coalesce(contacts.segment, excluded.segment),
      notes   = coalesce(contacts.notes, excluded.notes);

-- Verify:
select email, company, type, status, segment, source from contacts order by created_at desc limit 10;
