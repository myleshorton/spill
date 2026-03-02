import type { Metadata } from 'next'
import { siteConfig } from '@/config/site.config'

export const metadata: Metadata = {
  title: 'About',
  description: siteConfig.about.intro[0],
}

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children
}
