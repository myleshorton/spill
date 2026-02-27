'use client';

import { motion } from 'framer-motion';

interface Post {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  category: string;
}

export default function BlogSection({ posts }: { posts: Post[] }) {
  const hasPosts = posts.length > 0;

  return (
    <section className="section">
      <motion.div
        className="text-center mb-16"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="section-title">
          <span className="text-gradient">Blog</span>
        </h2>
        <p className="section-subtitle mx-auto">
          Updates from the Spill network.
        </p>
      </motion.div>

      {hasPosts ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post, i) => (
            <motion.a
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="glass-card p-6 group block"
              initial={{ opacity: 0, y: 25 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
            >
              <span className="inline-block px-2.5 py-1 rounded text-[11px] uppercase tracking-wider font-mono text-spill-cyan bg-spill-cyan/10 mb-4">
                {post.category}
              </span>
              <h3 className="font-headline font-semibold text-lg mb-2 group-hover:text-spill-cyan transition-colors">
                {post.title}
              </h3>
              <p className="text-spill-muted text-sm leading-relaxed mb-3">
                {post.excerpt}
              </p>
              <time className="text-spill-muted/60 text-xs font-mono">
                {post.date}
              </time>
            </motion.a>
          ))}
        </div>
      ) : (
        <motion.div
          className="glass-card p-12 text-center max-w-lg mx-auto"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-spill-muted text-lg font-headline">
            Coming Soon
          </p>
          <p className="text-spill-muted/60 text-sm mt-2">
            Updates from the Spill network will appear here.
          </p>
        </motion.div>
      )}
    </section>
  );
}
