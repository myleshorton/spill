'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, FileSearch, Mail, FileText, Scale, Users, Clock } from 'lucide-react'
import { getTopExtractions, type Extraction } from '@/lib/api'

const PAGE_SIZE = 6

const TYPE_CONFIG: Record<string, { icon: typeof Mail; label: string; color: string }> = {
  email_thread: { icon: Mail, label: 'Email Thread', color: 'text-blue-400' },
  legal: { icon: Scale, label: 'Legal', color: 'text-amber-400' },
  correspondence: { icon: Mail, label: 'Correspondence', color: 'text-emerald-400' },
  embedded_html: { icon: FileText, label: 'Embedded HTML', color: 'text-purple-400' },
  financial: { icon: FileText, label: 'Financial', color: 'text-green-400' },
  metadata_rich: { icon: FileSearch, label: 'Metadata Rich', color: 'text-cyan-400' },
  structured_table: { icon: FileText, label: 'Structured Data', color: 'text-orange-400' },
  other: { icon: FileText, label: 'Document', color: 'text-spill-text-secondary' },
}

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] || TYPE_CONFIG.other
}

export default function TopExtractions() {
  const [extractions, setExtractions] = useState<Extraction[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback((newOffset: number) => {
    setLoading(true)
    getTopExtractions({ limit: PAGE_SIZE, offset: newOffset })
      .then((data) => {
        setExtractions(data.extractions)
        setTotal(data.total)
        setOffset(newOffset)
      })
      .catch(() => {
        setExtractions([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(0) }, [load])

  if (!loading && extractions.length === 0) return null

  const hasPrev = offset > 0
  const hasNext = offset + PAGE_SIZE < total

  return (
    <section className="relative border-y border-spill-divider bg-[#0D0D0D] py-10">
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'6\' height=\'6\' viewBox=\'0 0 6 6\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Ccircle cx=\'1\' cy=\'1\' r=\'0.6\'/%3E%3C/g%3E%3C/svg%3E")', backgroundSize: '6px 6px' }} />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-end justify-between mb-1">
          <div>
            <h2 className="font-headline text-xl font-bold uppercase tracking-tight text-spill-text-primary">
              Deep Extractions
            </h2>
            {total > 0 && (
              <span className="text-xs text-spill-text-secondary">
                {total.toLocaleString()} documents analyzed by AI — hidden emails, metadata, and structured content surfaced
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
                  <div className="h-3 bg-spill-surface-light rounded w-1/3" />
                  <div className="h-4 bg-spill-surface-light rounded w-4/5" />
                  <div className="h-3 bg-spill-surface-light rounded w-full" />
                  <div className="h-3 bg-spill-surface-light rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {extractions.map((ext, i) => (
              <ExtractionCard key={ext.documentId} extraction={ext} index={i} />
            ))}
          </div>
        )}

        {total > PAGE_SIZE && !loading && (
          <div className="mt-4 text-center">
            <Link
              href="/search?q=Extracted"
              className="text-xs text-spill-text-secondary hover:text-spill-accent transition-colors"
            >
              View all {total.toLocaleString()} extractions &rarr;
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}

function ExtractionCard({ extraction, index }: { extraction: Extraction; index: number }) {
  const typeConfig = getTypeConfig(extraction.extractionType)
  const TypeIcon = typeConfig.icon
  const people = extraction.peopleMentioned.slice(0, 4)
  const hasDateRange = extraction.dateRangeStart || extraction.dateRangeEnd

  return (
    <Link
      href={`/doc/${extraction.documentId}`}
      className="group animate-fade-in rounded-lg border border-spill-divider bg-spill-surface p-4 transition-all hover:border-spill-accent/30 hover:shadow-lg hover:shadow-spill-accent/5"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Header: type badge + score */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <TypeIcon className={`h-3.5 w-3.5 ${typeConfig.color}`} />
          <span className={`text-[11px] font-medium uppercase tracking-wide ${typeConfig.color}`}>
            {typeConfig.label}
          </span>
        </div>
        <span className="rounded bg-spill-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-spill-accent">
          Score {extraction.score}
        </span>
      </div>

      {/* Title */}
      <p className="text-sm font-medium text-spill-text-primary group-hover:text-spill-accent transition-colors line-clamp-1">
        {extraction.sourceTitle || extraction.sourceFileName}
      </p>

      {/* Summary */}
      <p className="mt-1.5 text-xs text-spill-text-secondary leading-relaxed line-clamp-3">
        {extraction.summary}
      </p>

      {/* Metadata pills */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {extraction.emailCount > 0 && (
          <span className="flex items-center gap-1 rounded bg-spill-surface-light px-1.5 py-0.5 text-[10px] text-spill-text-secondary">
            <Mail className="h-2.5 w-2.5" /> {extraction.emailCount} emails
          </span>
        )}
        {hasDateRange && (
          <span className="flex items-center gap-1 rounded bg-spill-surface-light px-1.5 py-0.5 text-[10px] text-spill-text-secondary">
            <Clock className="h-2.5 w-2.5" />
            {extraction.dateRangeStart && extraction.dateRangeEnd
              ? `${extraction.dateRangeStart} — ${extraction.dateRangeEnd}`
              : extraction.dateRangeStart || extraction.dateRangeEnd}
          </span>
        )}
        {people.length > 0 && (
          <span className="flex items-center gap-1 rounded bg-spill-surface-light px-1.5 py-0.5 text-[10px] text-spill-text-secondary">
            <Users className="h-2.5 w-2.5" /> {people.join(', ')}{extraction.peopleMentioned.length > 4 ? ` +${extraction.peopleMentioned.length - 4}` : ''}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between text-[10px] text-spill-text-secondary/60">
        <span>DS {extraction.sourceDataSet}</span>
        <span className="flex items-center gap-1">
          <FileSearch className="h-2.5 w-2.5" />
          AI Extracted
        </span>
      </div>
    </Link>
  )
}
