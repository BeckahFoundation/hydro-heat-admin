import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/site'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Hydro Heat — Sauna Heaters & Sauna Components Supplier',
    template: '%s | Hydro Heat',
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'sauna components', 'sauna heaters', 'sauna supplier', 'wholesale sauna parts',
    'sauna doors', 'sauna benches', 'sauna control panel', 'sauna lighting',
    'sauna ventilation', 'sauna rocks', 'commercial sauna', 'sauna builder supplies',
  ],
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_US',
    url: SITE_URL,
    title: 'Hydro Heat — Sauna Heaters & Sauna Components Supplier',
    description: SITE_DESCRIPTION,
  },
  twitter: { card: 'summary_large_image' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full bg-gray-50`}>{children}</body>
    </html>
  )
}
