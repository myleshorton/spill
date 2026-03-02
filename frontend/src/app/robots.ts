import type { MetadataRoute } from 'next'
import { siteConfig } from '@/config/site.config'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/upload'],
    },
    sitemap: `${siteConfig.siteUrl}/sitemap.xml`,
  }
}
