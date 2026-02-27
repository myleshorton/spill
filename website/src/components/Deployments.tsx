'use client';

import { motion } from 'framer-motion';

const useCases = [
  {
    title: 'Government Transparency',
    description:
      'FOIA documents, leaked memos, declassified files — preserved beyond any single government\'s reach.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
      </svg>
    ),
  },
  {
    title: 'Investigative Journalism',
    description:
      'Source materials, court documents, evidence collections — immune to legal takedowns and gag orders.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="8" y1="11" x2="14" y2="11" />
        <line x1="11" y1="8" x2="11" y2="14" />
      </svg>
    ),
  },
  {
    title: 'Censored Media',
    description:
      'News, video, audio suppressed by authoritarian regimes or platform policies — distributed beyond their reach.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    ),
  },
  {
    title: 'Academic Freedom',
    description:
      'Research papers, datasets, findings that face institutional suppression — permanently accessible to all.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
];

const deployments = [
  {
    name: 'Epstein Files Archive',
    url: 'https://unredact.org',
    stat: '370GB+ DOJ investigation documents',
    live: true,
  },
];

export default function Deployments() {
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
          Use Cases & <span className="text-gradient">Deployments</span>
        </h2>
        <p className="section-subtitle mx-auto">
          Spill is a general-purpose platform for any content that faces
          suppression.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-16">
        {useCases.map((uc, i) => (
          <motion.div
            key={uc.title}
            className="glass-card p-6 flex gap-4"
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
          >
            <div className="shrink-0 w-10 h-10 rounded-lg bg-spill-surface-light flex items-center justify-center text-spill-cyan">
              {uc.icon}
            </div>
            <div>
              <h3 className="font-headline font-semibold text-lg mb-1.5">
                {uc.title}
              </h3>
              <p className="text-spill-muted text-sm leading-relaxed">
                {uc.description}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Live deployments */}
      <motion.div
        initial={{ opacity: 0, y: 25 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5 }}
      >
        <h3 className="font-headline font-semibold text-xl mb-6 text-center">
          Live on Spill
        </h3>
        <div className="max-w-xl mx-auto">
          {deployments.map((d) => (
            <a
              key={d.name}
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-card p-6 flex items-center justify-between group block hover:border-spill-cyan/30 transition-colors"
            >
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h4 className="font-headline font-semibold text-lg group-hover:text-spill-cyan transition-colors">
                    {d.name}
                  </h4>
                  {d.live && (
                    <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-mono text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Live
                    </span>
                  )}
                </div>
                <p className="text-spill-muted text-sm">{d.stat}</p>
              </div>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-spill-muted group-hover:text-spill-cyan transition-colors shrink-0"
              >
                <line x1="7" y1="17" x2="17" y2="7" />
                <polyline points="7 7 17 7 17 17" />
              </svg>
            </a>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
