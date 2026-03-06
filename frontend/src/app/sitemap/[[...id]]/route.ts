import { siteConfig } from '@/config/site.config'
import { NextResponse } from 'next/server'

// Fully dynamic sitemap index + document sitemaps.
// /sitemap.xml serves the index; /sitemap/0.xml, /sitemap/1.xml etc. serve chunks.

export const dynamic = 'force-dynamic'

const SERVER_API = process.env.ARCHIVER_URL || 'http://localhost:4000'
const DOCS_PER_SITEMAP = 40000
const base = siteConfig.siteUrl

function xmlEscape(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function getTotalDocs(): Promise<number> {
  try {
    const res = await fetch(`${SERVER_API}/api/stats`, { cache: 'no-store' })
    if (res.ok) {
      const stats = await res.json()
      return stats.totalDocuments || 0
    }
  } catch {}
  return 0
}

function buildSitemapIndex(totalDocs: number): string {
  const docChunks = Math.ceil(totalDocs / DOCS_PER_SITEMAP)

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'

  // Static pages sitemap
  xml += `  <sitemap><loc>${xmlEscape(base)}/sitemap/0.xml</loc></sitemap>\n`

  // Document sitemaps
  for (let i = 0; i < docChunks; i++) {
    xml += `  <sitemap><loc>${xmlEscape(base)}/sitemap/${i + 1}.xml</loc></sitemap>\n`
  }

  xml += '</sitemapindex>'
  return xml
}

async function buildStaticSitemap(): Promise<string> {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'

  const staticPages = [
    { url: base, priority: '1.0', freq: 'daily' },
    { url: `${base}/search`, priority: '0.5', freq: 'weekly' },
    { url: `${base}/datasets`, priority: '0.7', freq: 'weekly' },
    { url: `${base}/entities`, priority: '0.7', freq: 'weekly' },
    { url: `${base}/about`, priority: '0.4', freq: 'monthly' },
  ]

  for (const ds of siteConfig.dataSets) {
    staticPages.push({ url: `${base}/datasets/${ds.id}`, priority: '0.6', freq: 'weekly' })
  }

  for (const p of staticPages) {
    xml += `  <url><loc>${xmlEscape(p.url)}</loc><priority>${p.priority}</priority><changefreq>${p.freq}</changefreq></url>\n`
  }

  // Entities
  try {
    const res = await fetch(`${SERVER_API}/api/entities?limit=200`, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      for (const entity of data.entities || []) {
        xml += `  <url><loc>${xmlEscape(base)}/entity/${entity.id}</loc><priority>0.5</priority><changefreq>weekly</changefreq></url>\n`
      }
    }
  } catch {}

  xml += '</urlset>'
  return xml
}

async function buildDocSitemap(chunk: number): Promise<string> {
  const offset = chunk * DOCS_PER_SITEMAP

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'

  try {
    const res = await fetch(
      `${SERVER_API}/api/documents?limit=${DOCS_PER_SITEMAP}&offset=${offset}`,
      { cache: 'no-store' }
    )
    if (res.ok) {
      const data = await res.json()
      for (const doc of data.documents || []) {
        // indexedAt is in milliseconds
        const ts = doc.indexedAt > 1e12 ? doc.indexedAt : doc.indexedAt * 1000
        const lastmod = doc.indexedAt ? new Date(ts).toISOString() : ''
        xml += `  <url><loc>${xmlEscape(base)}/doc/${xmlEscape(doc.id)}</loc><priority>0.3</priority><changefreq>monthly</changefreq>`
        if (lastmod) xml += `<lastmod>${lastmod}</lastmod>`
        xml += `</url>\n`
      }
    }
  } catch {}

  xml += '</urlset>'
  return xml
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id?: string[] }> }
) {
  const { id: segments } = await params

  // /sitemap.xml (no segments) → sitemap index
  if (!segments || segments.length === 0) {
    const totalDocs = await getTotalDocs()
    const xml = buildSitemapIndex(totalDocs)
    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    })
  }

  // /sitemap/N.xml → specific sitemap chunk
  const chunkStr = segments[0].replace('.xml', '')
  const chunk = parseInt(chunkStr, 10)
  if (isNaN(chunk)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const xml = chunk === 0
    ? await buildStaticSitemap()
    : await buildDocSitemap(chunk - 1)

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  })
}
