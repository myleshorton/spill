'use client';

import { motion } from 'framer-motion';

const tech = [
  {
    name: 'Hyperswarm',
    role: 'Distributed peer discovery via Kademlia DHT with NAT hole-punching',
    color: '#00F0D4',
  },
  {
    name: 'Hypercore',
    role: 'Signed, append-only logs — the tamper-proof data primitive under everything',
    color: '#3B82F6',
  },
  {
    name: 'Hyperdrive',
    role: 'P2P filesystem for publishers — content-addressed, replicated to every peer',
    color: '#8B5CF6',
  },
  {
    name: 'Protomux',
    role: 'Multiplexed protocol channels over a single encrypted connection',
    color: '#EC4899',
  },
  {
    name: 'Hyperbee',
    role: 'Distributed B-tree index — enables sorted queries across peer-replicated data',
    color: '#F59E0B',
  },
  {
    name: 'Corestore',
    role: 'Manages collections of Hypercores — one store per peer, automatic replication',
    color: '#10B981',
  },
  {
    name: 'Bare Runtime',
    role: 'Minimal JS runtime built for P2P — no browser overhead, direct OS access',
    color: '#E2E8F0',
  },
  {
    name: 'Distributed Search',
    role: 'New content auto-indexed on arrival — every peer maintains a searchable catalog',
    color: '#06B6D4',
  },
];

export default function TechStack() {
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
          The <span className="text-gradient">Stack</span>
        </h2>
        <p className="section-subtitle mx-auto">
          The Hypercore Protocol stack — peer-to-peer from the ground up.
        </p>
      </motion.div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {tech.map((t, i) => (
          <motion.div
            key={t.name}
            className="glass-card p-5 text-center group"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.4, delay: i * 0.06 }}
          >
            <div
              className="w-10 h-10 rounded-lg mx-auto mb-3 flex items-center justify-center font-headline font-bold text-lg"
              style={{
                background: `${t.color}15`,
                color: t.color,
              }}
            >
              {t.name[0]}
            </div>
            <h3 className="font-headline font-semibold text-sm mb-1">
              {t.name}
            </h3>
            <p className="text-spill-muted text-xs leading-relaxed">
              {t.role}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
