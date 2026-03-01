'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileText, Image, Video, Headphones, Mail, Table, File, ChevronRight } from 'lucide-react'
import { getSimilarDocuments, thumbnailUrl, formatFileSize, type SimilarDocument } from '@/lib/api'
import { docHrefWithContext, storeResultList } from '@/lib/result-set'

function ContentTypeIcon({ type, className }: { type: string; className?: string }) {
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

function SkeletonCard() {
  return (
    <div className="flex-shrink-0 w-56 rounded-lg border border-spill-divider bg-spill-surface overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-spill-surface-light" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-spill-surface-light rounded w-4/5" />
        <div className="h-3 bg-spill-surface-light rounded w-3/5" />
      </div>
    </div>
  )
}

export default function SimilarDocuments({ docId }: { docId: string }) {
  const [docs, setDocs] = useState<SimilarDocument[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getSimilarDocuments(docId, 8)
      .then((d) => {
        setDocs(d)
        storeResultList(`similar-${docId}`, d.map(doc => doc.id))
      })
      .catch(() => setDocs([]))
      .finally(() => setLoading(false))
  }, [docId])

  if (!loading && docs.length === 0) return null

  return (
    <section className="mt-12">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="font-headline text-lg font-bold text-spill-text-primary">Similar Documents</h2>
        <ChevronRight className="h-4 w-4 text-spill-text-secondary" />
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-spill-divider">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          docs.map((doc, i) => (
            <SimilarCard key={doc.id} doc={doc} index={i} parentDocId={docId} totalSimilar={docs.length} />
          ))
        )}
      </div>
    </section>
  )
}

function SimilarCard({ doc, index, parentDocId, totalSimilar }: { doc: SimilarDocument; index: number; parentDocId: string; totalSimilar: number }) {
  const [thumbError, setThumbError] = useState(false)

  return (
    <Link
      href={docHrefWithContext(doc.id, { type: 'similar', pos: index, total: totalSimilar, docId: parentDocId })}
      className="group flex-shrink-0 w-56 rounded-lg border border-spill-divider bg-spill-surface overflow-hidden transition-all hover:border-spill-accent/30 hover:shadow-lg hover:shadow-spill-accent/5 animate-fade-in"
      style={{ animationDelay: `${index * 50}ms` }}
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
              <span className="text-spill-divider">&middot;</span>
              <span>{formatFileSize(doc.fileSize)}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}
