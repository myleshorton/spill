'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Video, Play, ChevronLeft, ChevronRight } from 'lucide-react'
import { getFeaturedVideos, thumbnailUrl, formatFileSize, type Document } from '@/lib/api'
import { docHrefWithContext } from '@/lib/result-set'

const PAGE_SIZE = 6

export default function FeaturedVideos() {
  const [docs, setDocs] = useState<Document[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback((newOffset: number) => {
    setLoading(true)
    getFeaturedVideos({ limit: PAGE_SIZE, offset: newOffset })
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
    <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-spill-accent" />
          <h2 className="font-headline text-xl font-bold text-spill-text-primary">Featured Videos</h2>
          {total > 0 && (
            <span className="text-xs text-spill-text-secondary">({total})</span>
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
      <p className="text-sm text-spill-text-secondary mb-6">Depositions, interviews, and news clips from the archive</p>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <div key={i} className="rounded-lg border border-spill-divider bg-spill-surface overflow-hidden animate-pulse">
              <div className="aspect-video bg-spill-surface-light" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-spill-surface-light rounded w-4/5" />
                <div className="h-3 bg-spill-surface-light rounded w-3/5" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((doc, i) => (
            <VideoCard key={doc.id} doc={doc} index={i} offset={offset} total={total} />
          ))}
        </div>
      )}
    </section>
  )
}

function VideoCard({ doc, index, offset, total }: { doc: Document; index: number; offset: number; total: number }) {
  const [thumbError, setThumbError] = useState(false)

  return (
    <Link
      href={docHrefWithContext(doc.id, { type: 'featured-videos', pos: offset + index, total })}
      className="group animate-fade-in overflow-hidden rounded-lg border border-spill-divider bg-spill-surface transition-all hover:border-spill-accent/30 hover:shadow-lg hover:shadow-spill-accent/5"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="relative aspect-video overflow-hidden bg-spill-bg">
        {doc.hasThumbnail && !thumbError ? (
          <img
            src={thumbnailUrl(doc.id)}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            onError={() => setThumbError(true)}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Video className="h-10 w-10 text-spill-text-secondary/30" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
            <Play className="h-5 w-5 text-white ml-0.5" />
          </div>
        </div>
        <div className="absolute bottom-2 left-2">
          <span className="rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] uppercase text-spill-accent backdrop-blur-sm">
            video
          </span>
        </div>
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-medium text-spill-text-primary group-hover:text-spill-accent transition-colors">
          {doc.title}
        </p>
        <div className="mt-1.5 flex items-center gap-2 text-xs text-spill-text-secondary">
          <span>DS {doc.dataSet}</span>
          {doc.fileSize > 0 && (
            <>
              <span className="text-spill-divider">&middot;</span>
              <span>{formatFileSize(doc.fileSize)}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}
