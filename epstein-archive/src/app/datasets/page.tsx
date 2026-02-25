'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { ArrowRight } from 'lucide-react'
import { dataSetName, dataSetDescription } from '@/lib/api'

const DATA_SETS = Array.from({ length: 12 }, (_, i) => i + 1)

const SIZES: Record<number, string> = {
  1: '~2.5 GB', 2: '~2.1 GB', 3: '~3.2 GB', 4: '~2.8 GB',
  5: '~1.5 GB', 6: '~0.8 GB', 7: '~0.4 GB', 8: '~0.3 GB',
  9: '~181 GB', 10: '~78.6 GB', 11: '~25.5 GB', 12: '~114 MB',
}

export default function DatasetsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="font-headline text-3xl font-bold text-spill-text-primary">Data Sets</h1>
        <p className="mt-2 max-w-2xl text-spill-text-secondary">
          The DOJ released Epstein investigation materials in 12 data sets, totaling approximately 370GB.
          Each set covers a different facet of the investigation.
        </p>

        <div className="mt-10 space-y-4">
          {DATA_SETS.map((ds, i) => (
            <Link
              key={ds}
              href={`/datasets/${ds}`}
              className="group animate-slide-up block rounded-lg border border-spill-divider bg-spill-surface p-5 transition-all hover:border-spill-accent/30 hover:shadow-lg hover:shadow-spill-accent/5"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 rounded bg-spill-accent/15 px-2 py-0.5 font-mono text-sm font-bold text-spill-accent">
                      {ds}
                    </span>
                    <h2 className="font-headline text-lg font-semibold text-spill-text-primary group-hover:text-spill-accent transition-colors">
                      {dataSetName(ds).replace(/^DS \d+ — /, '')}
                    </h2>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-spill-text-secondary">
                    {dataSetDescription(ds)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="rounded bg-spill-surface-light px-2 py-0.5 text-xs text-spill-text-secondary">
                    {SIZES[ds]}
                  </span>
                  <ArrowRight className="h-4 w-4 text-spill-text-secondary/40 group-hover:text-spill-accent transition-colors" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  )
}
