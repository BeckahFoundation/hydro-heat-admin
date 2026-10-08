import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import Image from 'next/image'
import type { Product, Category } from '@/lib/types'
import { Flame, Mail, Phone, ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, jsonLd } from '@/lib/site'

export const revalidate = 60

// Category filters (?category=) are views of the same catalog — one canonical URL.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const { category } = await searchParams
  const supabase = await createClient()

  const [{ data: products }, { data: categories }, { data: settingsRows }] = await Promise.all([
    supabase.from('products').select('*, categories(name)').eq('is_active', true).order('name'),
    supabase.from('categories').select('*').order('name'),
    supabase.from('settings').select('*'),
  ])

  const s: Record<string, string> = {}
  for (const row of settingsRows ?? []) s[row.key] = row.value
  const email = s.contact_email || 'info@hydroheatco.com'
  const phone = s.contact_phone || ''
  const companyName = s.company_name || 'Hydro Heat'
  const tagline = s.company_tagline || 'Sauna Components'

  const filtered = category
    ? (products ?? []).filter((p: Product & { categories: { name: string } | null }) =>
        p.categories?.name === category
      )
    : (products ?? [])

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      email,
      ...(phone ? { telephone: phone } : {}),
      description: SITE_DESCRIPTION,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: SITE_URL,
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Hydro Heat sauna components catalog',
      itemListElement: (products ?? []).map((p: Product, i: number) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/catalog/${p.id}`,
        name: p.name,
      })),
    },
  ]

  return (
    <div className="min-h-screen bg-stone-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structuredData)} />
      {/* Nav */}
      <header className="bg-gray-900 text-white sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="text-orange-400" size={24} />
            <div>
              <span className="font-bold text-lg tracking-tight">{companyName}</span>
              <span className="hidden sm:inline text-gray-400 text-sm ml-2">{tagline}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a href={`mailto:${email}`} className="flex items-center gap-1.5 text-gray-300 hover:text-white transition-colors">
              <Mail size={15} />
              <span className="hidden md:inline">{email}</span>
            </a>
            <Link href="/login" className="text-gray-400 hover:text-white transition-colors text-xs">Admin</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gray-900 text-white py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-orange-600/20 text-orange-400 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
            <Flame size={14} />
            Premium Sauna Components
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Build Your Perfect<br />
            <span className="text-orange-400">Sauna Experience</span>
          </h1>
          <p className="text-gray-300 text-lg max-w-2xl mx-auto mb-8">
            High-quality sauna heaters, benches, doors, accessories, and everything you need to create the ultimate sauna.
          </p>
          <a href="#products" className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold px-8 py-3.5 rounded-full transition-colors">
            Browse Products <ChevronRight size={18} />
          </a>
        </div>
      </section>

      {/* Products */}
      <section id="products" className="max-w-7xl mx-auto px-6 py-16">
        {/* Category filter */}
        <div className="flex flex-wrap gap-2 mb-10">
          <Link
            href="/"
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${!category ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}
          >
            All Products
          </Link>
          {(categories ?? []).map((c: Category) => (
            <Link
              key={c.id}
              href={`/?category=${encodeURIComponent(c.name)}`}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${category === c.name ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}
            >
              {c.name}
            </Link>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">No products found.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((p: Product & { categories: { name: string } | null }) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      {/* Contact */}
      <section className="bg-gray-900 text-white py-16 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Get in Touch</h2>
          <p className="text-gray-400 mb-8">Questions about our products? We're here to help you build the perfect sauna.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href={`mailto:${email}`} className="flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold px-8 py-3.5 rounded-full transition-colors">
              <Mail size={18} /> {email}
            </a>
            {phone && (
              <a href={`tel:${phone.replace(/\s/g, '')}`} className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-3.5 rounded-full transition-colors">
                <Phone size={18} /> {phone}
              </a>
            )}
          </div>
        </div>
      </section>

      <footer className="bg-gray-950 text-gray-500 text-center text-sm py-6">
        © {new Date().getFullYear()} {companyName}. All rights reserved.
      </footer>
    </div>
  )
}

function ProductCard({ product: p }: { product: Product & { categories: { name: string } | null } }) {
  const hasDiscount = p.sale_price && p.sale_price < p.price
  return (
    <Link href={`/catalog/${p.id}`} className="group bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all hover:-translate-y-0.5">
      <div className="aspect-square bg-stone-100 overflow-hidden">
        {p.image_url ? (
          <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Flame className="text-orange-200" size={48} />
          </div>
        )}
      </div>
      <div className="p-4">
        {p.categories?.name && (
          <span className="text-xs text-orange-600 font-medium uppercase tracking-wider">{p.categories.name}</span>
        )}
        <h3 className="font-semibold text-gray-900 mt-1 mb-2 line-clamp-2">{p.name}</h3>
        <div className="flex items-center gap-2">
          {p.price_on_request ? (
            <span className="text-sm font-semibold text-orange-600">Price upon request</span>
          ) : (
            <>
              <span className="text-lg font-bold text-gray-900">
                ${Number(hasDiscount ? p.sale_price : p.price).toFixed(2)}
              </span>
              {hasDiscount && (
                <span className="text-sm text-gray-400 line-through">${Number(p.price).toFixed(2)}</span>
              )}
            </>
          )}
        </div>
        {p.stock_quantity === 0 && (
          <span className="text-xs text-red-500 font-medium mt-1 block">Out of stock</span>
        )}
      </div>
    </Link>
  )
}
