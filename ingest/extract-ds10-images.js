#!/usr/bin/env node
/**
 * Extract embedded images from DS10 PDF wrappers.
 *
 * DS10 ("Seized Images & Videos") contains ~503K photographs that the DOJ
 * wrapped in single-page PDFs. This script uses `pdfimages -j` to extract
 * the original JPEG (or PNG) from each PDF, updates the DB metadata to
 * content_type='image', and re-indexes Meilisearch.
 *
 * Usage:
 *   node ingest/extract-ds10-images.js [options]
 *
 * Options:
 *   --db-path      Path to documents.db  (default: archiver/data/documents.db)
 *   --thumb-dir    Thumbnail output dir   (default: /data/thumbnails)
 *   --limit        Max PDFs to process    (default: 0 = all)
 *   --concurrency  Parallel workers       (default: 8)
 *   --meili-host   Meilisearch host       (default: http://localhost:7700)
 *   --batch-size   DB query batch size    (default: 10000)
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const { execFileSync } = require('child_process')

const DocumentsDatabase = require('../archiver/lib/documents-db')
const SearchIndex = require('../archiver/lib/meilisearch')
const { generateThumbnail } = require('./lib/thumbnails')

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = parseArgs(process.argv.slice(2))
const DB_PATH = args['db-path'] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const THUMB_DIR = args['thumb-dir'] || process.env.THUMB_DIR || '/data/thumbnails'
const LIMIT = parseInt(args.limit || '0') || 0
const CONCURRENCY = parseInt(args.concurrency || '8') || 8
const MEILI_HOST = args['meili-host'] || process.env.MEILI_HOST || 'http://localhost:7700'
const MEILI_KEY = process.env.MEILI_API_KEY || ''
const BATCH_SIZE = parseInt(args['batch-size'] || '10000') || 10000
const MEILI_FLUSH = 500 // re-index every N docs

function parseArgs (argv) {
  const result = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--') && i + 1 < argv.length) {
      result[argv[i].slice(2)] = argv[i + 1]
      i++
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Worker pool — simple concurrency limiter
// ---------------------------------------------------------------------------
function makePool (concurrency) {
  let active = 0
  const queue = []

  function next () {
    if (queue.length === 0 || active >= concurrency) return
    active++
    const { fn, resolve, reject } = queue.shift()
    fn().then(resolve, reject).finally(() => { active--; next() })
  }

  return function run (fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject })
      next()
    })
  }
}

// ---------------------------------------------------------------------------
// Core extraction logic
// ---------------------------------------------------------------------------
function extractImage (pdfPath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds10-'))
  const prefix = path.join(tmpDir, 'img')

  try {
    execFileSync('pdfimages', ['-j', pdfPath, prefix], {
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe']
    })
  } catch {
    cleanup(tmpDir)
    return null
  }

  // pdfimages outputs files like img-000.jpg, img-000.png, img-000.ppm, etc.
  const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('img-'))
  if (files.length !== 1) {
    // Skip if 0 or multiple images extracted
    cleanup(tmpDir)
    return null
  }

  const extractedFile = path.join(tmpDir, files[0])
  const ext = path.extname(files[0]).toLowerCase()

  return { extractedFile, ext, tmpDir }
}

function cleanup (dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main () {
  console.log('[extract-ds10] Starting DS10 PDF image extraction')
  console.log('[extract-ds10] Database: %s', DB_PATH)
  console.log('[extract-ds10] Thumb dir: %s', THUMB_DIR)
  console.log('[extract-ds10] Concurrency: %d', CONCURRENCY)
  console.log('[extract-ds10] Meilisearch: %s', MEILI_HOST)
  if (LIMIT > 0) console.log('[extract-ds10] Limit: %d', LIMIT)

  const db = new DocumentsDatabase(DB_PATH)
  const search = new SearchIndex({ host: MEILI_HOST, apiKey: MEILI_KEY })
  const pool = makePool(CONCURRENCY)

  let extracted = 0
  let skipped = 0
  let errors = 0
  let totalProcessed = 0
  const startTime = Date.now()
  let lastLog = Date.now()

  // Buffer for Meilisearch batch updates
  let meiliBuffer = []

  async function flushMeili () {
    if (meiliBuffer.length === 0) return
    try {
      await search.addDocuments(meiliBuffer)
      meiliBuffer = []
    } catch (err) {
      console.error('[extract-ds10] Meilisearch flush error: %s', err.message)
    }
  }

  try {
    let offset = 0
    while (true) {
      const queryLimit = LIMIT > 0
        ? Math.min(BATCH_SIZE, LIMIT - totalProcessed)
        : BATCH_SIZE
      if (queryLimit <= 0) break

      const docs = db.db.prepare(`
        SELECT id, file_name, file_path, file_size
        FROM documents
        WHERE data_set = 10 AND content_type = 'pdf'
        LIMIT ? OFFSET ?
      `).all(queryLimit, offset)

      if (docs.length === 0) break
      offset += docs.length

      const tasks = docs.map(doc => pool(async () => {
        if (!doc.file_path || !fs.existsSync(doc.file_path)) {
          skipped++
          return
        }

        const result = extractImage(doc.file_path)
        if (!result) {
          skipped++
          return
        }

        const { extractedFile, ext, tmpDir } = result
        try {
          // Determine destination: same directory as PDF, with image extension
          const pdfDir = path.dirname(doc.file_path)
          const stem = path.basename(doc.file_path, path.extname(doc.file_path))
          // Normalize extension
          const imgExt = ['.jpg', '.jpeg'].includes(ext) ? '.jpg'
            : ['.png'].includes(ext) ? '.png'
            : ext || '.jpg'
          const destPath = path.join(pdfDir, stem + imgExt)

          // Move extracted image to final location
          fs.copyFileSync(extractedFile, destPath)
          const stat = fs.statSync(destPath)

          // Update DB
          db.updateContentType(doc.id, 'image', 'photo', destPath, stat.size)

          // Generate thumbnail
          const thumbDest = path.join(THUMB_DIR, `ds10`, `${doc.id}.jpg`)
          const thumbDir = path.dirname(thumbDest)
          if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true })
          const thumbOk = await generateThumbnail(destPath, thumbDest, 'image')
          if (thumbOk) {
            db.db.prepare('UPDATE documents SET thumb_path = ? WHERE id = ?').run(thumbDest, doc.id)
          }

          // Buffer for Meilisearch
          const updatedDoc = db.get(doc.id)
          if (updatedDoc) meiliBuffer.push(updatedDoc)

          extracted++
        } catch (err) {
          console.error('[extract-ds10] Error processing %s: %s', doc.id, err.message)
          errors++
        } finally {
          cleanup(tmpDir)
        }
      }))

      await Promise.allSettled(tasks)
      totalProcessed += docs.length

      // Flush Meilisearch buffer if big enough
      if (meiliBuffer.length >= MEILI_FLUSH) {
        await flushMeili()
      }

      // Progress log every 5s
      if (Date.now() - lastLog >= 5000) {
        const elapsed = (Date.now() - startTime) / 1000
        const rate = extracted / (elapsed || 1)
        console.log(
          '[extract-ds10] Progress: extracted=%d skipped=%d errors=%d total=%d (%.1f/s)',
          extracted, skipped, errors, totalProcessed, rate
        )
        lastLog = Date.now()
      }
    }

    // Final Meilisearch flush
    await flushMeili()
  } finally {
    db.close()
  }

  const elapsed = (Date.now() - startTime) / 1000
  const rate = extracted / (elapsed || 1)
  console.log('\n[extract-ds10] === Extraction Complete ===')
  console.log('[extract-ds10] Extracted: %d', extracted)
  console.log('[extract-ds10] Skipped:   %d', skipped)
  console.log('[extract-ds10] Errors:    %d', errors)
  console.log('[extract-ds10] Total:     %d', totalProcessed)
  console.log('[extract-ds10] Elapsed:   %.1fs (%.1f images/s)', elapsed, rate)
}

main().catch(err => {
  console.error('[extract-ds10] Fatal error:', err)
  process.exit(1)
})
