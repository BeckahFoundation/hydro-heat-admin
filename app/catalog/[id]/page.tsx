import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Flame, ArrowLeft, Phone, Tag, Package } from 'lucide-react'
import ProductGallery from '@/components/ProductGallery'
import InquiryForm from '@/components/InquiryForm'
import { cache } from 'react'
import type { Metadata } from 'next'
import { SITE_URL, SITE_NAME, jsonLd } from '@/lib/site'

export const revalidate = 60

// Shared by generateMetadata and the page so the product is fetched once per request.
const getProduct = cache(async (id: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('products').select('*, categories(name)').eq('id', id).eq('is_active', true).single()
  return data
})

function summarize(text: string | null | undefined, max = 155) {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim()
  return clean.length > max ? clean.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : clean
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params
  const p = await getProduct(id)
  if (!p) return { title: 'Product not found', robots: { index: false } }

  const category = p.categories?.name
  const title = category ? `${p.name} — ${category}` : p.name
  const description = summarize(
    `${p.description ? p.description + ' ' : ''}Trade pricing on request from ${SITE_NAME}.`
  )
  const images = (p.image_urls?.length ? p.image_urls : p.image_url ? [p.image_url] : []).slice(0, 4)

  return {
    title,
    description,
    alternates: { canonical: `/catalog/${p.id}` },
    openGraph: { type: 'website', title, description, url: `/catalog/${p.id}`, images },
  }
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [p, { data: settingsRows }] = await Promise.all([
    getProduct(id),
    supabase.from('settings').select('*'),
  ])

  if (!p) notFound()

  const s: Record<string, string> = {}
  for (const row of settingsRows ?? []) s[row.key] = row.value

  const phone = s.contact_phone || ''
  const companyName = s.company_name || 'Hydro Heat'
  const hasDiscount = p.sale_price && p.sale_price < p.price
  const allImages = (p.image_urls?.length ? p.image_urls : (p.image_url ? [p.image_url] : []))

  // Price stays on request (business policy), so no Offer/price is published.
  const productUrl = `${SITE_URL}/catalog/${p.id}`
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.name,
      url: productUrl,
      ...(p.description ? { description: p.description } : {}),
      ...(p.sku ? { sku: p.sku } : {}),
      ...(allImages.length ? { image: allImages } : {}),
      ...(p.categories?.name ? { category: p.categories.name } : {}),
      brand: { '@type': 'Brand', name: SITE_NAME },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Catalog', item: SITE_URL },
        ...(p.categories?.name
          ? [{
              '@type': 'ListItem', position: 2, name: p.categories.name,
              item: `${SITE_URL}/?category=${encodeURIComponent(p.categories.name)}`,
            }]
          : []),
        { '@type': 'ListItem', position: p.categories?.name ? 3 : 2, name: p.name, item: productUrl },
      ],
    },
  ]

  return (
    <div className="min-h-screen bg-stone-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structuredData)} />
      <header className="bg-gray-900 text-white sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Flame className="text-orange-400" size={24} />
            <span className="font-bold text-lg">{companyName}</span>
          </Link>
          <Link href="/" className="flex items-center gap-1.5 text-gray-300 hover:text-white text-sm transition-colors">
            <ArrowLeft size={16} /> Back to Catalog
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <ProductGallery images={allImages} name={p.name} />

          <div className="flex flex-col">
            {p.categories?.name && (
              <span className="text-sm text-orange-600 font-medium uppercase tracking-wider mb-2">{p.categories.name}</span>
            )}
            <h1 className="text-3xl font-bold text-gray-900 mb-4">{p.name}</h1>

            <div className="flex items-baseline gap-3 mb-6">
              {p.price_on_request ? (
                <span className="text-2xl font-semibold text-orange-600">Price available upon request</span>
              ) : (
                <>
                  <span className="text-4xl font-bold text-gray-900">
                    ${Number(hasDiscount ? p.sale_price : p.price).toFixed(2)}
                  </span>
                  {hasDiscount && (
                    <>
                      <span className="text-xl text-gray-400 line-through">${Number(p.price).toFixed(2)}</span>
                      <span className="bg-orange-100 text-orange-700 text-sm font-semibold px-2 py-0.5 rounded-full">
                        Save ${(Number(p.price) - Number(p.sale_price)).toFixed(2)}
                      </span>
                    </>
                  )}
                </>
              )}
            </div>

            {p.description && <p className="text-gray-600 leading-relaxed mb-6">{p.description}</p>}

            <div className="space-y-2 mb-8">
              {p.sku && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Tag size={14} /> SKU: <span className="font-mono">{p.sku}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Package size={14} />
                {p.stock_quantity > 0
                  ? <span className="text-green-600 font-medium">In Stock ({p.stock_quantity} available)</span>
                  : <span className="text-red-500 font-medium">Out of Stock</span>}
              </div>
            </div>

            <div className="bg-orange-50 rounded-2xl p-6 border border-orange-100">
              <p className="font-semibold text-gray-900 mb-1">Interested in this product?</p>
              <p className="text-sm text-gray-500 mb-4">Tell us about your needs and we&apos;ll send pricing and availability.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <InquiryForm productId={p.id} productName={p.name} />
                {phone && (
                  <a href={`tel:${phone.replace(/\s/g, '')}`}
                    className="flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold px-6 py-3 rounded-xl border border-gray-200 transition-colors text-sm">
                    <Phone size={16} /> {phone}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="bg-gray-950 text-gray-500 text-center text-sm py-6 mt-12">
        © {new Date().getFullYear()} {companyName}. All rights reserved.
      </footer>
    </div>
  )
}
