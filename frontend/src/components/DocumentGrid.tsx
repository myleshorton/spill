'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Grid3X3, List, MapPin, Calendar, FileText, Image, Video, Headphones, Mail, Table, File } from 'lucide-react'
import { type Document, thumbnailUrl, formatFileSize } from '@/lib/api'
import { useLocalStorage } from '@/lib/hooks'
import clsx from 'clsx'

const MapView = dynamic(() => import('./MapView'), { ssr: false })
const TimelineView = dynamic(() => import('./TimelineView'), { ssr: false })

interface DocumentGridProps {
  documents: Document[]
  highlightQuery?: string
}

function ContentTypeIcon({ type, className }: { type: string, className?: string }) {
  const props = { className: className || 'h-4 w-4' }
  switch (type) {
    case 'pdf': return <FileText {...props} />
    case 'image': return <Image {...props} />
    case 'video': return <Video {...props} />
    case 'audio': return <Headphones {...props} />
    case 'email': return <Mail {...props} />
    case 'spreadsheet': return <Table {...props} />
    default: return <File {...props} />
  }
}

export default function DocumentGrid({ documents, highlightQuery }: DocumentGridProps) {
  const [viewMode, setViewMode] = useLocalStorage<'grid' | 'list' | 'map' | 'timeline'>('viewMode', 'list')

  const hasGeoDocuments = useMemo(() =>
    documents.some(d => d._geo || (d.locationLatitude != null && d.locationLongitude != null)),
    [documents]
  )

  const hasDatedDocuments = useMemo(() =>
    documents.some(d => d.documentDate && d.documentDate !== '_none'),
    [documents]
  )

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="mb-4 h-12 w-12 text-spill-text-secondary/30" />
        <p className="font-headline text-lg text-spill-text-secondary">No documents found</p>
        <p className="mt-1 text-sm text-spill-text-secondary/60">Try adjusting your search or filters</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-spill-text-secondary">
          {documents.length} document{documents.length !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-1 rounded-md border border-spill-divider bg-spill-surface p-0.5">
          <button
            onClick={() => setViewMode('grid')}
            className={clsx(
              'rounded p-1.5 transition-colors',
              viewMode === 'grid' ? 'bg-spill-surface-light text-spill-accent' : 'text-spill-text-secondary hover:text-spill-text-primary'
            )}
          >
            <Grid3X3 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={clsx(
              'rounded p-1.5 transition-colors',
              viewMode === 'list' ? 'bg-spill-surface-light text-spill-accent' : 'text-spill-text-secondary hover:text-spill-text-primary'
            )}
          >
            <List className="h-3.5 w-3.5" />
          </button>
          {hasGeoDocuments && (
            <button
              onClick={() => setViewMode('map')}
              className={clsx(
                'rounded p-1.5 transition-colors',
                viewMode === 'map' ? 'bg-spill-surface-light text-spill-accent' : 'text-spill-text-secondary hover:text-spill-text-primary'
              )}
            >
              <MapPin className="h-3.5 w-3.5" />
            </button>
          )}
          {hasDatedDocuments && (
            <button
              onClick={() => setViewMode('timeline')}
              className={clsx(
                'rounded p-1.5 transition-colors',
                viewMode === 'timeline' ? 'bg-spill-surface-light text-spill-accent' : 'text-spill-text-secondary hover:text-spill-text-primary'
              )}
            >
              <Calendar className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {viewMode === 'timeline' ? (
        <TimelineView documents={documents} />
      ) : viewMode === 'map' ? (
        <MapView documents={documents} />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {documents.map((doc, i) => (
            <GridCard key={doc.id} doc={doc} index={i} />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {documents.map((doc, i) => (
            <ListRow key={doc.id} doc={doc} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}

function GridCard({ doc, index }: { doc: Document, index: number }) {
  const [thumbError, setThumbError] = useState(false)

  return (
    <Link
      href={`/doc/${doc.id}`}
      className="group animate-fade-in overflow-hidden rounded-lg border border-spill-divider bg-spill-surface transition-all hover:border-spill-accent/30 hover:shadow-lg hover:shadow-spill-accent/5"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-spill-bg">
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
            <ContentTypeIcon type={doc.contentType} className="h-8 w-8 text-spill-text-secondary/30" />
          </div>
        )}
        <div className="absolute bottom-2 left-2">
          <span className="rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] uppercase text-spill-accent backdrop-blur-sm">
            {doc.contentType}
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
              <span className="text-spill-divider">·</span>
              <span>{formatFileSize(doc.fileSize)}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}

function ListRow({ doc, index }: { doc: Document, index: number }) {
  return (
    <Link
      href={`/doc/${doc.id}`}
      className="group flex animate-fade-in items-center gap-2 sm:gap-3 rounded-md px-2 sm:px-3 py-2.5 transition-colors hover:bg-spill-surface overflow-hidden"
      style={{ animationDelay: `${index * 15}ms` }}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-spill-surface-light text-spill-text-secondary group-hover:text-spill-accent transition-colors">
        <ContentTypeIcon type={doc.contentType} className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-spill-text-primary group-hover:text-spill-accent transition-colors">
          {doc.title}
        </p>
        <p className="truncate text-xs text-spill-text-secondary">
          {doc.fileName}
        </p>
      </div>
      <span className="hidden shrink-0 rounded bg-spill-surface-light px-1.5 py-0.5 font-mono text-[10px] uppercase text-spill-text-secondary sm:block">
        {doc.contentType}
      </span>
      <span className="hidden shrink-0 text-xs text-spill-text-secondary sm:block">
        DS {doc.dataSet}
      </span>
      {doc.fileSize > 0 && (
        <span className="hidden shrink-0 text-xs text-spill-text-secondary/60 md:block">
          {formatFileSize(doc.fileSize)}
        </span>
      )}
    </Link>
  )
}
