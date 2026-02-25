import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { Shield, Database, Search, Globe, FileText, Lock } from 'lucide-react'

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="font-headline text-3xl font-bold text-spill-text-primary">
          About This Archive
        </h1>

        <div className="mt-8 space-y-8">
          <Section>
            <p className="text-spill-text-secondary leading-relaxed">
              In 2025, the U.S. Department of Justice released over 370 gigabytes of documents related to the
              investigation of Jeffrey Epstein. These 12 data sets contain approximately 1.4 million files
              spanning 3.5 million pages — FBI interview summaries, police reports, emails, financial records,
              flight manifests, seized photographs and videos, and more.
            </p>
            <p className="mt-4 text-spill-text-secondary leading-relaxed">
              This archive exists to make these public records genuinely accessible. Raw document dumps are
              functionally opaque to most people. We&apos;ve indexed every file, applied OCR to scanned documents,
              and built full-text search across the entire collection. Every document is browsable, searchable,
              and downloadable.
            </p>
          </Section>

          <Section title="How It Works" icon={Database}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FeatureCard
                icon={Search}
                title="Full-Text Search"
                description="Every document is OCR'd and indexed with Meilisearch. Search across 3.5 million pages with typo tolerance, faceted filtering by data set and file type, and sub-200ms results."
              />
              <FeatureCard
                icon={Shield}
                title="Censorship Resistant"
                description="The archive is distributed via the Spill P2P network using Hyperswarm. If this server goes offline, other peer nodes retain full copies of the data."
              />
              <FeatureCard
                icon={FileText}
                title="Document Viewer"
                description="PDFs render inline with PDF.js. Images, videos, and audio files play natively. Extracted text is available for every document for accessibility and copy-paste."
              />
              <FeatureCard
                icon={Globe}
                title="Open Source"
                description="The archive software, ingest pipeline, and P2P distribution layer are all open source. Anyone can run their own mirror or contribute improvements."
              />
            </div>
          </Section>

          <Section title="Data Sources" icon={Database}>
            <p className="text-spill-text-secondary leading-relaxed">
              All documents in this archive are public records released by the U.S. Department of Justice.
              The raw data sets are available from:
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-spill-text-secondary">
              <li className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-spill-accent" />
                U.S. Department of Justice official release
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-spill-accent" />
                Internet Archive community mirrors
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-spill-accent" />
                BitTorrent community distribution
              </li>
            </ul>
          </Section>

          <Section title="Processing Pipeline" icon={FileText}>
            <div className="space-y-3">
              <Step n={1} title="Download" description="All 12 data sets downloaded via BitTorrent and verified against published checksums." />
              <Step n={2} title="Catalog" description="Every file cataloged by type, size, and data set membership. File types detected by extension and magic bytes." />
              <Step n={3} title="Text Extraction" description="Text-layer PDFs processed with PyMuPDF. Scanned documents OCR'd with Tesseract. Emails and spreadsheets parsed for content." />
              <Step n={4} title="Thumbnail Generation" description="PDF pages, images, and video frames thumbnailed for visual browsing." />
              <Step n={5} title="Indexing" description="All extracted text indexed in Meilisearch with filterable facets for data set, file type, and category." />
              <Step n={6} title="P2P Distribution" description="Files published to Hyperdrives and announced on the Spill network for decentralized replication." />
            </div>
          </Section>

          <Section title="Privacy & Security" icon={Lock}>
            <p className="text-spill-text-secondary leading-relaxed">
              This archive does not require an account, does not set tracking cookies, and does not log
              search queries. No analytics service is used. The site is served over HTTPS with a Let&apos;s Encrypt
              certificate. The P2P distribution layer uses end-to-end encrypted connections via the Noise protocol.
            </p>
          </Section>

          <Section title="Technical Stack">
            <div className="rounded-lg border border-spill-divider bg-spill-surface p-4">
              <div className="grid gap-y-2 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-spill-text-secondary">Frontend:</span>{' '}
                  <span className="text-spill-text-primary">Next.js + Tailwind CSS</span>
                </div>
                <div>
                  <span className="text-spill-text-secondary">Search:</span>{' '}
                  <span className="text-spill-text-primary">Meilisearch</span>
                </div>
                <div>
                  <span className="text-spill-text-secondary">Database:</span>{' '}
                  <span className="text-spill-text-primary">SQLite</span>
                </div>
                <div>
                  <span className="text-spill-text-secondary">P2P:</span>{' '}
                  <span className="text-spill-text-primary">Hyperswarm + Hyperdrive</span>
                </div>
                <div>
                  <span className="text-spill-text-secondary">OCR:</span>{' '}
                  <span className="text-spill-text-primary">Tesseract + PyMuPDF</span>
                </div>
                <div>
                  <span className="text-spill-text-secondary">Hosting:</span>{' '}
                  <span className="text-spill-text-primary">Hetzner Dedicated</span>
                </div>
              </div>
            </div>
          </Section>
        </div>
      </main>

      <Footer />
    </div>
  )
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title?: string
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <section>
      {title && (
        <h2 className="mb-4 flex items-center gap-2 font-headline text-xl font-bold text-spill-text-primary">
          {Icon && <Icon className="h-5 w-5 text-spill-accent" />}
          {title}
        </h2>
      )}
      {children}
    </section>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="rounded-lg border border-spill-divider bg-spill-surface p-4">
      <Icon className="mb-2 h-5 w-5 text-spill-accent" />
      <h3 className="font-headline text-sm font-semibold text-spill-text-primary">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-spill-text-secondary">{description}</p>
    </div>
  )
}

function Step({ n, title, description }: { n: number, title: string, description: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-spill-accent/15 font-mono text-xs font-bold text-spill-accent">
        {n}
      </div>
      <div>
        <h4 className="font-headline text-sm font-semibold text-spill-text-primary">{title}</h4>
        <p className="mt-0.5 text-sm text-spill-text-secondary">{description}</p>
      </div>
    </div>
  )
}
