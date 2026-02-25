'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, FileText, Image, Video, Mail, DollarSign, Plane } from 'lucide-react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import SearchBar from '@/components/SearchBar'
import StatsBar from '@/components/StatsBar'
import { getStats, type ArchiveStats, formatNumber } from '@/lib/api'

const FEATURED_SEARCHES = [
  { label: 'Flight Logs', query: 'flight log manifest', icon: Plane },
  { label: 'Financial Records', query: 'bank account wire transfer', icon: DollarSign },
  { label: 'Email Correspondence', query: 'email correspondence', icon: Mail },
  { label: 'FBI Interviews', query: 'FBI interview summary', icon: FileText },
  { label: 'Photographs', query: 'photograph image seized', icon: Image },
  { label: 'Video Evidence', query: 'video recording', icon: Video },
]

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-spill-accent/[0.03] via-transparent to-transparent" />
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(0, 191, 166, 0.08) 0%, transparent 50%)',
          }} />

          <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-20 sm:px-6 sm:pb-20 sm:pt-28">
            <div className="animate-fade-in text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-spill-divider bg-spill-surface px-3 py-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-spill-accent" />
                <span className="font-mono text-xs text-spill-text-secondary">LIVE P2P ARCHIVE</span>
              </div>

              <h1 className="font-headline text-4xl font-bold leading-tight tracking-tight text-spill-text-primary sm:text-5xl lg:text-6xl">
                Epstein Files
                <span className="block text-spill-accent">Public Archive</span>
              </h1>

              <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-spill-text-secondary">
                Searchable, censorship-resistant archive of the DOJ&apos;s Jeffrey Epstein document releases.
                Court records, FBI reports, emails, financial documents, and seized media — all indexed and freely accessible.
              </p>
            </div>

            <div className="mt-10 animate-slide-up" style={{ animationDelay: '150ms' }}>
              <SearchBar large autoFocus />
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 animate-slide-up" style={{ animationDelay: '250ms' }}>
              {FEATURED_SEARCHES.map((item) => (
                <Link
                  key={item.label}
                  href={`/search?q=${encodeURIComponent(item.query)}`}
                  className="flex items-center gap-1.5 rounded-full border border-spill-divider bg-spill-surface px-3 py-1.5 text-sm text-spill-text-secondary hover:border-spill-accent/30 hover:text-spill-accent transition-all"
                >
                  <item.icon className="h-3 w-3" />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
          <StatsBar />
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
          <h2 className="font-headline text-xl font-bold text-spill-text-primary">Browse by Data Set</h2>
          <p className="mt-1 text-sm text-spill-text-secondary">12 data sets released by the DOJ, totaling ~370GB</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((ds) => (
              <DataSetCard key={ds} ds={ds} />
            ))}
          </div>
        </section>

        <section className="border-t border-spill-divider bg-spill-surface/30">
          <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
            <h2 className="font-headline text-2xl font-bold text-spill-text-primary">
              Why This Archive Exists
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-spill-text-secondary leading-relaxed">
              In 2025, the Department of Justice released over 370GB of documents related to the Jeffrey Epstein investigation.
              These are public records — yet their sheer volume makes them difficult to navigate.
              This archive indexes every document, applies OCR to scanned pages, and makes everything searchable.
              It&apos;s distributed via P2P so no single entity can take it offline.
            </p>
            <Link
              href="/about"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-spill-accent px-5 py-2.5 font-headline text-sm font-semibold text-spill-bg hover:bg-spill-accent-hover transition-colors"
            >
              Learn More <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}

function DataSetCard({ ds }: { ds: number }) {
  const descriptions: Record<number, string> = {
    1: 'FBI Interview Summaries (Part 1)',
    2: 'FBI Interview Summaries (Part 2)',
    3: 'Palm Beach Police Reports (Part 1)',
    4: 'Palm Beach Police Reports (Part 2)',
    5: 'Grand Jury Materials',
    6: 'Victim Statements & Depositions',
    7: 'Search Warrants & Seizure Records',
    8: 'Prosecution Memoranda',
    9: 'Emails & DOJ Correspondence',
    10: 'Seized Images & Videos',
    11: 'Financial Records & Flight Logs',
    12: 'Supplemental Productions',
  }

  const sizes: Record<number, string> = {
    1: '~2.5GB', 2: '~2.1GB', 3: '~3.2GB', 4: '~2.8GB',
    5: '~1.5GB', 6: '~0.8GB', 7: '~0.4GB', 8: '~0.3GB',
    9: '~181GB', 10: '~78.6GB', 11: '~25.5GB', 12: '~114MB',
  }

  return (
    <Link
      href={`/datasets/${ds}`}
      className="group rounded-lg border border-spill-divider bg-spill-surface p-4 transition-all hover:border-spill-accent/30 hover:shadow-lg hover:shadow-spill-accent/5"
    >
      <div className="flex items-start justify-between">
        <span className="font-mono text-xs font-bold text-spill-accent">DS {ds}</span>
        <span className="rounded bg-spill-surface-light px-1.5 py-0.5 text-[10px] text-spill-text-secondary">{sizes[ds]}</span>
      </div>
      <p className="mt-2 font-headline text-sm font-medium text-spill-text-primary group-hover:text-spill-accent transition-colors">
        {descriptions[ds]}
      </p>
      <div className="mt-3 flex items-center gap-1 text-xs text-spill-text-secondary/60 group-hover:text-spill-accent/60 transition-colors">
        Browse files <ArrowRight className="h-3 w-3" />
      </div>
    </Link>
  )
}
