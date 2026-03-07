'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { getTopEntities, type Entity } from '@/lib/api'

const EntityGraph = dynamic(() => import('@/components/EntityGraph'), { ssr: false })

export default function EntitiesPage() {
  const [topPeople, setTopPeople] = useState<Entity[]>([])
  const [topOrgs, setTopOrgs] = useState<Entity[]>([])
  const [topLocations, setTopLocations] = useState<Entity[]>([])

  useEffect(() => {
    getTopEntities('person', 50).then(setTopPeople).catch(() => {})
    getTopEntities('organization', 50).then(setTopOrgs).catch(() => {})
    getTopEntities('location', 50).then(setTopLocations).catch(() => {})
  }, [])

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <Link
          href="/search"
          className="text-sm text-spill-text-secondary hover:text-spill-text-primary transition-colors"
        >
          &larr; Back to Search
        </Link>
        <h1 className="mt-2 font-headline text-3xl font-bold text-spill-text-primary">Entity Network</h1>
        <p className="mt-1 text-sm text-spill-text-secondary">
          People, organizations, and locations extracted from archive documents, connected by co-occurrence.
        </p>
      </div>

      {/* Top entities bar */}
      <div className="mb-6 space-y-3">
        {topPeople.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-spill-text-secondary mb-1.5">Top People</h3>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {topPeople.map(e => (
                <Link
                  key={e.id}
                  href={`/entity/${e.id}`}
                  className="shrink-0 rounded-full bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/25 transition-colors"
                >
                  {e.name} <span className="text-blue-400/50">({e.documentCount})</span>
                </Link>
              ))}
            </div>
          </div>
        )}
        {topOrgs.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-spill-text-secondary mb-1.5">Top Organizations</h3>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {topOrgs.map(e => (
                <Link
                  key={e.id}
                  href={`/entity/${e.id}`}
                  className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                >
                  {e.name} <span className="text-emerald-400/50">({e.documentCount})</span>
                </Link>
              ))}
            </div>
          </div>
        )}
        {topLocations.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-spill-text-secondary mb-1.5">Top Locations</h3>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {topLocations.map(e => (
                <Link
                  key={e.id}
                  href={`/entity/${e.id}`}
                  className="shrink-0 rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-medium text-orange-400 hover:bg-orange-500/25 transition-colors"
                >
                  {e.name} <span className="text-orange-400/50">({e.documentCount})</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Graph */}
      <EntityGraph />
    </div>
  )
}
