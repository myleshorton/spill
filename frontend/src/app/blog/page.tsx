import Link from 'next/link'
import { Newspaper, ArrowRight, Calendar } from 'lucide-react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import type { Metadata } from 'next'
import { getAllPosts } from '@/lib/blog'

export const metadata: Metadata = {
  title: 'Blog — Epstein Files Archive',
  description: 'Updates, investigations, and technical dispatches from the team behind the Epstein Files Archive.',
}

export default function BlogIndex() {
  const posts = getAllPosts()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-spill-accent/15">
            <Newspaper className="h-5 w-5 text-spill-accent" />
          </div>
          <div>
            <h1 className="font-headline text-3xl font-bold text-spill-text-primary">
              Blog
            </h1>
            <p className="text-sm text-spill-text-secondary">
              Dispatches from the archive
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group block rounded-lg border border-spill-divider bg-spill-surface p-6 transition-all hover:border-spill-accent/30 hover:shadow-lg hover:shadow-spill-accent/5"
            >
              <div className="flex items-center gap-2 text-xs text-spill-text-secondary mb-2">
                <Calendar className="h-3 w-3" />
                {post.date}
                {post.tag && (
                  <span className="rounded bg-spill-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-spill-accent">
                    {post.tag}
                  </span>
                )}
              </div>
              <h2 className="font-headline text-xl font-bold text-spill-text-primary group-hover:text-spill-accent transition-colors">
                {post.title}
              </h2>
              <p className="mt-2 text-sm text-spill-text-secondary leading-relaxed">
                {post.excerpt}
              </p>
              <div className="mt-3 flex items-center gap-1 text-xs text-spill-accent opacity-0 group-hover:opacity-100 transition-opacity">
                Read more <ArrowRight className="h-3 w-3" />
              </div>
            </Link>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  )
}
