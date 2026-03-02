import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { FileQuestion } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Page Not Found',
  robots: { index: false },
}

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex flex-1 items-center justify-center px-4">
        <div className="text-center">
          <FileQuestion className="mx-auto h-16 w-16 text-spill-text-secondary/40" />
          <h1 className="mt-6 font-headline text-3xl font-bold text-spill-text-primary">
            404
          </h1>
          <p className="mt-2 text-spill-text-secondary">
            This page doesn't exist or has been removed.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="/"
              className="rounded-lg bg-spill-accent px-5 py-2.5 font-headline text-sm font-semibold text-spill-bg hover:bg-spill-accent-hover transition-colors"
            >
              Go Home
            </Link>
            <Link
              href="/search"
              className="rounded-lg border border-spill-divider px-5 py-2.5 font-headline text-sm font-semibold text-spill-text-secondary hover:border-spill-accent/30 hover:text-spill-accent transition-colors"
            >
              Search Archive
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
