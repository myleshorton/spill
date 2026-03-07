#!/usr/bin/env node
/**
 * Batch entity + relationship + financial extraction.
 * Supports --backend ollama (free, local) or --backend openai (fast, cheap).
 *
 * Usage:
 *   # OpenAI (fast batch):
 *   node ingest/scan-all.js --backend openai --concurrency 10 --skip 9,10
 *
 *   # Ollama (free, local):
 *   node ingest/scan-all.js --dataset 11 --ollama-url http://172.19.0.1:11434
 *
 *   # Options:
 *   --dataset N        Only process dataset N (default: all)
 *   --skip 9,10        Skip these datasets (comma-separated)
 *   --backend openai   Use OpenAI GPT-4o-mini (default: ollama)
 *   --model NAME       Model name (default: qwen2.5:7b / gpt-4o-mini)
 *   --batch-size N     Docs per batch (default: 50)
 *   --concurrency N    Parallel requests (default: 3 ollama, 10 openai)
 *   --limit N          Max docs to process (default: unlimited)
 *   --db-path PATH     Database path
 *   --ollama-url URL   Ollama API URL
 */
const path = require('path')

const DocumentsDatabase = require('../archiver/lib/documents-db')
const { extractEntitiesAndFinancials, storeExtractionResults, checkOllama } = require('./lib/entity-extractor')

const args = parseArgs(process.argv.slice(2))
const DB_PATH = args['db-path'] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const DATASET = args.dataset || null
const SKIP_DATASETS = (args.skip || '').split(',').filter(Boolean)
const BACKEND = args.backend || 'ollama'
const BATCH_SIZE = parseInt(args['batch-size'] || '50') || 50
const LIMIT = parseInt(args.limit || '0') || 0
const DEFAULT_CONCURRENCY = BACKEND === 'ollama' ? 3 : 10
const CONCURRENCY = parseInt(args.concurrency || String(DEFAULT_CONCURRENCY)) || DEFAULT_CONCURRENCY
const OLLAMA_URL = args['ollama-url'] || process.env.OLLAMA_URL || 'http://localhost:11434'
const MODEL = args.model || (BACKEND === 'groq' ? 'qwen/qwen3-32b' : BACKEND === 'openai' ? 'gpt-4o-mini' : BACKEND === 'anthropic' ? 'claude-haiku-4-5-20251001' : (process.env.OLLAMA_MODEL || 'qwen2.5:7b'))
const RATE_LIMIT_MS = BACKEND === 'groq' ? 50 : BACKEND === 'openai' ? 10 : 50

function parseArgs (argv) {
  const result = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i].startsWith('--')) {
      result[argv[i].slice(2)] = argv[i + 1] || 'true'
    }
  }
  return result
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Simple concurrency limiter
function pLimit (concurrency) {
  let active = 0
  const queue = []
  function next () {
    if (active >= concurrency || queue.length === 0) return
    active++
    const { fn, resolve, reject } = queue.shift()
    fn().then(resolve, reject).finally(() => { active--; next() })
  }
  return function limit (fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject })
      next()
    })
  }
}

async function main () {
  if (BACKEND === 'groq') {
    if (!process.env.GROQ_API_KEY) {
      console.error('[scan-all] GROQ_API_KEY not set — exiting.')
      process.exit(1)
    }
    console.log('[scan-all] Using Groq backend')
  } else if (BACKEND === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      console.error('[scan-all] OPENAI_API_KEY not set — exiting.')
      process.exit(1)
    }
    console.log('[scan-all] Using OpenAI backend')
  } else if (BACKEND === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('[scan-all] ANTHROPIC_API_KEY not set — exiting.')
      process.exit(1)
    }
    console.log('[scan-all] Using Anthropic backend')
  } else {
    const ollamaReady = await checkOllama({ ollamaUrl: OLLAMA_URL, model: MODEL })
    if (!ollamaReady) {
      console.error('[scan-all] Ollama not reachable or model "%s" not available at %s', MODEL, OLLAMA_URL)
      console.error('[scan-all] Start Ollama and pull the model: ollama pull %s', MODEL)
      process.exit(1)
    }
    console.log('[scan-all] Using Ollama backend')
  }

  console.log('[scan-all] Starting combined extraction (entities + relationships + financial)...')
  console.log('[scan-all] Database:', DB_PATH)
  console.log('[scan-all] Dataset:', DATASET || 'ALL')
  if (SKIP_DATASETS.length) console.log('[scan-all] Skipping datasets:', SKIP_DATASETS.join(', '))
  console.log('[scan-all] Backend:', BACKEND, '| Model:', MODEL)
  console.log('[scan-all] Batch size:', BATCH_SIZE, '| Concurrency:', CONCURRENCY)
  if (LIMIT > 0) console.log('[scan-all] Limit:', LIMIT)

  const db = new DocumentsDatabase(DB_PATH)
  const limit = pLimit(CONCURRENCY)

  const stats = {
    entities: 0,
    relationships: 0,
    financial: 0,
    docsWithEntities: 0,
    docsWithFinancial: 0,
    skipped: 0,
    errors: 0,
    totalProcessed: 0
  }
  const startTime = Date.now()
  let lastTick = Date.now()

  let datasets = DATASET
    ? [DATASET]
    : db.db.prepare('SELECT DISTINCT data_set FROM documents ORDER BY data_set').all().map(r => r.data_set)
  if (SKIP_DATASETS.length) {
    datasets = datasets.filter(ds => !SKIP_DATASETS.includes(String(ds)))
  }

  try {
    for (const ds of datasets) {
      console.log(`[scan-all] Processing dataset ${ds}...`)

      while (true) {
        if (LIMIT > 0 && stats.totalProcessed >= LIMIT) break
        const remaining = LIMIT > 0 ? Math.min(BATCH_SIZE, LIMIT - stats.totalProcessed) : BATCH_SIZE

        const docs = db.getUnscannedForEntities(ds, remaining)
        if (docs.length === 0) break

        const tasks = docs.map(doc => limit(async () => {
          await sleep(RATE_LIMIT_MS)
          try {
            const text = doc.extracted_text || doc.transcript || ''
            if (text.trim().length < 20) {
              db.markEntityScanned(doc.id)
              db.markFinancialScanned(doc.id)
              stats.skipped++
              return
            }

            const result = await extractEntitiesAndFinancials(text, { backend: BACKEND, ollamaUrl: OLLAMA_URL, model: MODEL })
            storeExtractionResults(db, doc.id, result)

            stats.entities += result.entities.length
            stats.relationships += result.relationships.length
            stats.financial += result.financial.length
            if (result.entities.length > 0) stats.docsWithEntities++
            if (result.financial.length > 0) stats.docsWithFinancial++
          } catch (err) {
            console.warn('[scan-all] Error for %s: %s', doc.id, err.message)
            db.markEntityScanned(doc.id)
            db.markFinancialScanned(doc.id)
            stats.errors++
          }
        }))

        await Promise.allSettled(tasks)
        stats.totalProcessed += docs.length

        if (Date.now() - lastTick >= 10000) {
          const elapsed = (Date.now() - startTime) / 1000
          const rate = stats.totalProcessed / (elapsed || 1)
          console.log('[scan-all] Progress: entities=%d rels=%d financial=%d skipped=%d errors=%d total=%d (%.1f/s)',
            stats.entities, stats.relationships, stats.financial, stats.skipped, stats.errors, stats.totalProcessed, rate)
          lastTick = Date.now()
        }
      }

      if (LIMIT > 0 && stats.totalProcessed >= LIMIT) break
    }
  } finally {
    db.close()
  }

  const elapsed = (Date.now() - startTime) / 1000
  console.log('\n[scan-all] === Extraction Complete ===')
  console.log('[scan-all] Entities found: %d', stats.entities)
  console.log('[scan-all] Relationships found: %d', stats.relationships)
  console.log('[scan-all] Financial records found: %d', stats.financial)
  console.log('[scan-all] Docs with entities: %d', stats.docsWithEntities)
  console.log('[scan-all] Docs with financial: %d', stats.docsWithFinancial)
  console.log('[scan-all] Skipped (no text): %d', stats.skipped)
  console.log('[scan-all] Errors: %d', stats.errors)
  console.log('[scan-all] Total processed: %d', stats.totalProcessed)
  console.log('[scan-all] Elapsed: %ss', elapsed.toFixed(1))
}

main().catch(err => {
  console.error('[scan-all] Fatal error:', err)
  process.exit(1)
})
