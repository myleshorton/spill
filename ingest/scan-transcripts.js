#!/usr/bin/env node
/**
 * Batch audio/video transcription — scans media files missing transcripts using Whisper API.
 *
 * Usage:
 *   node ingest/scan-transcripts.js --dataset 10 [--batch-size 20] [--limit N] [--concurrency 2] [--db-path /path/to/documents.db]
 */
const path = require('path')
const pLimit = require('p-limit')

const DocumentsDatabase = require('../archiver/lib/documents-db')
const SearchIndex = require('../archiver/lib/meilisearch')
const { transcribe } = require('./lib/transcriber')

const args = parseArgs(process.argv.slice(2))
const DB_PATH = args['db-path'] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const MEILI_HOST = args['meili-host'] || process.env.MEILI_HOST || 'http://localhost:7700'
const MEILI_KEY = args['meili-key'] || process.env.MEILI_API_KEY || ''
const DATASET = parseInt(args.dataset || '10') || 10
const BATCH_SIZE = parseInt(args['batch-size'] || '20') || 20
const LIMIT = parseInt(args.limit || '0') || 0
const CONCURRENCY = parseInt(args.concurrency || '2') || 2
const MEILI_FLUSH = 50

function parseArgs (argv) {
  const result = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i].startsWith('--')) {
      result[argv[i].slice(2)] = argv[i + 1]
    }
  }
  return result
}

async function main () {
  if (!process.env.OPENAI_API_KEY && !process.env.WHISPER_CPP_PATH) {
    console.error('[scan-transcripts] No transcription backend configured. Set OPENAI_API_KEY or WHISPER_CPP_PATH.')
    process.exit(1)
  }

  console.log('[scan-transcripts] Starting batch transcription...')
  console.log('[scan-transcripts] Database:', DB_PATH)
  console.log('[scan-transcripts] Dataset:', DATASET)
  console.log('[scan-transcripts] Batch size:', BATCH_SIZE)
  console.log('[scan-transcripts] Concurrency:', CONCURRENCY)
  console.log('[scan-transcripts] Meilisearch:', MEILI_HOST)
  if (LIMIT > 0) console.log('[scan-transcripts] Limit:', LIMIT)

  const db = new DocumentsDatabase(DB_PATH)
  const search = new SearchIndex({ host: MEILI_HOST, apiKey: MEILI_KEY })
  const limit = pLimit(CONCURRENCY)
  let transcribed = 0
  let skipped = 0
  let errors = 0
  let totalProcessed = 0
  const startTime = Date.now()
  let lastTick = Date.now()
  let meiliBuffer = []

  async function flushMeili () {
    if (meiliBuffer.length === 0) return
    try {
      await search.addDocuments(meiliBuffer)
      meiliBuffer = []
    } catch (err) {
      console.warn('[scan-transcripts] Meilisearch flush error:', err.message)
    }
  }

  try {
    while (true) {
      const remaining = LIMIT > 0 ? Math.min(BATCH_SIZE, LIMIT - totalProcessed) : BATCH_SIZE
      if (remaining <= 0) break

      const docs = db.getUntranscribedMedia(DATASET, remaining)
      if (docs.length === 0) break

      const tasks = docs.map(doc => limit(async () => {
        try {
          const text = await transcribe(doc.file_path, doc.content_type)
          if (text && text.trim().length > 0) {
            db.db.prepare('UPDATE documents SET transcript = ? WHERE id = ?').run(text, doc.id)
            transcribed++
            const updatedDoc = db.get(doc.id)
            if (updatedDoc) meiliBuffer.push(updatedDoc)
          } else {
            // Mark with empty marker so we don't retry
            db.db.prepare("UPDATE documents SET transcript = '_empty' WHERE id = ?").run(doc.id)
            skipped++
          }
        } catch (err) {
          console.warn('[scan-transcripts] Error for %s: %s', doc.id, err.message)
          errors++
        }
      }))

      await Promise.allSettled(tasks)
      totalProcessed += docs.length

      if (meiliBuffer.length >= MEILI_FLUSH) {
        await flushMeili()
      }

      if (Date.now() - lastTick >= 10000) {
        const elapsed = (Date.now() - startTime) / 1000
        const rate = transcribed / (elapsed || 1)
        console.log('[scan-transcripts] Progress: transcribed=%d skipped=%d errors=%d total=%d (%s/s)',
          transcribed, skipped, errors, totalProcessed, rate.toFixed(1))
        lastTick = Date.now()
      }
    }

    await flushMeili()
  } finally {
    db.close()
  }

  const elapsed = (Date.now() - startTime) / 1000
  const rate = transcribed / (elapsed || 1)
  console.log('\n[scan-transcripts] === Transcription Complete ===')
  console.log('[scan-transcripts] Transcribed: %d', transcribed)
  console.log('[scan-transcripts] Skipped: %d', skipped)
  console.log('[scan-transcripts] Errors: %d', errors)
  console.log('[scan-transcripts] Total processed: %d', totalProcessed)
  console.log('[scan-transcripts] Elapsed: %ss (%s files/s)', elapsed.toFixed(1), rate.toFixed(1))
}

main().catch(err => {
  console.error('[scan-transcripts] Fatal error:', err)
  process.exit(1)
})
