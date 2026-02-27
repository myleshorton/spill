import { notFound } from 'next/navigation';
import { getAllSlugs, getPostBySlug } from '@/lib/posts';
import Footer from '@/components/Footer';

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const post = getPostBySlug(params.slug);
  if (!post) return { title: 'Not Found — Spill' };
  return {
    title: `${post.title} — Spill`,
    description: post.excerpt,
  };
}

export default function BlogPost({ params }: { params: { slug: string } }) {
  const post = getPostBySlug(params.slug);
  if (!post) notFound();

  return (
    <main className="min-h-screen">
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 bg-spill-bg/80 backdrop-blur-lg border-b border-spill-border/50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <a href="/" className="font-headline font-bold text-xl text-gradient">
            Spill
          </a>
          <a
            href="/blog"
            className="text-sm text-spill-muted hover:text-spill-text transition-colors"
          >
            All Posts
          </a>
        </div>
      </nav>

      <article className="pt-32 pb-24 px-6 max-w-3xl mx-auto">
        <div className="mb-8">
          <span className="inline-block px-2.5 py-1 rounded text-[11px] uppercase tracking-wider font-mono text-spill-cyan bg-spill-cyan/10 mb-4">
            {post.category}
          </span>
          <h1 className="font-headline font-bold text-4xl md:text-5xl mb-4">
            {post.title}
          </h1>
          <time className="text-spill-muted text-sm font-mono">{post.date}</time>
        </div>

        <div className="prose prose-invert prose-lg max-w-none [&_p]:text-spill-text/80 [&_p]:leading-relaxed [&_h2]:font-headline [&_h2]:font-semibold [&_h2]:text-spill-text [&_a]:text-spill-cyan [&_code]:font-mono [&_code]:text-spill-cyan/80 [&_pre]:terminal [&_blockquote]:border-spill-cyan/30">
          <div className="whitespace-pre-wrap text-spill-text/80 leading-relaxed">
            {post.content}
          </div>
        </div>
      </article>

      <Footer />
    </main>
  );
}
