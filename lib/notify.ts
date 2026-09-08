// Transactional alert to the Hydro Heat team when a customer submits a pricing request.
// Uses Resend's REST API (no SDK dependency). Fails SAFE: any misconfiguration or
// network error is swallowed and logged so it can NEVER break a customer's submission.

type InquiryAlert = {
  name: string
  email: string
  company?: string | null
  phone?: string | null
  product_name?: string | null
  quantity?: string | null
  message?: string | null
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function notifyNewInquiry(inq: InquiryAlert): Promise<void> {
  const key = process.env.RESEND_API_KEY
  const to = process.env.INQUIRY_ALERT_TO || 'sales@hydroheatco.com'
  const from = process.env.INQUIRY_ALERT_FROM || 'Hydro Heat Alerts <alerts@send.hydroheatco.com>'

  if (!key) {
    console.warn('[notify] RESEND_API_KEY not set — skipping inquiry alert email.')
    return
  }

  const rows: [string, string | null | undefined][] = [
    ['Product', inq.product_name],
    ['Name', inq.name],
    ['Email', inq.email],
    ['Company', inq.company],
    ['Phone', inq.phone],
    ['Quantity / use case', inq.quantity],
    ['Message', inq.message],
  ]
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937">
      <h2 style="margin:0 0 12px">New pricing request</h2>
      <table style="border-collapse:collapse;font-size:14px">
        ${rows
          .filter(([, v]) => v)
          .map(
            ([k, v]) =>
              `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;vertical-align:top">${k}</td>` +
              `<td style="padding:4px 0">${esc(String(v))}</td></tr>`,
          )
          .join('')}
      </table>
      <p style="margin:16px 0 0;font-size:13px;color:#6b7280">
        View it in the admin: https://hydroheatco.com/inquiries
      </p>
    </div>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: inq.email,
        subject: `New pricing request${inq.product_name ? ` — ${inq.product_name}` : ''}`,
        html,
      }),
    })
    if (!res.ok) {
      console.error('[notify] Resend responded', res.status, await res.text().catch(() => ''))
    }
  } catch (e) {
    console.error('[notify] failed to send inquiry alert:', e)
  }
}
