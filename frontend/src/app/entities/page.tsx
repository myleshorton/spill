'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Search, User, Building2, MapPin, FileText } from 'lucide-react'
import { searchEntities, type EntityDetail } from '@/lib/api'
import Pagination from '@/components/Pagination'
import clsx from 'clsx'

const TYPE_TABS = [
  { value: '', label: 'All' },
  { value: 'person', label: 'People' },
  { value: 'organization', label: 'Organizations' },
  { value: 'location', label: 'Locations' },
]

const TYPE_COLORS: Record<string, { bg: string; text: string; icon: typeof User }> = {
  person: { bg: 'bg-blue-500/15', text: 'text-blue-400', icon: User },
  organization: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', icon: Building2 },
  location: { bg: 'bg-orange-500/15', text: 'text-orange-400', icon: MapPin },
}

const PAGE_SIZE = 48

export default function EntitiesBrowsePage() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [type, setType] = useState('')
  const [entities, setEntities] = useState<EntityDetail[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await searchEntities({
        q: debouncedQuery || undefined,
        type: type || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      })
      setEntities(result.entities)
      setTotal(result.total)
    } catch {
      setEntities([])
      setTotal(0)
    }
    setLoading(false)
  }, [debouncedQuery, type, page])

  useEffect(() => { load() }, [load])

  useEffect(() => { setPage(1) }, [debouncedQuery, type])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="font-headline text-3xl font-bold text-spill-text-primary">
        People & Entities
      </h1>
      <p className="mt-1 text-sm text-spill-text-secondary">
        Browse people, organizations, and locations extracted from archive documents.
      </p>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-spill-text-secondary" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search entities..."
            className="w-full rounded-lg border border-spill-divider bg-spill-surface py-2 pl-10 pr-4 text-sm text-spill-text-primary placeholder:text-spill-text-secondary/60 focus:border-spill-accent/50 focus:outline-none focus:ring-1 focus:ring-spill-accent/30 transition-colors"
          />
        </div>

        <div className="flex items-center gap-1 rounded-md border border-spill-divider bg-spill-surface p-0.5">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setType(tab.value)}
              className={clsx(
                'rounded px-3 py-1.5 text-xs font-medium transition-colors',
                type === tab.value
                  ? 'bg-spill-surface-light text-spill-accent'
                  : 'text-spill-text-secondary hover:text-spill-text-primary'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 text-xs text-spill-text-secondary">
        {total.toLocaleString()} entit{total === 1 ? 'y' : 'ies'}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-spill-accent border-t-transparent" />
        </div>
      ) : entities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="mb-4 h-12 w-12 text-spill-text-secondary/30" />
          <p className="font-headline text-lg text-spill-text-secondary">No entities found</p>
          <p className="mt-1 text-sm text-spill-text-secondary/60">Try adjusting your search or filter</p>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {entities.map((entity) => {
              const tc = TYPE_COLORS[entity.type] || TYPE_COLORS.person
              const Icon = tc.icon
              return (
                <Link
                  key={entity.id}
                  href={`/entity/${entity.id}`}
                  className="group flex items-center gap-3 rounded-lg border border-spill-divider bg-spill-surface p-3 transition-all hover:border-spill-accent/30 hover:shadow-lg hover:shadow-spill-accent/5"
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${tc.bg}`}>
                    <Icon className={`h-4 w-4 ${tc.text}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-spill-text-primary group-hover:text-spill-accent transition-colors">
                      {entity.name}
                    </p>
                    <p className="text-xs text-spill-text-secondary">
                      <span className="capitalize">{entity.type}</span>
                      <span className="mx-1.5 text-spill-divider">·</span>
                      {entity.documentCount} doc{entity.documentCount !== 1 ? 's' : ''}
                    </p>
                    {entity.description && (
                      <p className="mt-0.5 truncate text-xs text-spill-text-secondary/70">
                        {entity.description}
                      </p>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          />
        </>
      )}
    </div>
  )
}
