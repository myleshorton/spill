'use client'

import { useState, useEffect } from 'react'
import { Star } from 'lucide-react'
import { type Document, getStarredDocuments } from '@/lib/api'
import DocumentGrid from '@/components/DocumentGrid'

export default function StarsPage() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getStarredDocuments(100, 0)
      .then(data => setDocuments(data.documents))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <Star className="h-6 w-6 text-yellow-400 fill-yellow-400" />
        <h1 className="font-headline text-2xl font-bold text-spill-text-primary">Starred Documents</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-spill-accent border-t-transparent" />
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Star className="mb-4 h-12 w-12 text-spill-text-secondary/30" />
          <p className="font-headline text-lg text-spill-text-secondary">No starred documents yet</p>
          <p className="mt-1 text-sm text-spill-text-secondary/60">
            Click the star icon on any document to save it here
          </p>
        </div>
      ) : (
        <DocumentGrid documents={documents} />
      )}
    </div>
  )
}
