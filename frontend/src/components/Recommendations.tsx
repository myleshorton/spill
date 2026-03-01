'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import DocumentGrid from '@/components/DocumentGrid'
import { getRecommendations, type SimilarDocument } from '@/lib/api'
import { buildResultSetParams, storeResultList } from '@/lib/result-set'

export default function Recommendations() {
  const [docs, setDocs] = useState<SimilarDocument[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getRecommendations(12)
      .then((d) => {
        setDocs(d)
        storeResultList('recs', d.map(doc => doc.id))
      })
      .catch(() => setDocs([]))
      .finally(() => setLoading(false))
  }, [])

  if (!loading && docs.length === 0) return null

  if (loading) {
    return (
      <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-4 w-4 text-spill-accent" />
          <h2 className="font-headline text-xl font-bold text-spill-text-primary">Recommended For You</h2>
        </div>
        <p className="text-sm text-spill-text-secondary mb-6">Loading personalized recommendations...</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-spill-divider bg-spill-surface overflow-hidden animate-pulse">
              <div className="aspect-[4/3] bg-spill-surface-light" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-spill-surface-light rounded w-4/5" />
                <div className="h-3 bg-spill-surface-light rounded w-3/5" />
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="h-4 w-4 text-spill-accent" />
        <h2 className="font-headline text-xl font-bold text-spill-text-primary">Recommended For You</h2>
      </div>
      <p className="text-sm text-spill-text-secondary mb-6">Based on documents you&apos;ve viewed</p>
      <DocumentGrid
        documents={docs}
        resultSetParams={(_doc, i) =>
          buildResultSetParams({ type: 'recs', pos: i, total: docs.length })
        }
      />
    </section>
  )
}
