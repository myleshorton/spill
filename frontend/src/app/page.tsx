import Link from 'next/link'
import { ArrowRight, FileText, Image, Video, Mail, DollarSign, Plane, AlertTriangle, Globe, Users, Search, Shield } from 'lucide-react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import HeroChat from '@/components/HeroChat'
import StatsBar from '@/components/StatsBar'
import ActivityFeed from '@/components/ActivityFeed'
import Recommendations from '@/components/Recommendations'
import LatestDocuments from '@/components/LatestDocuments'
import { siteConfig } from '@/config/site.config'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Plane, DollarSign, Mail, FileText, Image, Video, AlertTriangle, Globe, Users, Search, Shield,
}

// Server-side fetch uses internal Docker network URL
const SERVER_API = process.env.ARCHIVER_URL || 'http://localhost:4000'


export const revalidate = 60 // regenerate page every 60 seconds

async function getLatestDocs() {
  try {
    const res = await fetch(`${SERVER_API}/api/documents?limit=6&sort=newest`, { next: { revalidate: 60 } })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

export default async function HomePage() {
  const latestDocsPromise = getLatestDocs()
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.name,
    url: siteConfig.siteUrl,
    description: siteConfig.meta.description,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteConfig.siteUrl}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }

  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />

      <main className="flex-1">
        <section className="relative z-10">
          <div className="relative mx-auto max-w-4xl px-4 pb-10 pt-12 sm:px-6 sm:pb-12 sm:pt-16">
            <div className="animate-fade-in text-center">
              <div className="mb-6 inline-flex items-center">
                <span className="border border-spill-accent text-spill-accent bg-transparent px-3 py-1 font-headline text-xs font-extrabold uppercase tracking-widest">
                  {siteConfig.badge}
                </span>
              </div>

              <h1 className="font-headline text-4xl font-extrabold uppercase leading-[0.95] tracking-tight text-spill-text-primary sm:text-5xl lg:text-6xl">
                {siteConfig.hero.heading}
              </h1>

              <div className="mx-auto mt-4 inline-block bg-spill-accent/90 px-3 py-1 sm:px-4 sm:py-2">
                <span className="font-headline text-2xl font-extrabold uppercase leading-none tracking-tight text-white sm:text-3xl lg:text-4xl">
                  {siteConfig.hero.headingAccent}
                </span>
              </div>

              <div className="mx-auto mt-5 max-w-2xl">
                <ActivityFeed />
              </div>
            </div>

            <div className="relative z-10 mt-10 animate-slide-up" style={{ animationDelay: '150ms' }}>
              <HeroChat />
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 animate-slide-up" style={{ animationDelay: '250ms' }}>
              {siteConfig.featuredSearches.map((item) => {
                const Icon = ICON_MAP[item.iconName]
                const href = item.type
                  ? `/search?type=${encodeURIComponent(item.type)}`
                  : item.ds
                  ? `/search?ds=${encodeURIComponent(item.ds)}`
                  : `/search?q=${encodeURIComponent(item.query!)}`
                return (
                  <Link
                    key={item.label}
                    href={href}
                    className="flex items-center gap-1.5 rounded-sm border border-spill-divider bg-spill-surface px-3 py-1.5 text-sm text-spill-text-secondary hover:border-spill-accent/50 hover:text-spill-accent transition-all"
                  >
                    {Icon && <Icon className="h-3 w-3" />}
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        </section>

        <LatestDocumentsServer promise={latestDocsPromise} />

        <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6">
          <StatsBar />
        </section>

        <Recommendations />

        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
          <h2 className="font-headline text-xl font-bold text-spill-text-primary">{siteConfig.dataSetsIntro.browseHeading}</h2>
          <p className="mt-1 text-sm text-spill-text-secondary">
            {siteConfig.dataSetsIntro.browseSummary.replace('{count}', String(siteConfig.dataSets.length))}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {siteConfig.dataSets.map((ds) => (
              <DataSetCard key={ds.id} ds={ds} />
            ))}
          </div>
        </section>

        <section className="border-t border-spill-divider bg-spill-surface/30">
          <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
            <h2 className="font-headline text-2xl font-bold text-spill-text-primary">
              {siteConfig.whySection.heading}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-spill-text-secondary leading-relaxed">
              {siteConfig.whySection.body}
            </p>
            <Link
              href="/about"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-spill-accent px-5 py-2.5 font-headline text-sm font-semibold text-spill-bg hover:bg-spill-accent-hover transition-colors"
            >
              Learn More <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

async function LatestDocumentsServer({ promise }: { promise: Promise<{ documents: Array<{ id: string; title: string; contentType: string; fileSize: number; dataSet: number; hasThumbnail: boolean; origin: string | null }>, total: number } | null> }) {
  const data = await promise
  if (!data || data.documents.length === 0) return null

  return (
    <section className="relative border-y border-spill-divider bg-[#0D0D0D] py-10">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-end justify-between mb-1">
          <div>
            <h2 className="font-headline text-xl font-bold uppercase tracking-tight text-spill-text-primary">
              Latest Documents
            </h2>
            <span className="text-xs text-spill-text-secondary">
              {data.total.toLocaleString()} documents in the archive
            </span>
          </div>
          <Link href="/search" className="text-xs text-spill-text-secondary hover:text-spill-accent transition-colors">
            Browse all &rarr;
          </Link>
        </div>
        <div className="mb-6 h-px bg-gradient-to-r from-spill-accent/40 via-spill-divider to-transparent" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.documents.map((doc) => (
            <Link
              key={doc.id}
              href={`/doc/${doc.id}`}
              className="group rounded-lg border border-spill-divider bg-spill-surface overflow-hidden transition-all hover:border-spill-accent/30 hover:shadow-lg hover:shadow-spill-accent/5"
            >
              {doc.hasThumbnail ? (
                <div className="relative aspect-[16/9] overflow-hidden bg-spill-bg">
                  <img
                    src={`/api/documents/${doc.id}/thumbnail`}
                    alt=""
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute bottom-2 left-2">
                    <span className="rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] uppercase text-spill-accent backdrop-blur-sm">
                      {doc.contentType}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center aspect-[16/9] bg-spill-bg/50">
                  <FileText className="h-10 w-10 text-spill-text-secondary/20" />
                </div>
              )}
              <div className="p-3">
                <p className="line-clamp-2 text-sm font-medium text-spill-text-primary group-hover:text-spill-accent transition-colors">
                  {doc.title}
                </p>
                <div className="mt-1.5 flex items-center gap-2 text-[10px] text-spill-text-secondary">
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
          ))}
        </div>
      </div>
    </section>
  )
}

function DataSetCard({ ds }: { ds: typeof siteConfig.dataSets[number] }) {
  return (
    <Link
      href={`/datasets/${ds.id}`}
      className="group rounded-lg border border-spill-divider bg-spill-surface p-4 transition-all hover:border-spill-accent/30 hover:shadow-lg hover:shadow-spill-accent/5"
    >
      <div className="flex items-start justify-between">
        <span className="font-mono text-xs font-bold text-spill-accent">DS {ds.id}</span>
        <span className="rounded bg-spill-surface-light px-1.5 py-0.5 text-[10px] text-spill-text-secondary">{ds.size}</span>
      </div>
      <p className="mt-2 font-headline text-sm font-medium text-spill-text-primary group-hover:text-spill-accent transition-colors">
        {ds.shortName}
      </p>
      <div className="mt-3 flex items-center gap-1 text-xs text-spill-text-secondary/60 group-hover:text-spill-accent/60 transition-colors">
        Browse files <ArrowRight className="h-3 w-3" />
      </div>
    </Link>
  )
}
