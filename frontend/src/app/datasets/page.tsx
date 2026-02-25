'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { ArrowRight, Download } from 'lucide-react'
import { siteConfig } from '@/config/site.config'
import { getDataSets, type DataSetInfo, torrentUrl } from '@/lib/api'

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<DataSetInfo[]>([])

  useEffect(() => {
    getDataSets().then(setDatasets).catch(() => {})
  }, [])
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="font-headline text-3xl font-bold text-spill-text-primary">{siteConfig.dataSetsIntro.heading}</h1>
        <p className="mt-2 max-w-2xl text-spill-text-secondary">
          {siteConfig.dataSetsIntro.description.replace('{count}', String(siteConfig.dataSets.length))}
        </p>

        <div className="mt-10 space-y-4">
          {siteConfig.dataSets.map((ds, i) => (
            <Link
              key={ds.id}
              href={`/datasets/${ds.id}`}
              className="group animate-slide-up block rounded-lg border border-spill-divider bg-spill-surface p-5 transition-all hover:border-spill-accent/30 hover:shadow-lg hover:shadow-spill-accent/5"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 rounded bg-spill-accent/15 px-2 py-0.5 font-mono text-sm font-bold text-spill-accent">
                      {ds.id}
                    </span>
                    <h2 className="font-headline text-lg font-semibold text-spill-text-primary group-hover:text-spill-accent transition-colors">
                      {ds.name}
                    </h2>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-spill-text-secondary">
                    {ds.description}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="rounded bg-spill-surface-light px-2 py-0.5 text-xs text-spill-text-secondary">
                    {ds.size}
                  </span>
                  <div className="flex items-center gap-2">
                    {datasets.find(d => d.id === ds.id)?.hasTorrent && (
                      <a
                        href={torrentUrl(ds.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-md p-1 text-spill-text-secondary/40 hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors"
                        title="Download .torrent"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    )}
                    <ArrowRight className="h-4 w-4 text-spill-text-secondary/40 group-hover:text-spill-accent transition-colors" />
                  </div>
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
