#!/usr/bin/env python3
"""Hydro Heat cold outreach — small, personal, approval-gated.

  python3 outreach.py import <file.csv> [--source NAME]   merge leads (dedupe by email)
  python3 outreach.py plan [--new 20]                      build today's batch + preview for approval
  python3 outreach.py send <batch.json> --approved         send exactly that batch (spaced out)
  python3 outreach.py replies                              check inbox: replies + bounces stop the sequence
  python3 outreach.py status                               pipeline counts
  python3 outreach.py test                                 send step-1 sample to sales@ itself

Rules baked in: never more than DAILY_CAP sends/day; replies/bounces/"no" stop a
lead forever; follow-ups thread under the first email; nothing sends without a
planned batch file and --approved. Lead data lives in ./data (git-ignored).

Secrets: the Zoho app password is read from the macOS Keychain
(service "hydroheat-zoho", account sales@hydroheatco.com). Store it with:
  security add-generic-password -s hydroheat-zoho -a sales@hydroheatco.com -w
"""
import csv, json, os, random, re, smtplib, imaplib, email, subprocess, sys, time
from datetime import date, datetime, timedelta
from email.message import EmailMessage
from email.utils import make_msgid, formatdate, parseaddr

import templates as T

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
LEADS = os.path.join(DATA, 'leads.json')
CONFIG = os.path.join(DATA, 'config.json')
BATCHES = os.path.join(DATA, 'batches')

SENDER = 'sales@hydroheatco.com'
SENDER_NAME = 'Hydro Heat'
SMTP_HOST, SMTP_PORT = 'smtp.zoho.com', 465
IMAP_HOST = 'imap.zoho.com'
DAILY_CAP = 30
GAP_SECONDS = (60, 150)  # random pause between sends

STOP_STATUSES = {'replied', 'bounced', 'unsubscribed', 'excluded'}


# ---------- storage ----------
def load_leads():
    if not os.path.exists(LEADS):
        return {}
    with open(LEADS) as f:
        return json.load(f)


def save_leads(leads):
    os.makedirs(DATA, exist_ok=True)
    tmp = LEADS + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(leads, f, indent=1, sort_keys=True)
    os.replace(tmp, LEADS)


def load_config():
    if os.path.exists(CONFIG):
        with open(CONFIG) as f:
            return json.load(f)
    return {}


def password():
    try:
        return subprocess.check_output(
            ['security', 'find-generic-password', '-s', 'hydroheat-zoho', '-a', SENDER, '-w'],
            stderr=subprocess.DEVNULL).decode().strip()
    except subprocess.CalledProcessError:
        sys.exit('No Zoho app password in Keychain. Store it with:\n'
                 f'  security add-generic-password -s hydroheat-zoho -a {SENDER} -w')


EMAIL_RE = re.compile(r'^[^@\s,;]+@[^@\s,;]+\.[a-z]{2,}$', re.I)


# ---------- import ----------
def cmd_import(path, source):
    leads = load_leads()
    added = skipped = 0
    with open(path, newline='') as f:
        for row in csv.DictReader(f):
            em = (row.get('Email') or '').strip().lower()
            if not EMAIL_RE.match(em):
                skipped += 1
                continue
            if em in leads:
                skipped += 1
                continue
            name = (row.get('Contact Name') or row.get('Name') or '').strip()
            if '(' in name:  # e.g. "Mike S. (last name gated)"
                name = name.split('(')[0].strip()
            leads[em] = {
                'email': em,
                'name': name,
                'company': (row.get('Company') or '').strip(),
                'segment': (row.get('Segment') or row.get('Type') or '').strip(),
                'state': (row.get('State') or '').strip(),
                'website': (row.get('Website') or '').strip(),
                'phone': (row.get('Phone') or '').strip(),
                'source': source,
                'status': 'new',
                'step': 0,
                'history': [],
            }
            added += 1
    save_leads(leads)
    print(f'imported {added}, skipped {skipped} (no/invalid email or duplicate). total {len(leads)}')


# ---------- rendering ----------
def first_name(lead):
    n = (lead.get('name') or '').split()
    if n and len(n[0].rstrip('.')) > 1:
        return n[0]
    return ''


def render(lead, step, address):
    g = T.group_for(lead.get('segment'))
    fn = first_name(lead)
    company = lead.get('company') or 'your team'
    greeting = f'Hi {fn},' if fn else f'Hello {company} team,'
    vals = {'greeting': greeting, 'company': company, 'catalog': T.CATALOG}
    if step == 1:
        subject = T.STEP1[g]['subject'].format(**vals)
        body = T.STEP1[g]['body'].format(**vals)
    else:
        subject = 'Re: ' + lead['history'][0]['subject']
        body = (T.STEP2 if step == 2 else T.STEP3).format(**vals)
    body += T.SIGNATURE + T.FOOTER.format(address=address)
    return subject, body


# ---------- plan ----------
def due_step(lead, today):
    if lead['status'] in STOP_STATUSES or lead['step'] >= 3:
        return None
    if lead['step'] == 0:
        return 1
    last = date.fromisoformat(lead['history'][-1]['date'][:10])
    nxt = lead['step'] + 1
    return nxt if today >= last + timedelta(days=T.FOLLOWUP_DAYS[nxt]) else None


def sent_today(leads, today):
    return sum(1 for l in leads.values() for h in l['history'] if h['date'][:10] == today.isoformat())


def cmd_plan(n_new):
    cfg = load_config()
    address = cfg.get('address')
    if not address:
        sys.exit('Set the business postal address first (CAN-SPAM): data/config.json {"address": "..."}')
    leads = load_leads()
    today = date.today()
    room = DAILY_CAP - sent_today(leads, today)
    followups, fresh = [], []
    for l in sorted(leads.values(), key=lambda x: (x.get('source', ''), x['email'])):
        s = due_step(l, today)
        if s and s > 1:
            followups.append((l, s))
        elif s == 1:
            fresh.append((l, 1))
    # Spread new sends across companies/domains: max 1 per domain per batch.
    seen_domains, picked_new = set(), []
    for l, s in fresh:
        d = l['email'].split('@')[1]
        if d in seen_domains:
            continue
        seen_domains.add(d)
        picked_new.append((l, s))
        if len(picked_new) >= n_new:
            break
    batch = (followups + picked_new)[:max(room, 0)]
    if not batch:
        print('Nothing due today.')
        return
    os.makedirs(BATCHES, exist_ok=True)
    stamp = datetime.now().strftime('%Y-%m-%d-%H%M')
    n_follow = sum(1 for _, s in batch if s > 1)
    items, md = [], [f'# Outreach batch {stamp}\n',
                     f'{len(batch)} emails ({n_follow} follow-ups, {len(batch) - n_follow} new)\n']
    for l, s in batch:
        subject, body = render(l, s, address)
        items.append({'email': l['email'], 'step': s, 'subject': subject})
        md.append(f'\n---\n**To:** {l["email"]} ({l.get("company")}, {l.get("state")}) · step {s}\n'
                  f'**Subject:** {subject}\n\n```\n{body}```\n')
    jpath = os.path.join(BATCHES, f'{stamp}.json')
    with open(jpath, 'w') as f:
        json.dump({'created': stamp, 'items': items}, f, indent=1)
    with open(jpath.replace('.json', '.md'), 'w') as f:
        f.write(''.join(md))
    print(f'batch: {jpath}\npreview: {jpath.replace(".json", ".md")}')


# ---------- send ----------
def build_message(lead, step, subject, body):
    msg = EmailMessage()
    msg['From'] = f'{SENDER_NAME} <{SENDER}>'
    msg['To'] = lead['email']
    msg['Subject'] = subject
    msg['Date'] = formatdate(localtime=True)
    mid = make_msgid(domain='hydroheatco.com')
    msg['Message-ID'] = mid
    msg['List-Unsubscribe'] = f'<mailto:{SENDER}?subject=unsubscribe>'
    if step > 1:
        first = lead['history'][0]['message_id']
        refs = ' '.join(h['message_id'] for h in lead['history'])
        msg['In-Reply-To'] = lead['history'][-1]['message_id']
        msg['References'] = refs or first
    msg.set_content(body)
    return msg, mid


def cmd_send(batch_path, approved):
    if not approved:
        sys.exit('Refusing to send without --approved (founder must approve the batch preview).')
    cfg = load_config()
    address = cfg.get('address')
    if not address:
        sys.exit('Missing postal address in data/config.json')
    with open(batch_path) as f:
        batch = json.load(f)
    cmd_replies(quiet=True)  # never follow up someone who just replied
    leads = load_leads()
    today = date.today()
    pw = password()
    sent = 0
    for item in batch['items']:
        l = leads.get(item['email'])
        if not l:
            continue
        if due_step(l, today) != item['step']:
            print(f'skip {l["email"]}: no longer due (status {l["status"]}, step {l["step"]})')
            continue
        if sent_today(leads, today) >= DAILY_CAP:
            print('daily cap reached — stopping')
            break
        subject, body = render(l, item['step'], address)
        msg, mid = build_message(l, item['step'], subject, body)
        try:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=60) as s:
                s.login(SENDER, pw)
                s.send_message(msg)
        except Exception as e:  # stop the whole run on any SMTP problem
            print(f'SMTP error on {l["email"]}: {e} — stopping')
            break
        l['history'].append({'step': item['step'], 'date': datetime.now().isoformat(timespec='seconds'),
                             'subject': subject, 'message_id': mid})
        l['step'] = item['step']
        l['status'] = 'contacted'
        save_leads(leads)
        sent += 1
        print(f'sent step {item["step"]} -> {l["email"]}')
        if item is not batch['items'][-1]:
            time.sleep(random.randint(*GAP_SECONDS))
    print(f'done: {sent} sent')


# ---------- replies / bounces ----------
NO_WORDS = re.compile(r'^\s*(no|stop|unsubscribe|remove( me)?|not interested)\b', re.I)


def cmd_replies(quiet=False):
    leads = load_leads()
    active = {e: l for e, l in leads.items() if l['history']}
    if not active:
        if not quiet:
            print('No emails sent yet.')
        return
    since = min(h['date'][:10] for l in active.values() for h in l['history'])
    since_imap = datetime.fromisoformat(since).strftime('%d-%b-%Y')
    M = imaplib.IMAP4_SSL(IMAP_HOST)
    M.login(SENDER, password())
    changes = []
    for folder in ('INBOX', 'Spam'):
        if M.select(folder, readonly=True)[0] != 'OK':
            continue
        _, data = M.search(None, f'(SINCE {since_imap})')
        for num in data[0].split():
            _, raw = M.fetch(num, '(RFC822)')
            msg = email.message_from_bytes(raw[0][1])
            frm = parseaddr(msg.get('From', ''))[1].lower()
            text = ''
            for part in msg.walk():
                if part.get_content_type() == 'text/plain':
                    text += (part.get_payload(decode=True) or b'').decode(errors='ignore')
            if frm in active and active[frm]['status'] not in STOP_STATUSES:
                new = 'unsubscribed' if NO_WORDS.match(text) else 'replied'
                active[frm]['status'] = new
                changes.append((frm, new, msg.get('Subject', '')))
            elif 'mailer-daemon' in frm or 'postmaster' in frm:
                for e, l in active.items():
                    if e in text.lower() and l['status'] not in STOP_STATUSES:
                        l['status'] = 'bounced'
                        changes.append((e, 'bounced', msg.get('Subject', '')))
    M.logout()
    save_leads(leads)
    if not quiet or changes:
        for e, s, subj in changes:
            print(f'{s.upper():12} {e}  ({subj})')
        if not changes and not quiet:
            print('No new replies or bounces.')


# ---------- status / test ----------
def cmd_status():
    leads = load_leads()
    by = {}
    for l in leads.values():
        k = l['status'] if l['status'] != 'contacted' else f'contacted (step {l["step"]})'
        by[k] = by.get(k, 0) + 1
    print(f'{len(leads)} leads')
    for k in sorted(by):
        print(f'  {k:22} {by[k]}')
    print(f'sent today: {sent_today(leads, date.today())}/{DAILY_CAP}')


def cmd_test():
    address = load_config().get('address') or '(address not set)'
    fake = {'email': SENDER, 'name': 'Test Reader', 'company': 'Example Sauna Co',
            'segment': 'builder', 'history': []}
    subject, body = render(fake, 1, address)
    msg, _ = build_message(fake, 1, '[TEST] ' + subject, body)
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=60) as s:
        s.login(SENDER, password())
        s.send_message(msg)
    print('test sent to', SENDER)


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    c = a[0]
    if c == 'import':
        src = a[a.index('--source') + 1] if '--source' in a else os.path.basename(a[1])
        cmd_import(a[1], src)
    elif c == 'plan':
        cmd_plan(int(a[a.index('--new') + 1]) if '--new' in a else 20)
    elif c == 'send':
        cmd_send(a[1], '--approved' in a)
    elif c == 'replies':
        cmd_replies()
    elif c == 'status':
        cmd_status()
    elif c == 'test':
        cmd_test()
    else:
        sys.exit(__doc__)
