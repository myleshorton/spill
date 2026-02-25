import type { Metadata } from 'next'
import { siteConfig } from '@/config/site.config'
import './globals.css'

export const metadata: Metadata = {
  title: siteConfig.meta.title,
  description: siteConfig.meta.description,
  openGraph: {
    title: siteConfig.meta.ogTitle,
    description: siteConfig.meta.ogDescription,
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-spill-bg antialiased">
        {children}
      </body>
    </html>
  )
}
