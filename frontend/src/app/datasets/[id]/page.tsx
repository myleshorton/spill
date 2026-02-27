'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import DocumentGrid from '@/components/DocumentGrid'
import TorrentDownload from '@/components/TorrentDownload'
import { listDocuments, getDataSet, type Document, type DataSetInfo, formatNumber } from '@/lib/api'
import { siteConfig } from '@/config/site.config'
import Pagination from '@/components/Pagination'
import { Loader2, ChevronLeft } from 'lucide-react'
import Link from 'next/link'

export default function DataSetDetailPage() {
  const params = useParams()
  const dsId = Number(params.id)
  const [documents, setDocuments] = useState<Document[]>([])
  const [datasetInfo, setDatasetInfo] = useState<DataSetInfo | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const limit = 50

  const dsConfig = siteConfig.dataSets.find((d) => d.id === dsId)

  useEffect(() => {
    getDataSet(dsId).then(setDatasetInfo).catch(() => {})
  }, [dsId])

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
              {dsConfig?.name ?? `Data Set ${dsId}`}
            </h1>
          </div>
          <p className="mt-2 max-w-3xl text-spill-text-secondary">
            {dsConfig?.description ?? ''}
          </p>
          <p className="mt-2 text-sm text-spill-text-secondary/60">
            {formatNumber(total)} files in this data set
          </p>

          {datasetInfo && <div className="mt-4"><TorrentDownload dataset={datasetInfo} /></div>}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-spill-accent" />
          </div>
        ) : (
          <>
            <DocumentGrid documents={documents} />

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={(page) => setOffset((page - 1) * limit)}
            />
          </>
        )}
      </main>

      <Footer />
    </div>
  )
}
