'use client';

import { motion } from 'framer-motion';
import NetworkMesh from './NetworkMesh';

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <NetworkMesh />

      {/* Radial gradient overlays for depth */}
      <div className="absolute inset-0 z-[1] bg-gradient-radial from-transparent via-transparent to-spill-bg" />
      <div className="absolute bottom-0 left-0 right-0 h-48 z-[1] bg-gradient-to-t from-spill-bg to-transparent" />

      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <h1 className="font-headline font-800 text-6xl sm:text-7xl md:text-8xl lg:text-9xl tracking-tight mb-4">
            <span className="text-gradient">Spill</span>
          </h1>
        </motion.div>

        <motion.p
          className="font-headline text-xl sm:text-2xl md:text-3xl font-medium text-spill-text/90 mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          The Censorship-Resistant Publishing Platform
        </motion.p>

        <motion.p
          className="text-base sm:text-lg text-spill-muted max-w-2xl mx-auto mb-10 leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          An open protocol for distributing content that can&apos;t be taken
          down. Publish anything. Preserve everything. No single point of
          failure.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <a
            href="#architecture"
            className="group relative px-8 py-3.5 rounded-full font-medium text-sm overflow-hidden transition-all"
          >
            <span className="absolute inset-0 bg-gradient-accent opacity-100 group-hover:opacity-90 transition-opacity" />
            <span className="relative z-10 text-spill-bg font-semibold">
              Explore the Architecture
            </span>
          </a>
          <a
            href="https://github.com/myleshorton/spill"
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-3.5 rounded-full font-medium text-sm border border-spill-border text-spill-text/80 hover:border-spill-cyan/40 hover:text-spill-cyan transition-all"
          >
            GitHub
          </a>
        </motion.div>
      </div>
    </section>
  );
}
