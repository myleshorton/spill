import type { Metadata } from 'next'
import { siteConfig } from '@/config/site.config'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: {
    default: siteConfig.meta.title,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.meta.description,
  openGraph: {
    title: siteConfig.meta.ogTitle,
    description: siteConfig.meta.ogDescription,
    type: 'website',
    siteName: siteConfig.name,
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.meta.ogTitle,
    description: siteConfig.meta.ogDescription,
  },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
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
