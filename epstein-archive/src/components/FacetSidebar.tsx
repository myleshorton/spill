'use client'

import { useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { dataSetName, formatNumber } from '@/lib/api'
import clsx from 'clsx'

interface FacetSidebarProps {
  facets?: {
    dataSet?: Record<string, number>
    contentType?: Record<string, number>
    category?: Record<string, number>
  }
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF Documents',
  image: 'Images',
  video: 'Videos',
  audio: 'Audio',
  email: 'Emails',
  spreadsheet: 'Spreadsheets',
}

const CATEGORY_LABELS: Record<string, string> = {
  court_record: 'Court Records',
  fbi_report: 'FBI Reports',
  email: 'Email Correspondence',
  financial: 'Financial Records',
  flight_log: 'Flight Logs',
  photo: 'Photographs',
  video: 'Video Evidence',
  deposition: 'Depositions',
  police_report: 'Police Reports',
}

export default function FacetSidebar({ facets }: FacetSidebarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const activeDataSet = searchParams.get('ds')
  const activeContentType = searchParams.get('type')
  const activeCategory = searchParams.get('cat')

  const setFilter = useCallback((key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete('offset')
    router.push(`/search?${params.toString()}`)
  }, [router, searchParams])

  return (
    <aside className="w-full shrink-0 space-y-6 lg:w-64">
      {facets?.contentType && Object.keys(facets.contentType).length > 0 && (
        <FacetGroup title="File Type">
          {Object.entries(facets.contentType)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => (
              <FacetItem
                key={type}
                label={CONTENT_TYPE_LABELS[type] || type}
                count={count}
                active={activeContentType === type}
                onClick={() => setFilter('type', activeContentType === type ? null : type)}
              />
            ))}
        </FacetGroup>
      )}

      {facets?.dataSet && Object.keys(facets.dataSet).length > 0 && (
        <FacetGroup title="Data Set">
          {Object.entries(facets.dataSet)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([ds, count]) => (
              <FacetItem
                key={ds}
                label={`DS ${ds}`}
                count={count}
                active={activeDataSet === ds}
                onClick={() => setFilter('ds', activeDataSet === ds ? null : ds)}
              />
            ))}
        </FacetGroup>
      )}

      {facets?.category && Object.keys(facets.category).length > 0 && (
        <FacetGroup title="Category">
          {Object.entries(facets.category)
            .sort(([, a], [, b]) => b - a)
            .map(([cat, count]) => (
              <FacetItem
                key={cat}
                label={CATEGORY_LABELS[cat] || cat}
                count={count}
                active={activeCategory === cat}
                onClick={() => setFilter('cat', activeCategory === cat ? null : cat)}
              />
            ))}
        </FacetGroup>
      )}
    </aside>
  )
}

function FacetGroup({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1 font-headline text-xs font-semibold uppercase tracking-wider text-spill-text-secondary">
        {title}
        <ChevronDown className="h-3 w-3" />
      </h3>
      <div className="space-y-0.5">
        {children}
      </div>
    </div>
  )
}

function FacetItem({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors',
        active
          ? 'bg-spill-accent/15 text-spill-accent'
          : 'text-spill-text-secondary hover:bg-spill-surface-light hover:text-spill-text-primary'
      )}
    >
      <span className="truncate">{label}</span>
      <span className={clsx(
        'ml-2 shrink-0 font-mono text-xs',
        active ? 'text-spill-accent/70' : 'text-spill-text-secondary/60'
      )}>
        {formatNumber(count)}
      </span>
    </button>
  )
}
