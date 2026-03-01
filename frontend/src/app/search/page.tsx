'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import FacetSidebar from '@/components/FacetSidebar'
import DocumentGrid from '@/components/DocumentGrid'
import Pagination from '@/components/Pagination'
import { searchDocuments, listDocuments, type Document, type SearchResult, formatNumber } from '@/lib/api'
import { buildResultSetParams } from '@/lib/result-set'
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
  const [filterStr, setFilterStr] = useState('')

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
    setFilterStr(filterStr)

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

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
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
              <DocumentGrid
                documents={documents}
                highlightQuery={query}
                resultSetParams={(_doc, i) =>
                  buildResultSetParams({
                    type: 'search',
                    pos: offset + i,
                    total: totalHits,
                    q: query || undefined,
                    filter: filterStr || undefined,
                  })
                }
              />

              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                getPageHref={(page) => {
                  const params = new URLSearchParams(searchParams.toString())
                  params.set('offset', String((page - 1) * limit))
                  return `/search?${params.toString()}`
                }}
              />
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
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
