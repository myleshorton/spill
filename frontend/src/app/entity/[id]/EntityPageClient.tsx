'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ChevronLeft, FileText, User, Building2, MapPin, ExternalLink } from 'lucide-react'
import {
  type EntityDetail, type RelatedEntity, type EntityRelationship, type Document,
  getEntityDocuments, getRelatedEntities, getEntityRelationships, formatFileSize
} from '@/lib/api'
import DocumentGrid from '@/components/DocumentGrid'
import Pagination from '@/components/Pagination'
import EntityChatBar from '@/components/EntityChatBar'

const EntityMiniGraph = dynamic(() => import('@/components/EntityMiniGraph'), { ssr: false })

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  person: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  organization: { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  location: { bg: 'bg-orange-500/15', text: 'text-orange-400' },
}

const TYPE_ICONS: Record<string, typeof User> = {
  person: User,
  organization: Building2,
  location: MapPin,
}

const PAGE_SIZE = 24

interface Props {
  entity: EntityDetail
}

export default function EntityPageClient({ entity }: Props) {
  const [documents, setDocuments] = useState<(Document & { mentionCount: number })[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [related, setRelated] = useState<RelatedEntity[]>([])
  const [relationships, setRelationships] = useState<EntityRelationship[]>([])

  const loadDocs = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const result = await getEntityDocuments(entity.id, PAGE_SIZE, (p - 1) * PAGE_SIZE)
      setDocuments(result.documents)
      setTotal(result.total)
    } catch {
      setDocuments([])
      setTotal(0)
    }
    setLoading(false)
  }, [entity.id])

  useEffect(() => { loadDocs(page) }, [page, loadDocs])

  useEffect(() => {
    getRelatedEntities(entity.id, 20).then(setRelated).catch(() => {})
    getEntityRelationships(entity.id, 100).then(setRelationships).catch(() => {})
  }, [entity.id])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const colors = TYPE_COLORS[entity.type] || TYPE_COLORS.person
  const Icon = TYPE_ICONS[entity.type] || FileText

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <Link
          href="/entities"
          className="inline-flex items-center gap-1 text-sm text-spill-text-secondary hover:text-spill-text-primary transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          All Entities
        </Link>
      </div>

      <div className="mb-8 flex items-start gap-4">
        {entity.photoUrl ? (
          <img
            src={entity.photoUrl}
            alt={entity.name}
            className="h-16 w-16 shrink-0 rounded-lg object-cover border border-spill-divider"
          />
        ) : (
          <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-lg ${colors.bg}`}>
            <Icon className={`h-7 w-7 ${colors.text}`} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="font-headline text-3xl font-bold text-spill-text-primary">
            {entity.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${colors.bg} ${colors.text}`}>
              {entity.type}
            </span>
            <span className="text-sm text-spill-text-secondary">
              {entity.documentCount} document{entity.documentCount !== 1 ? 's' : ''}
            </span>
          </div>
          {entity.aliases && entity.aliases.length > 0 && (
            <p className="mt-2 text-xs text-spill-text-secondary">
              Also known as: {entity.aliases.join(', ')}
            </p>
          )}
          {entity.description && (
            <p className="mt-3 text-sm text-spill-text-secondary leading-relaxed max-w-2xl">
              {entity.description}
            </p>
          )}
          {entity.externalUrls && Object.keys(entity.externalUrls).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(entity.externalUrls).map(([label, url]) => (
                <a
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-spill-divider px-2.5 py-0.5 text-xs text-spill-accent hover:bg-spill-surface-light transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  {label}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Entity-specific chat bar */}
      <div className="mb-6">
        <EntityChatBar entityId={entity.id} entityName={entity.name} />
      </div>

      {/* Network graph — full width, prominent */}
      {related.length > 0 && (
        <div className="mb-6 rounded-lg border border-spill-divider bg-spill-surface p-4">
          <h3 className="font-headline text-sm font-semibold text-spill-text-primary mb-3">
            Network
          </h3>
          <EntityMiniGraph entityId={entity.id} related={related} entityName={entity.name} entityType={entity.type} relationships={relationships} />
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <h2 className="font-headline text-lg font-semibold text-spill-text-primary mb-4">
            Documents
          </h2>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-spill-accent border-t-transparent" />
            </div>
          ) : (
            <>
              <DocumentGrid documents={documents} />
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
              />
            </>
          )}
        </div>

        <div className="space-y-4">
          {relationships.length > 0 && (() => {
            const grouped: Record<string, EntityRelationship[]> = {}
            for (const r of relationships) {
              const key = r.relationshipType
              if (!grouped[key]) grouped[key] = []
              grouped[key].push(r)
            }
            return (
              <div className="rounded-lg border border-spill-divider bg-spill-surface p-4">
                <h3 className="font-headline text-sm font-semibold text-spill-text-primary mb-3">
                  Connections
                </h3>
                <div className="space-y-3">
                  {Object.entries(grouped).map(([type, rels]) => (
                    <div key={type}>
                      <p className="text-xs font-medium uppercase tracking-wide text-spill-text-secondary mb-1.5">
                        {type.replace(/_/g, ' ')} ({rels.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {rels.map((r) => {
                          const rc = TYPE_COLORS[r.otherEntity.type] || TYPE_COLORS.person
                          return (
                            <Link
                              key={r.id}
                              href={`/entity/${r.otherEntity.id}`}
                              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${rc.bg} ${rc.text} hover:opacity-80`}
                            >
                              {r.otherEntity.name}
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {related.length > 0 && (
            <div className="rounded-lg border border-spill-divider bg-spill-surface p-4">
              <h3 className="font-headline text-sm font-semibold text-spill-text-primary mb-3">
                Also Appears With
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {related.map((r) => {
                  const rc = TYPE_COLORS[r.type] || TYPE_COLORS.person
                  return (
                    <Link
                      key={r.id}
                      href={`/entity/${r.id}`}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${rc.bg} ${rc.text} hover:opacity-80`}
                    >
                      {r.name}
                      <span className="ml-1 opacity-50">({r.sharedDocuments})</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
