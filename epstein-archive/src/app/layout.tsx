import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Epstein Files Archive — Public DOJ Document Repository',
  description: 'Searchable, censorship-resistant archive of 370GB+ of Jeffrey Epstein DOJ document releases. Court records, FBI reports, emails, financial documents, and more — distributed via P2P.',
  openGraph: {
    title: 'Epstein Files Archive',
    description: 'Searchable public archive of DOJ Epstein document releases. 1.4M+ files, 3.5M+ pages.',
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
