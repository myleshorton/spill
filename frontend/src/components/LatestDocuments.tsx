'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, FileText, Image, Video, Headphones, Mail, Table, File, Clock } from 'lucide-react'
import { listDocuments, thumbnailUrl, formatFileSize, type Document } from '@/lib/api'
import { siteConfig } from '@/config/site.config'

const PAGE_SIZE = 6

const TYPE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText, image: Image, video: Video, audio: Headphones,
  email: Mail, spreadsheet: Table,
}

function getIcon(type: string) {
  return TYPE_ICONS[type] || File
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

export default function LatestDocuments() {
  const [docs, setDocs] = useState<Document[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback((newOffset: number) => {
    setLoading(true)
    listDocuments({ limit: PAGE_SIZE, offset: newOffset, sort: 'newest' })
      .then((data) => {
        setDocs(data.documents)
        setTotal(data.total)
        setOffset(newOffset)
      })
      .catch(() => {
        setDocs([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(0) }, [load])

  if (!loading && docs.length === 0) return null

  const hasPrev = offset > 0
  const hasNext = offset + PAGE_SIZE < total

  return (
    <section className="relative border-y border-spill-divider bg-[#0D0D0D] py-10">
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'6\' height=\'6\' viewBox=\'0 0 6 6\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Ccircle cx=\'1\' cy=\'1\' r=\'0.6\'/%3E%3C/g%3E%3C/svg%3E")', backgroundSize: '6px 6px' }} />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-end justify-between mb-1">
          <div>
            <h2 className="font-headline text-xl font-bold uppercase tracking-tight text-spill-text-primary">
              Latest Documents
            </h2>
            {total > 0 && (
              <span className="text-xs text-spill-text-secondary">
                {total.toLocaleString()} documents in the archive
              </span>
            )}
          </div>
          {total > PAGE_SIZE && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => load(Math.max(0, offset - PAGE_SIZE))}
                disabled={!hasPrev || loading}
                className="rounded p-1.5 text-spill-text-secondary transition-colors hover:text-spill-accent disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => load(offset + PAGE_SIZE)}
                disabled={!hasNext || loading}
                className="rounded p-1.5 text-spill-text-secondary transition-colors hover:text-spill-accent disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        <div className="mb-6 h-px bg-gradient-to-r from-spill-accent/40 via-spill-divider to-transparent" />

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i} className="rounded-lg border border-spill-divider bg-spill-surface overflow-hidden animate-pulse">
                <div className="p-4 space-y-3">
                  <div className="h-3 bg-spill-surface-light rounded w-1/4" />
                  <div className="h-4 bg-spill-surface-light rounded w-4/5" />
                  <div className="h-3 bg-spill-surface-light rounded w-3/5" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((doc, i) => (
              <DocCard key={doc.id} doc={doc} index={i} />
            ))}
          </div>
        )}

        <div className="mt-4 text-center">
          <Link
            href="/search"
            className="text-xs text-spill-text-secondary hover:text-spill-accent transition-colors"
          >
            Browse all {total.toLocaleString()} documents &rarr;
          </Link>
        </div>
      </div>
    </section>
  )
}

function DocCard({ doc, index }: { doc: Document; index: number }) {
  const [thumbError, setThumbError] = useState(false)
  const Icon = getIcon(doc.contentType)
  const dsName = siteConfig.dataSets.find(d => d.id === doc.dataSet)?.shortName || `Data Set ${doc.dataSet}`

  return (
    <Link
      href={`/doc/${doc.id}`}
      className="group animate-fade-in rounded-lg border border-spill-divider bg-spill-surface overflow-hidden transition-all hover:border-spill-accent/30 hover:shadow-lg hover:shadow-spill-accent/5"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {doc.hasThumbnail && !thumbError ? (
        <div className="relative aspect-[16/9] overflow-hidden bg-spill-bg">
          <img
            src={thumbnailUrl(doc.id)}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            onError={() => setThumbError(true)}
            loading="lazy"
          />
          <div className="absolute bottom-2 left-2">
            <span className="rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] uppercase text-spill-accent backdrop-blur-sm">
              {doc.contentType}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center aspect-[16/9] bg-spill-bg/50">
          <Icon className="h-10 w-10 text-spill-text-secondary/20" />
        </div>
      )}
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-medium text-spill-text-primary group-hover:text-spill-accent transition-colors">
          {doc.title}
        </p>
        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-spill-text-secondary">
          <span>{dsName}</span>
          {doc.fileSize > 0 && (
            <>
              <span className="text-spill-divider">&middot;</span>
              <span>{formatFileSize(doc.fileSize)}</span>
            </>
          )}
          {doc.createdAt && (
            <>
              <span className="text-spill-divider">&middot;</span>
              <span className="flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                {timeAgo(doc.createdAt)}
              </span>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}
