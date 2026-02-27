'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import FacetSidebar from '@/components/FacetSidebar'
import DocumentGrid from '@/components/DocumentGrid'
import { searchDocuments, listDocuments, type Document, type SearchResult, formatNumber } from '@/lib/api'
import { Loader2 } from 'lucide-react'

function SearchContent() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q') || ''
  const dataSet = searchParams.get('ds')
  const contentType = searchParams.get('type')
  const category = searchParams.get('cat')
  const offset = parseInt(searchParams.get('offset') || '0')

  const [documents, setDocuments] = useState<Document[]>([])
  const [totalHits, setTotalHits] = useState(0)
  const [facets, setFacets] = useState<SearchResult['facetDistribution']>()
  const [loading, setLoading] = useState(true)
  const [processingTime, setProcessingTime] = useState(0)

  const limit = 40

  useEffect(() => {
    setLoading(true)

    const filters: string[] = []
    if (dataSet) filters.push(`dataSet = ${dataSet}`)
    if (contentType) {
      const types = contentType.split(',')
      if (types.length > 1) {
        filters.push(`(${types.map(t => `contentType = "${t}"`).join(' OR ')})`)
      } else {
        filters.push(`contentType = "${contentType}"`)
      }
    }
    if (category) filters.push(`category = "${category}"`)
    const filterStr = filters.join(' AND ')

    if (query) {
      searchDocuments(query, { limit, offset, filter: filterStr })
        .then((result) => {
          setDocuments(result.hits)
          setTotalHits(result.estimatedTotalHits)
          setFacets(result.facetDistribution)
          setProcessingTime(result.processingTimeMs)
        })
        .catch(() => {
          setDocuments([])
          setTotalHits(0)
        })
        .finally(() => setLoading(false))
    } else {
      listDocuments({
        limit,
        offset,
        dataSet: dataSet ? Number(dataSet) : undefined,
        contentType: contentType || undefined,
        category: category || undefined,
      })
        .then((result) => {
          setDocuments(result.documents)
          setTotalHits(result.total)
        })
        .catch(() => {
          setDocuments([])
          setTotalHits(0)
        })
        .finally(() => setLoading(false))
    }
  }, [query, dataSet, contentType, category, offset])

  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.ceil(totalHits / limit)

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6">
        <FacetSidebar facets={facets} />

        <div className="min-w-0 flex-1">
          {query && (
            <div className="mb-4">
              <h1 className="font-headline text-lg font-bold text-spill-text-primary">
                Results for &ldquo;{query}&rdquo;
              </h1>
              <p className="text-sm text-spill-text-secondary">
                {formatNumber(totalHits)} result{totalHits !== 1 ? 's' : ''}
                {processingTime > 0 && ` in ${processingTime}ms`}
              </p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-spill-accent" />
            </div>
          ) : (
            <>
              <DocumentGrid documents={documents} highlightQuery={query} />

              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                  {currentPage > 1 && (
                    <PaginationLink
                      offset={(currentPage - 2) * limit}
                      label="Previous"
                    />
                  )}
                  <span className="px-3 py-1.5 text-sm text-spill-text-secondary">
                    Page {currentPage} of {formatNumber(totalPages)}
                  </span>
                  {currentPage < totalPages && (
                    <PaginationLink
                      offset={currentPage * limit}
                      label="Next"
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}

function PaginationLink({ offset, label }: { offset: number, label: string }) {
  const searchParams = useSearchParams()

  const href = (() => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('offset', String(offset))
    return `/search?${params.toString()}`
  })()

  return (
    <a
      href={href}
      className="rounded-md border border-spill-divider bg-spill-surface px-4 py-1.5 text-sm text-spill-text-secondary hover:text-spill-accent transition-colors"
    >
      {label}
    </a>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-spill-bg">
        <Loader2 className="h-8 w-8 animate-spin text-spill-accent" />
      </div>
    }>
      <SearchContent />
    </Suspense>
  )
}
