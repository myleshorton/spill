'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, Menu, X, Database, FileText, Info, Upload, Share2, Users, ExternalLink, ChevronDown, Star, MessageSquare, Newspaper } from 'lucide-react'
import { siteConfig } from '@/config/site.config'

function HeaderSearch() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`)
    }
  }

  return (
    <form onSubmit={handleSearch} className="relative flex-1 max-w-2xl">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-spill-text-secondary" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={siteConfig.search.placeholderSmall}
        className="w-full rounded-lg border border-spill-divider bg-spill-surface py-2 pl-10 pr-4 font-body text-sm text-spill-text-primary placeholder:text-spill-text-secondary/60 focus:border-spill-accent/50 focus:outline-none focus:ring-1 focus:ring-spill-accent/30 transition-colors"
      />
    </form>
  )
}

function SisterSitesDropdown() {
  const [open, setOpen] = useState(false)
  const sites = siteConfig.sisterSites ?? []
  if (sites.length === 0) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-spill-text-secondary hover:bg-spill-surface hover:text-spill-text-primary transition-colors"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Archives
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-spill-divider bg-spill-bg p-1 shadow-lg">
            {sites.map((site) => (
              <a
                key={site.url}
                href={site.url}
                target="_blank"
                rel="noopener"
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-spill-text-secondary hover:bg-spill-surface hover:text-spill-text-primary transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                {site.name}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-spill-divider bg-spill-bg/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-md bg-spill-accent/15 ring-1 ring-spill-accent/30">
            <FileText className="h-4 w-4 text-spill-accent" />
            <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          </div>
          <div className="hidden sm:block">
            <span className="font-headline text-sm font-semibold tracking-tight text-spill-text-primary">
              {siteConfig.name}
            </span>
            <span className="ml-1.5 rounded bg-spill-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-spill-accent">
              {siteConfig.badge}
            </span>
          </div>
        </Link>

        <Suspense fallback={
          <div className="relative flex-1 max-w-2xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-spill-text-secondary" />
            <input
              type="text"
              placeholder={siteConfig.search.placeholderSmall}
              className="w-full rounded-lg border border-spill-divider bg-spill-surface py-2 pl-10 pr-4 font-body text-sm text-spill-text-primary placeholder:text-spill-text-secondary/60"
              readOnly
            />
          </div>
        }>
          <HeaderSearch />
        </Suspense>

        <nav className="hidden items-center gap-1 md:flex">
          <Link
            href="/datasets"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-spill-text-secondary hover:bg-spill-surface hover:text-spill-text-primary transition-colors"
          >
            <Database className="h-3.5 w-3.5" />
            Datasets
          </Link>
          <Link
            href="/analysis/entities"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-spill-text-secondary hover:bg-spill-surface hover:text-spill-text-primary transition-colors"
          >
            <Share2 className="h-3.5 w-3.5" />
            Network
          </Link>
          <Link
            href="/entities"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-spill-text-secondary hover:bg-spill-surface hover:text-spill-text-primary transition-colors"
          >
            <Users className="h-3.5 w-3.5" />
            People
          </Link>
          <Link
            href="/chat"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-spill-text-secondary hover:bg-spill-surface hover:text-spill-text-primary transition-colors"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Ask AI
          </Link>
          <Link
            href="/stars"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-spill-text-secondary hover:bg-spill-surface hover:text-spill-text-primary transition-colors"
          >
            <Star className="h-3.5 w-3.5" />
            Stars
          </Link>
          <Link
            href="/upload"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-spill-text-secondary hover:bg-spill-surface hover:text-spill-text-primary transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload
          </Link>
          <Link
            href="/blog"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-spill-text-secondary hover:bg-spill-surface hover:text-spill-text-primary transition-colors"
          >
            <Newspaper className="h-3.5 w-3.5" />
            Blog
          </Link>
          <Link
            href="/about"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-spill-text-secondary hover:bg-spill-surface hover:text-spill-text-primary transition-colors"
          >
            <Info className="h-3.5 w-3.5" />
            About
          </Link>
          <SisterSitesDropdown />
          <a
            href={siteConfig.links.github}
            target="_blank"
            rel="noopener"
            className="ml-1 rounded-md px-3 py-1.5 text-sm text-spill-text-secondary hover:bg-spill-surface hover:text-spill-text-primary transition-colors"
          >
            P2P
          </a>
        </nav>

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="rounded-md p-1.5 text-spill-text-secondary hover:bg-spill-surface md:hidden"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-spill-divider bg-spill-surface px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-2">
            <Link href="/datasets" className="rounded-md px-3 py-2 text-sm text-spill-text-secondary hover:text-spill-text-primary" onClick={() => setMobileMenuOpen(false)}>
              Datasets
            </Link>
            <Link href="/analysis/entities" className="rounded-md px-3 py-2 text-sm text-spill-text-secondary hover:text-spill-text-primary" onClick={() => setMobileMenuOpen(false)}>
              Network
            </Link>
            <Link href="/entities" className="rounded-md px-3 py-2 text-sm text-spill-text-secondary hover:text-spill-text-primary" onClick={() => setMobileMenuOpen(false)}>
              People
            </Link>
            <Link href="/chat" className="rounded-md px-3 py-2 text-sm text-spill-text-secondary hover:text-spill-text-primary" onClick={() => setMobileMenuOpen(false)}>
              Ask AI
            </Link>
            <Link href="/stars" className="rounded-md px-3 py-2 text-sm text-spill-text-secondary hover:text-spill-text-primary" onClick={() => setMobileMenuOpen(false)}>
              Stars
            </Link>
            <Link href="/upload" className="rounded-md px-3 py-2 text-sm text-spill-text-secondary hover:text-spill-text-primary" onClick={() => setMobileMenuOpen(false)}>
              Upload
            </Link>
            <Link href="/blog" className="rounded-md px-3 py-2 text-sm text-spill-text-secondary hover:text-spill-text-primary" onClick={() => setMobileMenuOpen(false)}>
              Blog
            </Link>
            <Link href="/about" className="rounded-md px-3 py-2 text-sm text-spill-text-secondary hover:text-spill-text-primary" onClick={() => setMobileMenuOpen(false)}>
              About
            </Link>
            {(siteConfig.sisterSites ?? []).length > 0 && (
              <>
                <div className="my-1 border-t border-spill-divider" />
                <span className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-spill-text-secondary/60">
                  Other Archives
                </span>
                {siteConfig.sisterSites.map((site) => (
                  <a
                    key={site.url}
                    href={site.url}
                    target="_blank"
                    rel="noopener"
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-spill-text-secondary hover:text-spill-text-primary"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {site.name}
                  </a>
                ))}
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}
