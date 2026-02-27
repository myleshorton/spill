'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const tabs = [
  {
    id: 'hyperswarm',
    label: 'Hyperswarm',
    title: 'Peer Discovery & NAT Traversal',
    content:
      'Every Spill node connects to the Hyperswarm DHT — a Kademlia-based distributed hash table. Peers find each other by joining topic hashes. NAT hole-punching enables direct connections without relay infrastructure.',
    code: `// Join the global Spill topic
const globalTopic = crypto.createHash('sha256')
  .update('spill-global-feed')
  .digest()

const swarm = new Hyperswarm()
const discovery = swarm.join(globalTopic, {
  server: true,   // accept incoming connections
  client: true    // initiate outgoing connections
})

// Category-specific topics for filtered discovery
const categoryTopic = crypto.createHash('sha256')
  .update('spill-category-government')
  .digest()
swarm.join(categoryTopic, { server: true, client: true })

swarm.on('connection', (socket, peerInfo) => {
  // Multiplex channels over this connection
  store.replicate(socket)
})`,
    lang: 'javascript',
  },
  {
    id: 'hyperdrive',
    label: 'Hyperdrive',
    title: 'Content Storage & Append-Only Logs',
    content:
      'Each publisher owns a Hyperdrive — a POSIX-compatible filesystem backed by Hypercore append-only logs. Files are content-addressed and cryptographically signed. The catalog Hypercore is a structured index of all published content.',
    code: `// Create a publisher's drive
const drive = new Hyperdrive(store)
await drive.ready()

// Publish a document
await drive.put('/documents/evidence-001.pdf', buffer)

// Write to the catalog — append-only content index
const catalog = store.get({ name: 'catalog' })
await catalog.append(JSON.stringify({
  type: 'document',
  path: '/documents/evidence-001.pdf',
  title: 'Evidence Document 001',
  hash: sha256(buffer),
  timestamp: Date.now(),
  size: buffer.length
}))

// The drive's discovery key is your public identity
console.log('Publisher key:', drive.key.toString('hex'))`,
    lang: 'javascript',
  },
  {
    id: 'protomux',
    label: 'Protomux',
    title: 'Multiplexed Messaging Channels',
    content:
      'Protomux enables multiple logical channels over a single connection. Peers exchange catalog keys, sync content metadata, and stream files — all multiplexed over one encrypted socket. Each channel is a typed protocol with its own state machine.',
    code: `// Open a catalog exchange channel
const mux = Protomux.from(socket)
const channel = mux.createChannel({
  protocol: 'spill/catalog-exchange',
  id: localCatalogKey
})

// Announce local catalog to peer
const announceMsg = channel.addMessage({
  encoding: c.buffer,
  onmessage(catalogKey) {
    // Peer shared their catalog — replicate it
    const remoteCatalog = store.get(catalogKey)
    remoteCatalog.on('append', () => {
      // New content indexed — update local search
      indexNewEntries(remoteCatalog)
    })
  }
})

channel.open()
announceMsg.send(localCatalogKey)`,
    lang: 'javascript',
  },
  {
    id: 'archiver',
    label: 'Archiver Nodes',
    title: 'Persistent Seeders & REST API',
    content:
      'Archiver nodes are always-on seeders that auto-download everything on the network. They provide REST API access, full-text search via Meilisearch, torrent bridges, and web interfaces. Run one to guarantee content availability.',
    code: `// Archiver auto-downloads all discovered content
swarm.on('connection', async (socket) => {
  const mux = Protomux.from(socket)
  // Replicate everything — archiver stores all content
  store.replicate(socket)

  // Index into Meilisearch for full-text search
  catalog.on('append', async () => {
    const entry = JSON.parse(
      await catalog.get(catalog.length - 1)
    )
    await meili.index('documents').addDocuments([{
      id: entry.hash,
      title: entry.title,
      content: await extractText(entry.path),
      publishedAt: entry.timestamp
    }])
  })
})

// REST API serves content to web browsers
app.get('/api/documents/:hash', async (req, res) => {
  const doc = db.getByHash(req.params.hash)
  res.json(doc)
})`,
    lang: 'javascript',
  },
  {
    id: 'crawler',
    label: 'Web Crawler',
    title: 'Automated Document Discovery',
    content:
      'The crawler automatically discovers documents from court dockets, government portals, and news sites. It downloads, deduplicates, generates thumbnails, extracts text and embeddings, then publishes to the P2P network.',
    code: `// Crawler pipeline: discover → fetch → process → publish
const crawler = new DocumentCrawler({
  sources: [
    { type: 'court-docket', url: 'https://...' },
    { type: 'foia-portal', url: 'https://...' },
    { type: 'rss-feed', url: 'https://...' }
  ]
})

crawler.on('document', async (doc) => {
  // Deduplicate by content hash
  const hash = sha256(doc.buffer)
  if (await db.exists(hash)) return

  // Extract text, generate thumbnails
  const text = await extractText(doc.buffer)
  const thumbnail = await generateThumbnail(doc.buffer)

  // Generate embeddings for semantic search
  const embedding = await embed(text)

  // Save to local DB + Meilisearch index
  await db.insert({ hash, text, embedding, ...doc })

  // Publish to Hyperdrive → available on P2P network
  await drive.put(\`/documents/\${hash}.pdf\`, doc.buffer)
  await catalog.append(JSON.stringify({ hash, ...doc }))
})`,
    lang: 'javascript',
  },
  {
    id: 'mirage',
    label: 'MIRAGE',
    title: 'CDN-Native Censorship Evasion',
    badge: 'Coming Soon',
    content:
      'MIRAGE is a next-generation transport protocol designed to be indistinguishable from normal CDN traffic. It achieves HTTP/2 conformance, adaptive traffic morphing, and runs as a WASM module in the WATER runtime — making it deployable as a CDN edge function.',
    code: `// MIRAGE protocol — designed for the WATER runtime
// Compiles to WASM, deploys to CDN edge

interface MirageConfig {
  // HTTP/2 conformant framing
  frameType: 'DATA' | 'HEADERS' | 'SETTINGS'
  // Adaptive traffic morphing
  morphing: {
    strategy: 'cdn-mimicry'
    targetProfile: 'cloudflare-stream'
    jitter: { min: 2, max: 15 }  // ms
  }
  // Statistical conformance
  burstProfile: 'video-streaming'
  packetSizeDistribution: 'empirical-cdn'
}

// Resistant to:
// - Deep packet inspection (DPI)
// - Statistical traffic analysis
// - Active probing
// - TLS fingerprinting
// - Flow correlation attacks`,
    lang: 'typescript',
  },
];

function TerminalBlock({ code, lang }: { code: string; lang: string }) {
  return (
    <div className="terminal mt-5">
      <div className="terminal-header">
        <span className="terminal-dot bg-[#FF5F57]" />
        <span className="terminal-dot bg-[#FEBC2E]" />
        <span className="terminal-dot bg-[#28C840]" />
        <span className="ml-3 text-xs text-spill-muted font-mono">{lang}</span>
      </div>
      <div className="terminal-body">
        <pre className="whitespace-pre-wrap">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

export default function DeepDive() {
  const [activeTab, setActiveTab] = useState('hyperswarm');
  const active = tabs.find((t) => t.id === activeTab)!;

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
          Architecture <span className="text-gradient">Deep Dive</span>
        </h2>
        <p className="section-subtitle mx-auto">
          Under the hood — the protocols that make censorship resistance
          possible.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.5 }}
      >
        {/* Tab bar */}
        <div className="flex flex-wrap gap-2 mb-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg font-mono text-sm transition-all flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'bg-spill-cyan/10 text-spill-cyan border border-spill-cyan/30'
                  : 'text-spill-muted border border-spill-border hover:border-spill-muted/40 hover:text-spill-text/70'
              }`}
            >
              {tab.label}
              {'badge' in tab && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-spill-violet/20 text-spill-violet">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="glass-card p-8"
          >
            <h3 className="font-headline font-semibold text-2xl mb-4">
              {active.title}
            </h3>
            <p className="text-spill-muted leading-relaxed text-[15px] max-w-3xl">
              {active.content}
            </p>
            <TerminalBlock code={active.code} lang={active.lang ?? 'javascript'} />
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
