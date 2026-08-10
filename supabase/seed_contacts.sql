-- Seed the CRM with outreach leads that have verified/known emails.
-- Form-only companies (no public email) stay in the outreach kit, not here.
-- All are cold prospects (opted_in = false). Run once after 003_contacts.sql.

insert into contacts (name, company, email, phone, type, segment, source, opted_in, status) values
  (null, 'SaunaCloud',                    'support@saunacloud.com',   '800-370-0820', 'prospect', 'builder',     'outreach-pilot', false, 'contacted'),
  (null, 'BSaunas USA',                   'info@bsaunasusa.com',      '833-727-0404', 'prospect', 'distributor', 'outreach-pilot', false, 'contacted'),
  (null, 'The Sauna Place',               'sales@saunaplace.com',     '931-525-3504', 'prospect', 'distributor', 'outreach-pilot', false, 'contacted'),
  (null, 'Sweatland',                     'hello@thesweatland.com',   '512-494-4800', 'prospect', 'studio',      'outreach-pilot', false, 'contacted'),
  (null, 'Innovative Saunas & Cellars',   'sales@innovativesnc.net',  '727-877-9067', 'prospect', 'builder',     'outreach-batch2', false, 'new')
on conflict (email) do nothing;
