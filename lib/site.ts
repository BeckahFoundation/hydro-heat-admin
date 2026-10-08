// Public-site constants used for SEO (canonical URLs, sitemap, structured data).
// The apex domain 308-redirects to www, so www is the canonical host.
export const SITE_URL = 'https://www.hydroheatco.com'
export const SITE_NAME = 'Hydro Heat'
export const SITE_DESCRIPTION =
  'Hydro Heat supplies sauna heaters, sauna doors, benches, controls, lighting, ventilation and accessories to sauna builders, distributors, spas and wellness studios. Request trade pricing.'

// Admin-only paths — kept out of search results (robots.ts).
export const PRIVATE_PATHS = [
  '/login',
  '/dashboard',
  '/products',
  '/orders',
  '/inquiries',
  '/contacts',
  '/inventory',
  '/reports',
  '/settings',
]

// Serialize JSON-LD safely for a <script> tag (prevents "</script>" breakout).
export function jsonLd(data: unknown) {
  return { __html: JSON.stringify(data).replace(/</g, '\\u003c') }
}
