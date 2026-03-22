import Header from '@/components/Header'
import Footer from '@/components/Footer'
import PoliticalTiesClient from './PoliticalTiesClient'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Political Ties to Epstein — Epstein Files Archive',
  description: 'Ranking current and recent political figures by their documented connections to Jeffrey Epstein, based on archive document mentions and relationship data.',
}

export default function PoliticalTiesPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h1 className="font-headline text-3xl font-bold text-spill-text-primary">
            Political Ties to Epstein
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-spill-text-secondary leading-relaxed">
            Current and recent political figures ranked by their documented connections to Jeffrey Epstein
            in the archive. Rankings are based on document mention counts, relationship data, and nature of
            connection. Appearing in documents does not imply criminal wrongdoing.
          </p>
          <PoliticalTiesClient />
        </div>
      </main>
      <Footer />
    </div>
  )
}
