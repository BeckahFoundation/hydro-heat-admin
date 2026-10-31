// SMTP sending through the Zoho mailbox (same mailbox the Python script used).
// Env: ZOHO_SMTP_USER, ZOHO_SMTP_PASS (app password), optional ZOHO_SMTP_HOST/PORT.
import nodemailer from 'nodemailer'
import { randomBytes } from 'crypto'

export function smtpConfigured(): boolean {
  return Boolean(process.env.ZOHO_SMTP_USER && process.env.ZOHO_SMTP_PASS)
}

export function newMessageId(domain: string): string {
  return `<${Date.now().toString(36)}.${randomBytes(8).toString('hex')}@${domain}>`
}

export async function sendMail(opts: {
  fromName: string
  fromEmail: string
  to: string
  subject: string
  text: string
  messageId: string
  inReplyTo?: string | null
  references?: string | null
}): Promise<void> {
  const user = process.env.ZOHO_SMTP_USER
  const pass = process.env.ZOHO_SMTP_PASS
  if (!user || !pass) throw new Error('ZOHO_SMTP_USER / ZOHO_SMTP_PASS not set')
  const transport = nodemailer.createTransport({
    host: process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com',
    port: Number(process.env.ZOHO_SMTP_PORT || 465),
    secure: true,
    auth: { user, pass },
    connectionTimeout: 20_000,
    socketTimeout: 30_000,
  })
  await transport.sendMail({
    from: { name: opts.fromName, address: opts.fromEmail },
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    messageId: opts.messageId,
    inReplyTo: opts.inReplyTo || undefined,
    references: opts.references || undefined,
    headers: { 'List-Unsubscribe': `<mailto:${opts.fromEmail}?subject=unsubscribe>` },
  })
}
