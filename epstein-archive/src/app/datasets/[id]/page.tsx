'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import DocumentGrid from '@/components/DocumentGrid'
import { listDocuments, type Document, dataSetName, dataSetDescription, formatNumber } from '@/lib/api'
import { Loader2, ChevronLeft } from 'lucide-react'
import Link from 'next/link'

export default function DataSetDetailPage() {
  const params = useParams()
  const dsId = Number(params.id)
  const [documents, setDocuments] = useState<Document[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const limit = 50

  useEffect(() => {
    setLoading(true)
    listDocuments({ limit, offset, dataSet: dsId })
      .then((result) => {
        setDocuments(result.documents)
        setTotal(result.total)
      })
      .catch(() => {
        setDocuments([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [dsId, offset])

  const totalPages = Math.ceil(total / limit)
  const currentPage = Math.floor(offset / limit) + 1

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <Link
          href="/datasets"
          className="mb-4 inline-flex items-center gap-1 text-sm text-spill-text-secondary hover:text-spill-accent transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          All Data Sets
        </Link>

        <div className="mb-8">
          <div className="flex items-center gap-3">
            <span className="rounded bg-spill-accent/15 px-2 py-0.5 font-mono text-lg font-bold text-spill-accent">
              {dsId}
            </span>
            <h1 className="font-headline text-2xl font-bold text-spill-text-primary">
              {dataSetName(dsId).replace(/^DS \d+ — /, '')}
            </h1>
          </div>
          <p className="mt-2 max-w-3xl text-spill-text-secondary">
            {dataSetDescription(dsId)}
          </p>
          <p className="mt-2 text-sm text-spill-text-secondary/60">
            {formatNumber(total)} files in this data set
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-spill-accent" />
          </div>
        ) : (
          <>
            <DocumentGrid documents={documents} />

            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-3">
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={currentPage <= 1}
                  className="rounded-md border border-spill-divider bg-spill-surface px-4 py-1.5 text-sm text-spill-text-secondary hover:text-spill-accent disabled:opacity-30 transition-colors"
                >
                  Previous
                </button>
                <span className="text-sm text-spill-text-secondary">
                  Page {currentPage} of {formatNumber(totalPages)}
                </span>
                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={currentPage >= totalPages}
                  className="rounded-md border border-spill-divider bg-spill-surface px-4 py-1.5 text-sm text-spill-text-secondary hover:text-spill-accent disabled:opacity-30 transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  )
}
