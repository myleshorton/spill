import type { MetadataRoute } from 'next'
import { siteConfig } from '@/config/site.config'

// Dynamic sitemap — generated on each request, not at build time.
// Includes static pages, dataset pages, and top entity pages.

export const dynamic = 'force-dynamic'

const SERVER_API = process.env.ARCHIVER_URL || 'http://localhost:4000'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.siteUrl

  const entries: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'daily', priority: 1.0 },
    { url: `${base}/search`, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${base}/datasets`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/entities`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.4 },
  ]

  for (const ds of siteConfig.dataSets) {
    entries.push({
      url: `${base}/datasets/${ds.id}`,
      changeFrequency: 'weekly',
      priority: 0.6,
    })
  }

  // Top entities
  try {
    const res = await fetch(`${SERVER_API}/api/entities?limit=200`, {
      next: { revalidate: 86400 },
    })
    if (res.ok) {
      const data = await res.json()
      for (const entity of data.entities || []) {
        entries.push({
          url: `${base}/entity/${entity.id}`,
          changeFrequency: 'weekly',
          priority: 0.5,
        })
      }
    }
  } catch {
    // API not available during build — skip entity entries
  }

  return entries
}
