'use client'

import { useEffect, useState, Suspense } from 'react'
import { useParams } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import DocumentViewer from '@/components/DocumentViewer'
import SimilarDocuments from '@/components/SimilarDocuments'
import { getDocument, recordView, type Document } from '@/lib/api'
import { Loader2, AlertCircle } from 'lucide-react'

export default function DocPage() {
  const params = useParams()
  const id = params.id as string
  const [doc, setDoc] = useState<Document | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDocument(id)
      .then((d) => {
        setDoc(d)
        recordView(id)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-spill-accent" />
          </div>
        ) : error || !doc ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <AlertCircle className="mb-4 h-12 w-12 text-spill-error" />
            <h1 className="font-headline text-xl font-bold text-spill-text-primary">Document Not Found</h1>
            <p className="mt-2 text-sm text-spill-text-secondary">
              This document may not be indexed yet, or the ID is invalid.
            </p>
          </div>
        ) : (
          <>
            <DocumentViewer doc={doc} />
            <SimilarDocuments docId={id} />
          </>
        )}
      </main>

      <Footer />
    </div>
  )
}
