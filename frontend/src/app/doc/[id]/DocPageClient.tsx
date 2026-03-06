'use client'

import { useEffect, Suspense } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import DocumentViewer from '@/components/DocumentViewer'
import SimilarDocuments from '@/components/SimilarDocuments'
import ResultSetNav from '@/components/ResultSetNav'
import { recordView, type Document } from '@/lib/api'

export default function DocPageClient({ doc, serverTextSnippet }: { doc: Document; serverTextSnippet?: string }) {
  useEffect(() => {
    recordView(doc.id)
  }, [doc.id])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <Suspense>
          <ResultSetNav />
        </Suspense>
        <DocumentViewer doc={doc} />

        {/* Server-rendered text snippet for SEO — visible to crawlers, hidden visually */}
        {serverTextSnippet && (
          <div className="sr-only" aria-hidden="true">
            <h2>Document Text</h2>
            <p>{serverTextSnippet}</p>
          </div>
        )}

        <SimilarDocuments docId={doc.id} />
      </main>

      <Footer />
    </div>
  )
}
