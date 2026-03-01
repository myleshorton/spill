'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react'
import {
  parseResultSetParams,
  docHrefWithContext,
  getResultList,
  type ResultSetContext,
} from '@/lib/result-set'
import {
  searchDocuments,
  listDocuments,
  getFeaturedPhotos,
  getFeaturedVideos,
  type Document,
} from '@/lib/api'

// How many IDs to fetch at once for API-backed sets
const WINDOW = 40

export default function ResultSetNav() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const ctx = parseResultSetParams(searchParams)

  const [ids, setIds] = useState<string[] | null>(null)
  const [windowOffset, setWindowOffset] = useState(0) // offset of the fetched window in the full set
  const [loading, setLoading] = useState(false)

  // Fetch a window of IDs around the current position for API-backed sets
  const fetchWindow = useCallback(async (c: ResultSetContext) => {
    // Align window start to WINDOW boundary containing pos
    const wStart = Math.floor(c.pos / WINDOW) * WINDOW
    setLoading(true)
    try {
      let docs: Document[] = []
      switch (c.type) {
        case 'search': {
          if (c.q) {
            const res = await searchDocuments(c.q, { limit: WINDOW, offset: wStart, filter: c.filter })
            docs = res.hits
          } else {
            const res = await listDocuments({ limit: WINDOW, offset: wStart })
            docs = res.documents
          }
          break
        }
        case 'dataset': {
          const res = await listDocuments({ limit: WINDOW, offset: wStart, dataSet: c.ds })
          docs = res.documents
          break
        }
        case 'featured-photos': {
          const res = await getFeaturedPhotos({ limit: WINDOW, offset: wStart })
          docs = res.documents
          break
        }
        case 'featured-videos': {
          const res = await getFeaturedVideos({ limit: WINDOW, offset: wStart })
          docs = res.documents
          break
        }
      }
      setIds(docs.map(d => d.id))
      setWindowOffset(wStart)
    } catch {
      setIds(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!ctx) return

    if (ctx.type === 'recs') {
      setIds(getResultList('recs'))
      setWindowOffset(0)
    } else if (ctx.type === 'similar') {
      setIds(getResultList(`similar-${ctx.docId}`))
      setWindowOffset(0)
    } else {
      fetchWindow(ctx)
    }
    // Only re-fetch when pos changes (new navigation)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.type, ctx?.pos, ctx?.q, ctx?.filter, ctx?.ds, ctx?.docId])

  const navigate = useCallback((newPos: number) => {
    if (!ctx || !ids) return

    const isCached = ctx.type === 'recs' || ctx.type === 'similar'
    const localIdx = isCached ? newPos : newPos - windowOffset

    if (localIdx >= 0 && localIdx < ids.length) {
      const newCtx = { ...ctx, pos: newPos }
      router.push(docHrefWithContext(ids[localIdx], newCtx))
    }
    // If out of window for API-backed, the useEffect will refetch on pos change
  }, [ctx, ids, windowOffset, router])

  // Keyboard navigation
  useEffect(() => {
    if (!ctx) return
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); navigate(ctx!.pos - 1) }
      if (e.key === 'ArrowRight') { e.preventDefault(); navigate(ctx!.pos + 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ctx, navigate])

  if (!ctx) return null

  const isCached = ctx.type === 'recs' || ctx.type === 'similar'
  const total = isCached && ids ? ids.length : ctx.total
  const hasPrev = ctx.pos > 0
  const hasNext = ctx.pos < total - 1

  const label =
    ctx.type === 'search' ? (ctx.q ? `Search: "${ctx.q}"` : 'Browse') :
    ctx.type === 'dataset' ? `Data Set ${ctx.ds}` :
    ctx.type === 'featured-photos' ? 'Featured Photos' :
    ctx.type === 'featured-videos' ? 'Featured Videos' :
    ctx.type === 'recs' ? 'Recommendations' :
    ctx.type === 'similar' ? 'Similar Documents' : ''

  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-spill-divider bg-spill-surface px-3 py-2">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-spill-text-secondary hover:bg-spill-surface-light hover:text-spill-text-primary transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </button>

      <span className="mx-1 text-spill-divider">|</span>

      <span className="text-xs text-spill-text-secondary truncate">{label}</span>

      <div className="ml-auto flex items-center gap-1.5">
        <span className="text-xs tabular-nums text-spill-text-secondary">
          {ctx.pos + 1} of {total > 0 ? total : '…'}
        </span>
        <button
          onClick={() => navigate(ctx.pos - 1)}
          disabled={!hasPrev || loading}
          className="rounded p-1 text-spill-text-secondary hover:text-spill-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Previous (←)"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => navigate(ctx.pos + 1)}
          disabled={!hasNext || loading}
          className="rounded p-1 text-spill-text-secondary hover:text-spill-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Next (→)"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
