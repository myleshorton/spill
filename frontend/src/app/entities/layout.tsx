import type { Metadata } from 'next'
import { siteConfig } from '@/config/site.config'

export const metadata: Metadata = {
  title: `People & Entities — ${siteConfig.name}`,
  description: `Browse people, organizations, and locations extracted from documents in the ${siteConfig.name}.`,
}

export default function EntitiesLayout({ children }: { children: React.ReactNode }) {
  return children
}
