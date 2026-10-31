'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/outreach', label: 'Today' },
  { href: '/outreach/outbox', label: 'Outbox' },
  { href: '/outreach/conversations', label: 'Conversations' },
  { href: '/outreach/prospects', label: 'Prospects' },
  { href: '/outreach/settings', label: 'Settings' },
]

export default function OutreachNav({ counts }: { counts?: Partial<Record<string, number>> }) {
  const pathname = usePathname()
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {tabs.map(t => {
        const active = t.href === '/outreach' ? pathname === '/outreach' : pathname.startsWith(t.href)
        const n = counts?.[t.href]
        return (
          <Link key={t.href} href={t.href}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-orange-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            {t.label}{n ? <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${active ? 'bg-orange-500' : 'bg-gray-100 text-gray-600'}`}>{n}</span> : null}
          </Link>
        )
      })}
    </div>
  )
}
