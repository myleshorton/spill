import Link from 'next/link'
import { ArrowRight, FileText, Image, Video, Mail, DollarSign, Plane, AlertTriangle, Globe, Users, Search, Shield } from 'lucide-react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import SearchBar from '@/components/SearchBar'
import StatsBar from '@/components/StatsBar'
import ActivityFeed from '@/components/ActivityFeed'
import Recommendations from '@/components/Recommendations'
import FeaturedPhotos from '@/components/FeaturedPhotos'
import { type Document } from '@/lib/api'
import { siteConfig } from '@/config/site.config'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Plane, DollarSign, Mail, FileText, Image, Video, AlertTriangle, Globe, Users, Search, Shield,
}

// Server-side fetch uses internal Docker network URL
const SERVER_API = process.env.ARCHIVER_URL || 'http://localhost:4000'

async function getInitialPhotos(): Promise<{ documents: Document[]; total: number }> {
  try {
    const res = await fetch(`${SERVER_API}/api/featured-photos?limit=6&offset=0`, { next: { revalidate: 60 } })
    if (res.ok) return res.json()
  } catch {}
  return { documents: [], total: 0 }
}

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const initialPhotos = await getInitialPhotos()
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <section className="relative z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-spill-accent/[0.03] via-transparent to-transparent" />
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(0, 191, 166, 0.08) 0%, transparent 50%)',
          }} />

          <div className="relative mx-auto max-w-4xl px-4 pb-10 pt-12 sm:px-6 sm:pb-12 sm:pt-16">
            <div className="animate-fade-in text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-spill-divider bg-spill-surface px-3 py-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-spill-accent" />
                <span className="font-mono text-xs text-spill-text-secondary">LIVE P2P ARCHIVE — CONTINUOUSLY CRAWLING</span>
              </div>

              <h1 className="font-headline text-4xl font-bold leading-tight tracking-tight text-spill-text-primary sm:text-5xl lg:text-6xl">
                {siteConfig.hero.heading}
                <span className="block text-spill-accent">{siteConfig.hero.headingAccent}</span>
              </h1>

              <div className="mx-auto mt-5 max-w-2xl">
                <ActivityFeed />
              </div>
            </div>

            <div className="relative z-10 mt-10 animate-slide-up" style={{ animationDelay: '150ms' }}>
              <SearchBar large autoFocus />
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
                    className="flex items-center gap-1.5 rounded-full border border-spill-divider bg-spill-surface px-3 py-1.5 text-sm text-spill-text-secondary hover:border-spill-accent/30 hover:text-spill-accent transition-all"
                  >
                    {Icon && <Icon className="h-3 w-3" />}
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        </section>

        <FeaturedPhotos initialData={initialPhotos} />

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
