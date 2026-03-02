import type { Metadata } from 'next'
import { siteConfig } from '@/config/site.config'

export const metadata: Metadata = {
  title: siteConfig.dataSetsIntro.heading,
  description: siteConfig.dataSetsIntro.description.replace('{count}', String(siteConfig.dataSets.length)),
}

export default function DatasetsLayout({ children }: { children: React.ReactNode }) {
  return children
}
