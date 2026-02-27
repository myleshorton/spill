#!/usr/bin/env node
/**
 * Batch PDF → image → keyword extraction — renders PDF page 1 to JPEG and extracts keywords via GPT-4o-mini vision.
 *
 * Usage:
 *   node ingest/scan-pdf-images.js --dataset 10 [--batch-size 50] [--limit N] [--concurrency 3] [--db-path /path/to/documents.db]
 */
const path = require('path')
const pLimit = require('p-limit')

const DocumentsDatabase = require('../archiver/lib/documents-db')
const { extractKeywordsFromPdf } = require('./lib/image-keywords')

const args = parseArgs(process.argv.slice(2))
const DB_PATH = args['db-path'] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const DATASET = parseInt(args.dataset || '10') || 10
const BATCH_SIZE = parseInt(args['batch-size'] || '50') || 50
const LIMIT = parseInt(args.limit || '0') || 0
const CONCURRENCY = parseInt(args.concurrency || '3') || 3
const RATE_LIMIT_MS = 200

function parseArgs (argv) {
  const result = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i].startsWith('--')) {
      result[argv[i].slice(2)] = argv[i + 1]
    }
  }
  return result
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main () {
  if (!process.env.OPENAI_API_KEY) {
    console.error('[scan-pdf-images] OPENAI_API_KEY not set — exiting.')
    process.exit(1)
  }

  console.log('[scan-pdf-images] Starting batch PDF keyword extraction...')
  console.log('[scan-pdf-images] Database:', DB_PATH)
  console.log('[scan-pdf-images] Dataset:', DATASET)
  console.log('[scan-pdf-images] Batch size:', BATCH_SIZE)
  console.log('[scan-pdf-images] Concurrency:', CONCURRENCY)
  if (LIMIT > 0) console.log('[scan-pdf-images] Limit:', LIMIT)

  const db = new DocumentsDatabase(DB_PATH)
  const limit = pLimit(CONCURRENCY)
  let extracted = 0
  let skipped = 0
  let errors = 0
  let totalProcessed = 0
  const startTime = Date.now()
  let lastTick = Date.now()

  try {
    while (true) {
      const remaining = LIMIT > 0 ? Math.min(BATCH_SIZE, LIMIT - totalProcessed) : BATCH_SIZE
      if (remaining <= 0) break

      const docs = db.getUnkeywordedPdfs(DATASET, remaining)
      if (docs.length === 0) break

      const tasks = docs.map(doc => limit(async () => {
        await sleep(RATE_LIMIT_MS)
        try {
          const keywords = await extractKeywordsFromPdf(doc.file_path)
          if (keywords) {
            db.setImageKeywords(doc.id, keywords)
            extracted++
          } else {
            skipped++
          }
        } catch (err) {
          const status = err.status || err.statusCode || 0
          if (status === 400) {
            db.setImageKeywords(doc.id, '_unsupported')
            skipped++
          } else {
            console.warn('[scan-pdf-images] Error for %s: %s', doc.id, err.message)
            errors++
          }
        }
      }))

      await Promise.allSettled(tasks)
      totalProcessed += docs.length

      // Progress ticker every 10s
      if (Date.now() - lastTick >= 10000) {
        const elapsed = (Date.now() - startTime) / 1000
        const rate = extracted / elapsed
        console.log('[scan-pdf-images] Progress: extracted=%d skipped=%d errors=%d total=%d (%s/s)',
          extracted, skipped, errors, totalProcessed, rate.toFixed(1))
        lastTick = Date.now()
      }

      // If first batch returned nothing, API key may be bad
      if (totalProcessed === docs.length && extracted === 0 && skipped === docs.length) {
        console.warn('[scan-pdf-images] No keywords extracted from first batch — check OPENAI_API_KEY and PDF files')
        break
      }
    }
  } finally {
    db.close()
  }

  const elapsed = (Date.now() - startTime) / 1000
  const rate = extracted / (elapsed || 1)
  console.log('\n[scan-pdf-images] === PDF Keyword Extraction Complete ===')
  console.log('[scan-pdf-images] Extracted: %d', extracted)
  console.log('[scan-pdf-images] Skipped: %d', skipped)
  console.log('[scan-pdf-images] Errors: %d', errors)
  console.log('[scan-pdf-images] Total processed: %d', totalProcessed)
  console.log('[scan-pdf-images] Elapsed: %ss (%s PDFs/s)', elapsed.toFixed(1), rate.toFixed(1))
}

main().catch(err => {
  console.error('[scan-pdf-images] Fatal error:', err)
  process.exit(1)
})
