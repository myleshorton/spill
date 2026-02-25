import Link from 'next/link'
import { Shield } from 'lucide-react'
import { siteConfig } from '@/config/site.config'

export default function Footer() {
  return (
    <footer className="border-t border-spill-divider bg-spill-surface/50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-spill-accent" />
              <span className="font-headline text-sm font-semibold text-spill-text-primary">
                {siteConfig.footer.tagline}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-spill-text-secondary">
              {siteConfig.footer.disclaimer}
            </p>
          </div>

          <div>
            <h4 className="font-headline text-xs font-semibold uppercase tracking-wider text-spill-text-secondary">
              Navigate
            </h4>
            <nav className="mt-2 flex flex-col gap-1">
              <Link href="/search" className="text-sm text-spill-text-secondary hover:text-spill-accent transition-colors">Search</Link>
              <Link href="/datasets" className="text-sm text-spill-text-secondary hover:text-spill-accent transition-colors">Data Sets</Link>
              <Link href="/about" className="text-sm text-spill-text-secondary hover:text-spill-accent transition-colors">About</Link>
            </nav>
          </div>

          <div>
            <h4 className="font-headline text-xs font-semibold uppercase tracking-wider text-spill-text-secondary">
              Sources
            </h4>
            <nav className="mt-2 flex flex-col gap-1">
              {siteConfig.footer.sourceLinks.map((link) => (
                <a key={link.url} href={link.url} target="_blank" rel="noopener" className="text-sm text-spill-text-secondary hover:text-spill-accent transition-colors">
                  {link.label}
                </a>
              ))}
            </nav>
          </div>
        </div>

        <div className="mt-8 border-t border-spill-divider pt-6 text-center">
          <p className="text-xs text-spill-text-secondary/60">
            {siteConfig.footer.creditHtml} Powered by{' '}
            <a href={siteConfig.links.github} target="_blank" rel="noopener" className="text-spill-accent/70 hover:text-spill-accent">
              Spill P2P
            </a>.
          </p>
        </div>
      </div>
    </footer>
  )
}
