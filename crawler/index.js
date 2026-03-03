#!/usr/bin/env node

const path = require('path')
const fs = require('fs')

const CrawlDatabase = require('./lib/crawl-db')
const Fetcher = require('./lib/fetcher')
const RelevanceScorer = require('./lib/relevance')
const ContentProcessor = require('./lib/content-processor')
const Scheduler = require('./lib/scheduler')
const SocialPoster = require('./lib/social-poster')

// Adapters
const GenericAdapter = require('./lib/adapters/generic')
const CourtAdapter = require('./lib/adapters/court')
const ArchiveOrgAdapter = require('./lib/adapters/archive-org')
const NewsAdapter = require('./lib/adapters/news')
const GovernmentAdapter = require('./lib/adapters/government')
const DocumentCloudAdapter = require('./lib/adapters/documentcloud')
const SearchDiscoveryAdapter = require('./lib/adapters/search-discovery')

// Reused modules from archiver/ingest
const DocumentsDatabase = require('../archiver/lib/documents-db')
const SearchIndex = require('../archiver/lib/meilisearch')

let textExtract, thumbnails, fileUtils, transcriber, embedder, imageKeywords
try {
  textExtract = require('../ingest/lib/text-extract')
  thumbnails = require('../ingest/lib/thumbnails')
  fileUtils = require('../ingest/lib/file-utils')
  transcriber = require('../ingest/lib/transcriber')
  embedder = require('../ingest/lib/embedder')
} catch (err) {
  console.warn('[crawler] Optional ingest modules not available: %s', err.message)
}
try {
  imageKeywords = require('../ingest/lib/image-keywords')
} catch {}

// --- Config ---

const CRAWL_DB_PATH = process.env.CRAWL_DB_PATH || path.join(__dirname, 'data', 'crawl.db')
const DOCS_DB_PATH = process.env.DOCS_DB_PATH || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const SEEDS_PATH = path.join(__dirname, 'seeds.json')

function parseArgs (args) {
  const opts = {
    command: args[0] || 'help',
    concurrency: 5,
    depth: 3,
    adapters: null,
    minRelevance: 0.3,
    dryRun: false,
  }

  for (let i = 1; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--concurrency' && args[i + 1]) {
      opts.concurrency = parseInt(args[++i], 10)
    } else if (arg === '--depth' && args[i + 1]) {
      opts.depth = parseInt(args[++i], 10)
    } else if (arg === '--adapters' && args[i + 1]) {
      opts.adapters = args[++i].split(',').map(a => a.trim())
    } else if (arg === '--min-relevance' && args[i + 1]) {
      opts.minRelevance = parseFloat(args[++i])
    } else if (arg === '--dry-run') {
      opts.dryRun = true
    }
  }

  return opts
}

function loadSeeds () {
  if (!fs.existsSync(SEEDS_PATH)) {
    console.error('[crawler] seeds.json not found at %s', SEEDS_PATH)
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(SEEDS_PATH, 'utf8'))
}

// --- Commands ---

async function cmdSeed () {
  const seeds = loadSeeds()
  const crawlDb = new CrawlDatabase(CRAWL_DB_PATH)

  let total = 0

  // Load seed URLs directly
  for (const seed of seeds.seedUrls) {
    const id = crawlDb.addUrl(seed.url, {
      priority: seed.priority || 0.5,
      source: seed.adapter || 'generic',
      depth: 0,
    })
    if (id) total++
  }

  // Let adapters discover additional URLs
  const adapters = {
    court: new CourtAdapter(crawlDb, seeds),
    'archive-org': new ArchiveOrgAdapter(crawlDb, seeds),
    news: new NewsAdapter(crawlDb, seeds),
    government: new GovernmentAdapter(crawlDb, seeds),
    documentcloud: new DocumentCloudAdapter(crawlDb, seeds),
  }

  for (const [name, adapter] of Object.entries(adapters)) {
    if (adapter.discover) {
      try {
        console.log('[seed] Running %s adapter discovery...', name)
        const added = await adapter.discover(seeds.seedUrls)
        total += added
        console.log('[seed] %s adapter added %d URLs', name, added)
      } catch (err) {
        console.error('[seed] %s adapter error: %s', name, err.message)
      }
    }
  }

  console.log('\n[seed] Total URLs queued: %d', total)
  const stats = crawlDb.stats()
  console.log('[seed] Queue breakdown:', JSON.stringify(stats.bySource, null, 2))
  crawlDb.close()
}

function cmdStatus () {
  const crawlDb = new CrawlDatabase(CRAWL_DB_PATH)
  const stats = crawlDb.stats()

  console.log('\n=== Crawler Status ===\n')
  console.log('Total URLs:       ' + stats.totalUrls)
  console.log('Avg Relevance:    ' + stats.averageRelevance)
  console.log('\nBy Status:')
  for (const [status, count] of Object.entries(stats.byStatus)) {
    console.log('  ' + status.padEnd(14) + count)
  }
  console.log('\nBy Source:')
  for (const [source, count] of Object.entries(stats.bySource)) {
    console.log('  ' + source.padEnd(22) + count)
  }
  if (stats.topDomains.length > 0) {
    console.log('\nTop Domains (by relevance):')
    for (const d of stats.topDomains) {
      console.log('  ' + d.domain.padEnd(37) + 'fetched: ' + d.total_fetched + '  relevant: ' + d.total_relevant)
    }
  }
  console.log()
  crawlDb.close()
}

function cmdReset () {
  const crawlDb = new CrawlDatabase(CRAWL_DB_PATH)
  crawlDb.reset()
  console.log('[reset] Crawl queue cleared. Indexed documents were NOT removed.')
  crawlDb.close()
}

async function cmdRun (opts) {
  const seeds = loadSeeds()
  const crawlDb = new CrawlDatabase(CRAWL_DB_PATH)
  const docsDb = new DocumentsDatabase(DOCS_DB_PATH)
  const searchIndex = new SearchIndex()
  const scorer = new RelevanceScorer(seeds)

  // Ensure crawler collections exist in the documents DB
  seedCollections(docsDb, seeds)

  // Auto-seed: add any new URLs from seeds.json that aren't already in the queue
  let newSeeds = 0
  for (const seed of seeds.seedUrls) {
    const normalized = CrawlDatabase.normalizeUrl(seed.url)
    const existing = crawlDb.db.prepare('SELECT id FROM urls WHERE normalized_url = ?').get(normalized)
    if (!existing) {
      crawlDb.addUrl(seed.url, {
        priority: seed.priority || 0.5,
        source: seed.adapter || 'generic',
        depth: 0,
      })
      newSeeds++
    }
  }
  if (newSeeds > 0) {
    console.log('[crawler] Auto-seeded %d new URLs from seeds.json', newSeeds)
  }

  // Requeue previously failed URLs for retry
  const requeued = crawlDb.requeueFailed()
  if (requeued > 0) {
    console.log('[crawler] Requeued %d previously failed URLs for retry', requeued)
  }

  const fetcher = new Fetcher(crawlDb, {
    cacheDir: path.join(path.dirname(CRAWL_DB_PATH), 'crawl-cache'),
  })

  const processor = new ContentProcessor({
    docsDb,
    searchIndex,
    relevanceScorer: scorer,
    textExtract,
    thumbnails,
    fileUtils,
    transcriber,
    embedder,
    imageKeywords,
    options: {
      minRelevance: opts.minRelevance,
      dryRun: opts.dryRun,
      contentDir: process.env.CONTENT_DIR || path.join(__dirname, '..', 'data', 'content'),
      thumbDir: process.env.THUMB_DIR || path.join(__dirname, '..', 'data', 'thumbnails'),
    },
  })

  const adapters = {
    generic: new GenericAdapter(crawlDb, scorer, seeds),
    court: new CourtAdapter(crawlDb, seeds),
    'archive-org': new ArchiveOrgAdapter(crawlDb, seeds),
    news: new NewsAdapter(crawlDb, seeds),
    government: new GovernmentAdapter(crawlDb, seeds),
    documentcloud: new DocumentCloudAdapter(crawlDb, seeds),
    'search-discovery': new SearchDiscoveryAdapter(crawlDb, seeds),
  }

  const socialPoster = new SocialPoster({
    crawlDb,
    config: seeds.socialPosting,
  })

  const scheduler = new Scheduler({
    crawlDb,
    fetcher,
    processor,
    adapters,
    socialPoster,
    options: {
      concurrency: opts.concurrency,
      maxDepth: opts.depth,
      enabledAdapters: opts.adapters,
    },
  })

  // Graceful shutdown
  let stopping = false
  const shutdown = () => {
    if (stopping) return
    stopping = true
    console.log('\n[crawler] Shutting down gracefully...')
    scheduler.stop()
    setTimeout(() => {
      crawlDb.close()
      docsDb.close()
      process.exit(0)
    }, 5000)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  console.log('[crawler] Starting with options:', {
    concurrency: opts.concurrency,
    depth: opts.depth,
    adapters: opts.adapters || 'all',
    minRelevance: opts.minRelevance,
    dryRun: opts.dryRun,
  })

  await scheduler.start()
}

function seedCollections (docsDb, seeds) {
  if (!seeds.collections) return
  const now = Date.now()
  for (const col of seeds.collections) {
    const existing = docsDb.getCollection(col.id)
    if (!existing) {
      docsDb.db.prepare(`
        INSERT OR IGNORE INTO collections (id, name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(col.id, col.name, col.description, now, now)
      console.log('[crawler] Created collection: %s (id=%d)', col.name, col.id)
    }
  }
}

function showHelp () {
  console.log(`
Spill Web Crawler — discover, fetch, and index documents from seeds.json

Usage: node crawler/index.js <command> [options]

Commands:
  run           Start the crawler (long-running, Ctrl+C to stop gracefully)
  seed          Load seed URLs from seeds.json into the crawl queue
  status        Show crawl statistics (queued, fetched, processed, failed)
  reset         Clear crawl queue (does NOT delete already-indexed documents)

Options:
  --concurrency N     Max concurrent fetches (default: 5)
  --depth N           Max crawl depth from seeds (default: 3)
  --adapters LIST     Comma-separated adapter names to enable (default: all)
                      Available: court, news, government, archive-org, documentcloud, generic, search-discovery
  --min-relevance N   Minimum relevance score to index (default: 0.3)
  --dry-run           Fetch and score but don't insert into archive

Examples:
  node crawler/index.js seed
  node crawler/index.js run --dry-run --concurrency 2 --adapters court
  node crawler/index.js run --adapters court,government --depth 2
  node crawler/index.js status
  node crawler/index.js reset
`)
}

// --- Main ---

async function main () {
  const args = process.argv.slice(2)
  const opts = parseArgs(args)

  switch (opts.command) {
    case 'seed':
      await cmdSeed()
      break
    case 'status':
      cmdStatus()
      break
    case 'reset':
      cmdReset()
      break
    case 'run':
      await cmdRun(opts)
      break
    case 'help':
    case '--help':
    case '-h':
    default:
      showHelp()
      break
  }
}

main().catch(err => {
  console.error('[crawler] Fatal error:', err)
  process.exit(1)
})
