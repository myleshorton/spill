import { getAllPosts } from '@/lib/posts';
import BlogSection from '@/components/BlogSection';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Blog — Spill',
  description: 'Updates from the Spill network.',
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <main className="min-h-screen">
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 bg-spill-bg/80 backdrop-blur-lg border-b border-spill-border/50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <a href="/" className="font-headline font-bold text-xl text-gradient">
            Spill
          </a>
          <a
            href="/"
            className="text-sm text-spill-muted hover:text-spill-text transition-colors"
          >
            Back to Home
          </a>
        </div>
      </nav>

      <div className="pt-24">
        <BlogSection posts={posts} />
      </div>

      <Footer />
    </main>
  );
}
