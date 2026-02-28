'use client'

import { useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { formatNumber } from '@/lib/api'
import { siteConfig } from '@/config/site.config'
import clsx from 'clsx'

interface FacetSidebarProps {
  facets?: {
    dataSet?: Record<string, number>
    contentType?: Record<string, number>
    category?: Record<string, number>
  }
}

export default function FacetSidebar({ facets }: FacetSidebarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const activeDataSet = searchParams.get('ds')
  const activeContentTypes = (searchParams.get('type') || '').split(',').filter(Boolean)
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

  const toggleContentType = useCallback((type: string) => {
    const next = activeContentTypes.includes(type)
      ? activeContentTypes.filter(t => t !== type)
      : [...activeContentTypes, type]
    setFilter('type', next.length > 0 ? next.join(',') : null)
  }, [activeContentTypes, setFilter])

  return (
    <aside className="w-full shrink-0 flex flex-row gap-4 overflow-x-auto lg:flex-col lg:gap-6 lg:w-64 lg:overflow-visible">
      {(() => {
        const hasFacets = facets?.contentType && Object.keys(facets.contentType).length > 0
        const entries: [string, number | null][] = hasFacets
          ? Object.entries(facets.contentType!).sort(([, a], [, b]) => b - a)
          : Object.keys(siteConfig.contentTypes).map(k => [k, null])
        return entries.length > 0 ? (
          <FacetGroup title="File Type">
            {entries.map(([type, count]) => (
              <FacetItem
                key={type}
                label={siteConfig.contentTypes[type] || type}
                count={count}
                active={activeContentTypes.includes(type)}
                onClick={() => toggleContentType(type)}
              />
            ))}
          </FacetGroup>
        ) : null
      })()}

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
                label={siteConfig.categories[cat] || cat}
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
    <div className="min-w-0 shrink-0 lg:shrink lg:w-full">
      <h3 className="mb-2 flex items-center gap-1 font-headline text-xs font-semibold uppercase tracking-wider text-spill-text-secondary whitespace-nowrap">
        {title}
        <ChevronDown className="h-3 w-3" />
      </h3>
      <div className="flex flex-row gap-1 lg:flex-col lg:gap-0.5">
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
  count: number | null
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors whitespace-nowrap lg:w-full',
        active
          ? 'bg-spill-accent/15 text-spill-accent'
          : 'text-spill-text-secondary hover:bg-spill-surface-light hover:text-spill-text-primary'
      )}
    >
      <span className="truncate">{label}</span>
      {count != null && (
        <span className={clsx(
          'ml-2 shrink-0 font-mono text-xs',
          active ? 'text-spill-accent/70' : 'text-spill-text-secondary/60'
        )}>
          {formatNumber(count)}
        </span>
      )}
    </button>
  )
}
