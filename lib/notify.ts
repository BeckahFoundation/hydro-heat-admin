// Transactional alert to the Hydro Heat team when a customer submits a pricing request.
// Uses Zoho ZeptoMail's REST API (no SDK dependency). Fails SAFE: any misconfiguration
// or network error is swallowed and logged so it can NEVER break a customer's submission.
//
// Env:
//   ZEPTOMAIL_TOKEN     — ZeptoMail "Send Mail" token (with or without the
//                         "Zoho-enczapikey " prefix)
//   INQUIRY_ALERT_TO    — recipient (default sales@hydroheatco.com)
//   INQUIRY_ALERT_FROM  — sender address on the verified domain (default
//                         alerts@hydroheatco.com)

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
  const rawToken = process.env.ZEPTOMAIL_TOKEN
  const to = process.env.INQUIRY_ALERT_TO || 'sales@hydroheatco.com'
  const fromAddress = process.env.INQUIRY_ALERT_FROM || 'alerts@hydroheatco.com'

  if (!rawToken) {
    console.warn('[notify] ZEPTOMAIL_TOKEN not set — skipping inquiry alert email.')
    return
  }
  const authHeader = rawToken.startsWith('Zoho-enczapikey')
    ? rawToken
    : `Zoho-enczapikey ${rawToken}`

  const rows: [string, string | null | undefined][] = [
    ['Product', inq.product_name],
    ['Name', inq.name],
    ['Email', inq.email],
    ['Company', inq.company],
    ['Phone', inq.phone],
    ['Quantity / use case', inq.quantity],
    ['Message', inq.message],
  ]
  const htmlbody = `
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
    const res = await fetch('https://api.zeptomail.com/v1.1/email', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        from: { address: fromAddress, name: 'Hydro Heat Alerts' },
        to: [{ email_address: { address: to, name: 'Hydro Heat' } }],
        reply_to: [{ address: inq.email, name: inq.name }],
        subject: `New pricing request${inq.product_name ? ` — ${inq.product_name}` : ''}`,
        htmlbody,
      }),
    })
    if (!res.ok) {
      console.error('[notify] ZeptoMail responded', res.status, await res.text().catch(() => ''))
    }
  } catch (e) {
    console.error('[notify] failed to send inquiry alert:', e)
  }
}
