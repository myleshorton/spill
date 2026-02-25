'use client'

import Header from '@/components/Header'
import Footer from '@/components/Footer'
import UploadForm from '@/components/UploadForm'
import { Upload, Shield, Search, Globe } from 'lucide-react'

export default function UploadPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-spill-accent/15 ring-1 ring-spill-accent/30">
              <Upload className="h-5 w-5 text-spill-accent" />
            </div>
            <div>
              <h1 className="font-headline text-2xl font-bold text-spill-text-primary">
                Upload Documents
              </h1>
              <p className="text-sm text-spill-text-secondary">
                Contribute files to the public archive
              </p>
            </div>
          </div>
        </div>

        <UploadForm />

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-spill-divider bg-spill-surface/30 p-4">
            <Shield className="mb-2 h-4 w-4 text-amber-400" />
            <h3 className="font-headline text-xs font-semibold text-spill-text-primary">Virus Scanned</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-spill-text-secondary">
              Every upload is scanned with ClamAV before being accepted into the archive.
            </p>
          </div>
          <div className="rounded-lg border border-spill-divider bg-spill-surface/30 p-4">
            <Search className="mb-2 h-4 w-4 text-blue-400" />
            <h3 className="font-headline text-xs font-semibold text-spill-text-primary">Auto-Indexed</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-spill-text-secondary">
              Uploaded files are automatically indexed and become searchable within minutes.
            </p>
          </div>
          <div className="rounded-lg border border-spill-divider bg-spill-surface/30 p-4">
            <Globe className="mb-2 h-4 w-4 text-emerald-400" />
            <h3 className="font-headline text-xs font-semibold text-spill-text-primary">P2P Distributed</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-spill-text-secondary">
              Files are published to the P2P network and available via BitTorrent with WebSeed fallback.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
