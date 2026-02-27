'use client';

import { motion } from 'framer-motion';

const features = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    title: 'Publish Anything',
    description:
      'Documents, video, audio, datasets — any content that needs to survive attempts to suppress it. No file type restrictions, no content gatekeepers.',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <circle cx="4" cy="6" r="2" />
        <circle cx="20" cy="6" r="2" />
        <circle cx="4" cy="18" r="2" />
        <circle cx="20" cy="18" r="2" />
        <line x1="6" y1="6" x2="9.5" y2="10" />
        <line x1="18" y1="6" x2="14.5" y2="10" />
        <line x1="6" y1="18" x2="9.5" y2="14" />
        <line x1="18" y1="18" x2="14.5" y2="14" />
      </svg>
    ),
    title: 'Indestructible Distribution',
    description:
      'Hyperswarm DHT means no central server to seize. Content replicates across every peer. Kill one node, thousands remain.',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
        <line x1="14" y1="4" x2="10" y2="20" />
      </svg>
    ),
    title: 'Open Protocol',
    description:
      'Fully auditable, extensible, and free. Anyone can run a node, launch an archive, or build on the protocol. No permission needed.',
  },
];

export default function Features() {
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
          What is <span className="text-gradient">Spill</span>?
        </h2>
        <p className="section-subtitle mx-auto">
          A peer-to-peer protocol designed from the ground up for content that
          powerful actors want to disappear.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {features.map((feature, i) => (
          <motion.div
            key={feature.title}
            className="glass-card p-8 flex flex-col"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: i * 0.12 }}
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-accent flex items-center justify-center text-spill-bg mb-5">
              {feature.icon}
            </div>
            <h3 className="font-headline font-semibold text-xl mb-3">
              {feature.title}
            </h3>
            <p className="text-spill-muted leading-relaxed text-[15px]">
              {feature.description}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
