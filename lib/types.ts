export interface Category {
  id: string
  name: string
  created_at: string
}

export interface Product {
  id: string
  name: string
  sku: string | null
  description: string | null
  cost: number
  price: number
  sale_price: number | null
  price_on_request: boolean
  category_id: string | null
  image_url: string | null
  image_urls: string[]
  stock_quantity: number
  low_stock_threshold: number
  is_active: boolean
  created_at: string
  updated_at: string
  categories?: Category
}

export interface Order {
  id: string
  order_number: string
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
  notes: string | null
  total_amount: number
  created_at: string
  updated_at: string
  order_items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string | null
  product_name: string
  quantity: number
  unit_price: number
  created_at: string
  products?: Product
}

export type OrderStatus = Order['status']

export interface Inquiry {
  id: string
  product_id: string | null
  product_name: string | null
  name: string
  email: string
  phone: string | null
  company: string | null
  quantity: string | null
  message: string | null
  status: 'new' | 'contacted' | 'quoted' | 'closed'
  admin_notes: string | null
  created_at: string
  updated_at: string
}

export type InquiryStatus = Inquiry['status']

export interface Contact {
  id: string
  name: string | null
  company: string | null
  email: string
  phone: string | null
  type: 'prospect' | 'customer' | 'partner'
  status: 'new' | 'contacted' | 'active' | 'unsubscribed' | 'bounced'
  segment: 'builder' | 'distributor' | 'studio' | 'spa' | 'other' | null
  tags: string[]
  source: string | null
  opted_in: boolean
  unsubscribe_token: string
  notes: string | null
  last_contacted_at: string | null
  synced_to_zoho: boolean
  created_at: string
  updated_at: string
}

export type ContactType = Contact['type']
export type ContactStatus = Contact['status']
export type ContactSegment = NonNullable<Contact['segment']>

// ---------- outreach ----------
export interface ProspectSignal {
  key: string
  label: string
  evidence: string
}

export type ProspectStatus =
  | 'found' | 'qualified' | 'no_email' | 'skipped' | 'contacted' | 'replied'
  | 'interested' | 'objection' | 'not_now' | 'unsubscribed' | 'bounced' | 'customer'

export interface Prospect {
  id: string
  company: string
  website: string | null
  domain: string | null
  email: string | null
  phone: string | null
  contact_name: string | null
  city: string | null
  state: string | null
  country: string
  source: string
  external_id: string | null
  segment: ContactSegment | null
  status: ProspectStatus
  step: number
  signals: ProspectSignal[]
  site_summary: string | null
  scanned_at: string | null
  last_sent_at: string | null
  next_due_at: string | null
  thread_subject: string | null
  notes: string | null
  contact_id: string | null
  created_at: string
  updated_at: string
}

export type MessageStatus = 'draft' | 'approved' | 'rejected' | 'sent' | 'failed' | 'received'
export type ReplyClassification = 'interested' | 'objection' | 'not_now' | 'unsubscribe' | 'bounce' | 'auto_reply' | 'other'

export interface OutreachMessage {
  id: string
  prospect_id: string
  direction: 'out' | 'in'
  kind: 'step' | 'reply'
  step: number | null
  subject: string
  body: string
  status: MessageStatus
  message_id: string | null
  in_reply_to: string | null
  references_header: string | null
  classification: ReplyClassification | null
  from_email: string | null
  model: string | null
  error: string | null
  scheduled_for: string | null
  sent_at: string | null
  received_at: string | null
  created_at: string
  updated_at: string
  prospects?: Prospect
}

export interface OutreachRunStep {
  name: string
  ok: boolean
  summary: string
  error?: string
  ms: number
}

export interface OutreachRun {
  id: string
  trigger: string
  started_at: string
  finished_at: string | null
  ok: boolean | null
  steps: OutreachRunStep[]
  error: string | null
}

export interface OutreachSettings {
  id: number
  enabled: boolean
  sender_name: string
  sender_email: string
  postal_address: string | null
  catalog_url: string
  you_sell: string
  ideal_customer: string
  verified_facts: string
  timezone: string
  quiet_start: number
  quiet_end: number
  send_weekends: boolean
  warmup: [number, number][]
  max_daily_cap: number
  send_gap_minutes: number
  send_max_per_run: number
  followup_days: number[]
  max_steps: number
  auto_approve_followups: boolean
  require_inbox_check_for_followups: boolean
  inbox_check_valid_hours: number
  last_inbox_check_at: string | null
  scout_enabled: boolean
  scout_areas: string[]
  scout_name_regex: string
  scout_cursor: number
  scan_max_per_run: number
  write_max_per_run: number
  max_pending_drafts: number
  paused_until: string | null
  pause_reason: string | null
  updated_at: string
}
