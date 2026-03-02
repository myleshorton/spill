import type { MetadataRoute } from 'next'
import { siteConfig } from '@/config/site.config'

// Dynamic sitemap — generated on each request, not at build time.
// Includes static pages and dataset pages. Document pages are discoverable
// via internal links; with 1M+ docs, enumerating them all in a sitemap
// would be impractical at build time. We can add a separate sitemap index
// route later that generates on-demand if needed.

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.siteUrl

  const entries: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'daily', priority: 1.0 },
    { url: `${base}/search`, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${base}/datasets`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.4 },
  ]

  for (const ds of siteConfig.dataSets) {
    entries.push({
      url: `${base}/datasets/${ds.id}`,
      changeFrequency: 'weekly',
      priority: 0.6,
    })
  }

  return entries
}
