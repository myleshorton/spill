#!/usr/bin/env node
/**
 * Step 2: Extract text and generate thumbnails for cataloged documents.
 *
 * Reads documents from SQLite that haven't been processed yet,
 * extracts text (via pdf-parse or Tesseract OCR), generates thumbnails,
 * and updates the database.
 *
 * Usage:
 *   node ingest.js [--db-path /path/to/documents.db] [--thumb-dir /path/to/thumbs] [--limit 1000] [--concurrency 8]
 */
const path = require('path')
const fs = require('fs')

const DocumentsDatabase = require('../archiver/lib/documents-db')
const { extractText, getPageCount } = require('./lib/text-extract')
const { generateThumbnail } = require('./lib/thumbnails')
const { transcribe } = require('./lib/transcriber')

const args = parseArgs(process.argv.slice(2))
const DB_PATH = args['db-path'] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const THUMB_DIR = args['thumb-dir'] || path.join(__dirname, '..', 'data', 'thumbs')
const LIMIT = parseInt(args.limit || '0') || 0
const CONCURRENCY = parseInt(args.concurrency || '8') || 8
const TEXT_ONLY = args['text-only'] === 'true'
const BATCH_SIZE = 10000

function parseArgs (argv) {
  const result = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        result[key] = next
        i++
      } else {
        result[key] = 'true'
      }
    }
  }
  return result
}

async function processPool (items, concurrency, fn) {
  let i = 0
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++
      await fn(items[idx])
    }
  })
  await Promise.all(workers)
}

async function main () {
  console.log('[ingest] Starting text extraction and thumbnail generation...')
  console.log('[ingest] Database:', DB_PATH)
  console.log('[ingest] Thumbnail dir:', THUMB_DIR)
  console.log('[ingest] Concurrency:', CONCURRENCY)
  if (TEXT_ONLY) console.log('[ingest] Text-only mode: skipping transcription and thumbnails')

  if (!fs.existsSync(THUMB_DIR)) {
    fs.mkdirSync(THUMB_DIR, { recursive: true })
  }

  const db = new DocumentsDatabase(DB_PATH)
  const total = db.count()
  console.log('[ingest] %d total documents in database', total)

  // Count pending documents
  const pendingQuery = TEXT_ONLY
    ? `SELECT COUNT(*) as cnt FROM documents WHERE file_path IS NOT NULL AND extracted_text IS NULL`
    : `SELECT COUNT(*) as cnt FROM documents
       WHERE file_path IS NOT NULL
         AND (extracted_text IS NULL OR thumb_path IS NULL
              OR (transcript IS NULL AND content_type IN ('audio', 'video')))`
  const pendingCount = db.db.prepare(pendingQuery).get().cnt
  const totalPending = LIMIT > 0 ? Math.min(pendingCount, LIMIT) : pendingCount
  console.log('[ingest] %d documents pending processing', totalPending)

  let processed = 0
  let textExtracted = 0
  let transcribed = 0
  let thumbsGenerated = 0
  let errors = 0
  let totalFetched = 0
  const startTime = Date.now()

  // Prepare the batched query — always OFFSET 0 because processed rows
  // get updated and drop out of the WHERE clause
  const batchStmt = db.db.prepare(TEXT_ONLY
    ? `SELECT * FROM documents WHERE file_path IS NOT NULL AND extracted_text IS NULL
       ORDER BY data_set ASC, rowid ASC LIMIT @limit`
    : `SELECT * FROM documents
       WHERE file_path IS NOT NULL
         AND (extracted_text IS NULL OR thumb_path IS NULL
              OR (transcript IS NULL AND content_type IN ('audio', 'video')))
       ORDER BY data_set ASC, rowid ASC LIMIT @limit`
  )

  // Progress ticker — logs throughput every 5 seconds
  const ticker = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000
    const rate = processed / elapsed
    console.log('[ingest] Progress: %d/%d (%.1f docs/sec) — text: %d, transcribed: %d, thumbs: %d, errors: %d',
      processed, totalPending, rate, textExtracted, transcribed, thumbsGenerated, errors)
  }, 5000)

  // Process document
  async function processDoc (doc) {
    const updates = {}

    // Extract text if needed
    if (!doc.extracted_text && doc.file_path && fs.existsSync(doc.file_path)) {
      try {
        const text = await extractText(doc.file_path)
        if (text && text.length > 0) {
          updates.extracted_text = text
          textExtracted++
        } else {
          // Mark as attempted so we don't retry
          updates.extracted_text = ''
        }
      } catch (err) {
        console.error('[ingest] Text extraction failed for %s: %s', doc.id, err.message)
        updates.extracted_text = ''
        errors++
      }
    }

    // Get page count for PDFs
    if (!doc.page_count && doc.content_type === 'pdf' && doc.file_path) {
      const pages = getPageCount(doc.file_path)
      if (pages) updates.page_count = pages
    }

    if (!TEXT_ONLY) {
      // Transcribe audio/video if needed
      if (!doc.transcript && (doc.content_type === 'audio' || doc.content_type === 'video') && doc.file_path && fs.existsSync(doc.file_path)) {
        try {
          const transcript = await transcribe(doc.file_path, doc.content_type)
          if (transcript && transcript.length > 0) {
            updates.transcript = transcript
            transcribed++
          }
        } catch (err) {
          console.error('[ingest] Transcription failed for %s: %s', doc.id, err.message)
          errors++
        }
      }

      // Generate thumbnail if needed
      if (!doc.thumb_path && doc.file_path && fs.existsSync(doc.file_path)) {
        const thumbPath = path.join(THUMB_DIR, doc.id + '.jpg')
        try {
          const ok = await generateThumbnail(doc.file_path, thumbPath, doc.content_type)
          if (ok) {
            updates.thumb_path = thumbPath
            thumbsGenerated++
          }
        } catch (err) {
          console.error('[ingest] Thumbnail failed for %s: %s', doc.id, err.message)
        }
      }
    }

    // Update database if we have changes
    if (Object.keys(updates).length > 0) {
      const sets = Object.keys(updates).map(k => `${k} = @${k}`).join(', ')
      updates.id = doc.id
      db.db.prepare(`UPDATE documents SET ${sets} WHERE id = @id`).run(updates)
    }

    processed++
  }

  // Fetch and process in batches — each query re-selects pending docs
  // since processed rows drop out of the WHERE clause after UPDATE
  while (processed < totalPending) {
    const batchLimit = Math.min(BATCH_SIZE, totalPending - processed)
    const batch = batchStmt.all({ limit: batchLimit })
    if (batch.length === 0) break
    totalFetched += batch.length
    console.log('[ingest] Fetched batch of %d docs (total fetched: %d/%d)', batch.length, totalFetched, totalPending)
    await processPool(batch, CONCURRENCY, processDoc)
  }

  clearInterval(ticker)

  const elapsed = (Date.now() - startTime) / 1000
  console.log('\n[ingest] === Ingest Complete ===')
  console.log('[ingest] Processed: %d in %.1fs (%.1f docs/sec)', processed, elapsed, processed / elapsed)
  console.log('[ingest] Text extracted: %d', textExtracted)
  console.log('[ingest] Transcribed: %d', transcribed)
  console.log('[ingest] Thumbnails generated: %d', thumbsGenerated)
  console.log('[ingest] Errors: %d', errors)

  db.close()
}

main().catch(err => {
  console.error('[ingest] Fatal error:', err)
  process.exit(1)
})
