'use client';

import { motion } from 'framer-motion';

const steps = [
  {
    num: '01',
    title: 'Publish',
    subtitle: 'Content → Hyperdrive',
    description:
      'A publisher adds files to their Hyperdrive — a personal, append-only filesystem. Each publisher gets a unique keypair; their drive is their identity.',
    color: '#00F0D4',
  },
  {
    num: '02',
    title: 'Catalog',
    subtitle: 'Hyperdrive → Catalog Hypercore',
    description:
      'Metadata is written to a catalog Hypercore — a signed, append-only log. This catalog is the publisher\'s table of contents, replicated to every peer.',
    color: '#3B82F6',
  },
  {
    num: '03',
    title: 'Announce',
    subtitle: 'Catalog → Hyperswarm DHT',
    description:
      'The catalog key is announced on Hyperswarm, a distributed hash table. Peers discover it by joining topic channels — global or category-specific.',
    color: '#8B5CF6',
  },
  {
    num: '04',
    title: 'Discover',
    subtitle: 'DHT → Peer Connection',
    description:
      'New peers find publishers via DHT lookups. NAT traversal (hole-punching) enables direct connections. No relay servers needed.',
    color: '#EC4899',
  },
  {
    num: '05',
    title: 'Replicate',
    subtitle: 'Protomux → Catalog Sync',
    description:
      'Connected peers exchange catalog keys over Protomux multiplexed channels. Each peer builds a local index of all known content across the network.',
    color: '#F59E0B',
  },
  {
    num: '06',
    title: 'Stream',
    subtitle: 'Request → Content Delivery',
    description:
      'When a user requests content, it\'s fetched directly from peers who have it. Archiver nodes provide persistent availability — always-on seeders.',
    color: '#00F0D4',
  },
];

export default function HowItWorks() {
  return (
    <section id="architecture" className="section">
      <motion.div
        className="text-center mb-20"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="section-title">
          How It <span className="text-gradient">Works</span>
        </h2>
        <p className="section-subtitle mx-auto">
          From publish to stream — six steps to indestructible content.
        </p>
      </motion.div>

      <div className="relative">
        {/* Vertical line connector */}
        <div className="absolute left-[27px] md:left-1/2 md:-translate-x-px top-0 bottom-0 w-px bg-gradient-to-b from-spill-cyan/40 via-spill-violet/40 to-transparent hidden sm:block" />

        <div className="space-y-12 md:space-y-16">
          {steps.map((step, i) => {
            const isLeft = i % 2 === 0;
            return (
              <motion.div
                key={step.num}
                className={`relative flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-12 ${
                  isLeft ? 'md:flex-row' : 'md:flex-row-reverse'
                }`}
                initial={{ opacity: 0, x: isLeft ? -40 : 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                {/* Step number dot */}
                <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 w-14 h-14 rounded-full items-center justify-center z-10"
                  style={{ background: `${step.color}15`, border: `2px solid ${step.color}40` }}
                >
                  <span className="font-mono text-sm font-bold" style={{ color: step.color }}>
                    {step.num}
                  </span>
                </div>

                {/* Card */}
                <div className={`glass-card p-6 md:p-8 md:w-[calc(50%-60px)] ${isLeft ? 'md:mr-auto' : 'md:ml-auto'}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      className="md:hidden font-mono text-xs font-bold px-2.5 py-1 rounded-md"
                      style={{ background: `${step.color}15`, color: step.color }}
                    >
                      {step.num}
                    </span>
                    <h3 className="font-headline font-semibold text-xl">
                      {step.title}
                    </h3>
                  </div>
                  <p className="font-mono text-xs mb-3" style={{ color: step.color }}>
                    {step.subtitle}
                  </p>
                  <p className="text-spill-muted text-[15px] leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
