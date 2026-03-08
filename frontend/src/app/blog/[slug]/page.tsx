import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Calendar } from 'lucide-react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import type { Metadata } from 'next'
import { getPost, getAllPosts } from '@/lib/blog'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) return {}
  return {
    title: `${post.title} — Epstein Files Archive`,
    description: post.excerpt,
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) notFound()

  // Blog content is hardcoded in source — not user-supplied, safe to render
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <div className="mb-8">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1 text-sm text-spill-text-secondary hover:text-spill-text-primary transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            All Posts
          </Link>
        </div>

        <article>
          <header className="mb-8">
            <div className="flex items-center gap-2 text-xs text-spill-text-secondary mb-3">
              <Calendar className="h-3 w-3" />
              {post.date}
              {post.tag && (
                <span className="rounded bg-spill-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-spill-accent">
                  {post.tag}
                </span>
              )}
            </div>
            <h1 className="font-headline text-3xl font-extrabold text-spill-text-primary sm:text-4xl leading-tight">
              {post.title}
            </h1>
            <p className="mt-3 text-lg text-spill-text-secondary leading-relaxed">
              {post.excerpt}
            </p>
          </header>

          <div
            className="prose-spill"
            dangerouslySetInnerHTML={{ __html: post.html }}
          />
        </article>
      </main>

      <Footer />
    </div>
  )
}
