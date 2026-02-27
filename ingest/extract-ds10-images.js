#!/usr/bin/env node
/**
 * Extract embedded images from PDF wrappers.
 *
 * Many archive datasets contain photographs wrapped in single-page PDFs.
 * This script uses `pdftoppm` to render the first page of each PDF as a
 * JPEG image, updates the DB metadata to content_type='image', and
 * re-indexes Meilisearch.
 *
 * Usage:
 *   node ingest/extract-ds10-images.js [options]
 *
 * Options:
 *   --dataset      Dataset to process     (default: 10)
 *   --db-path      Path to documents.db   (default: archiver/data/documents.db)
 *   --thumb-dir    Thumbnail output dir   (default: /data/thumbnails)
 *   --limit        Max PDFs to process    (default: 0 = all)
 *   --concurrency  Parallel workers       (default: 8)
 *   --meili-host   Meilisearch host       (default: http://localhost:7700)
 *   --batch-size   DB query batch size    (default: 500)
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
const DATASET = parseInt(args.dataset || '10') || 10
const DB_PATH = args['db-path'] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const THUMB_DIR = args['thumb-dir'] || process.env.THUMB_DIR || '/data/thumbnails'
const LIMIT = parseInt(args.limit || '0') || 0
const CONCURRENCY = parseInt(args.concurrency || '8') || 8
const MEILI_HOST = args['meili-host'] || process.env.MEILI_HOST || 'http://localhost:7700'
const MEILI_KEY = process.env.MEILI_API_KEY || ''
const BATCH_SIZE = parseInt(args['batch-size'] || '500') || 500
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
// Core extraction logic — renders first page to JPEG via pdftoppm
// ---------------------------------------------------------------------------
function extractImage (pdfPath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfimg-'))
  const prefix = path.join(tmpDir, 'page')

  try {
    // Render first page only (-f 1 -l 1) at 200 DPI as JPEG
    execFileSync('pdftoppm', [
      '-jpeg', '-r', '200', '-f', '1', '-l', '1', '-singlefile',
      pdfPath, prefix
    ], {
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe']
    })
  } catch {
    cleanup(tmpDir)
    return null
  }

  const outFile = prefix + '.jpg'
  if (!fs.existsSync(outFile) || fs.statSync(outFile).size < 100) {
    cleanup(tmpDir)
    return null
  }

  return { extractedFile: outFile, ext: '.jpg', tmpDir }
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
  const TAG = `[extract-images-ds${DATASET}]`
  console.log(`${TAG} Starting PDF image extraction for dataset ${DATASET}`)
  console.log(`${TAG} Database: ${DB_PATH}`)
  console.log(`${TAG} Thumb dir: ${THUMB_DIR}`)
  console.log(`${TAG} Concurrency: ${CONCURRENCY}`)
  console.log(`${TAG} Meilisearch: ${MEILI_HOST}`)
  if (LIMIT > 0) console.log(`${TAG} Limit: ${LIMIT}`)

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
      console.error(`${TAG} Meilisearch flush error: ${err.message}`)
    }
  }

  try {
    while (true) {
      const queryLimit = LIMIT > 0
        ? Math.min(BATCH_SIZE, LIMIT - totalProcessed)
        : BATCH_SIZE
      if (queryLimit <= 0) break

      // No OFFSET needed: processed docs are marked with image_scan_attempted=1
      const docs = db.db.prepare(`
        SELECT id, file_name, file_path, file_size
        FROM documents
        WHERE data_set = ? AND content_type = 'pdf' AND image_scan_attempted = 0
        LIMIT ?
      `).all(DATASET, queryLimit)

      if (docs.length === 0) break

      const tasks = docs.map(doc => pool(async () => {
        if (!doc.file_path || !fs.existsSync(doc.file_path)) {
          db.db.prepare('UPDATE documents SET image_scan_attempted = 1 WHERE id = ?').run(doc.id)
          skipped++
          return
        }

        const result = extractImage(doc.file_path)
        if (!result) {
          db.db.prepare('UPDATE documents SET image_scan_attempted = 1 WHERE id = ?').run(doc.id)
          skipped++
          return
        }

        const { extractedFile, ext, tmpDir } = result
        try {
          // Determine destination: same directory as PDF, with image extension
          const pdfDir = path.dirname(doc.file_path)
          const stem = path.basename(doc.file_path, path.extname(doc.file_path))

          const imgExt = ['.jpg', '.jpeg'].includes(ext) ? '.jpg'
            : ['.png'].includes(ext) ? '.png'
            : ext || '.jpg'
          const destPath = path.join(pdfDir, stem + imgExt)

          // Move extracted image to final location
          fs.copyFileSync(extractedFile, destPath)
          const stat = fs.statSync(destPath)

          // Update DB — change content_type to image, mark scan attempted
          db.updateContentType(doc.id, 'image', 'photo', destPath, stat.size)
          db.db.prepare('UPDATE documents SET image_scan_attempted = 1 WHERE id = ?').run(doc.id)

          // Generate thumbnail
          const thumbDest = path.join(THUMB_DIR, `ds${DATASET}`, `${doc.id}.jpg`)
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
          console.error(`${TAG} Error processing ${doc.id}: ${err.message}`)
          db.db.prepare('UPDATE documents SET image_scan_attempted = 1 WHERE id = ?').run(doc.id)
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
          `${TAG} Progress: extracted=${extracted} skipped=${skipped} errors=${errors} total=${totalProcessed} (${rate.toFixed(1)}/s)`
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
  console.log(`\n${TAG} === Extraction Complete ===`)
  console.log(`${TAG} Extracted: ${extracted}`)
  console.log(`${TAG} Skipped:   ${skipped}`)
  console.log(`${TAG} Errors:    ${errors}`)
  console.log(`${TAG} Total:     ${totalProcessed}`)
  console.log(`${TAG} Elapsed:   ${elapsed.toFixed(1)}s (${rate.toFixed(1)} images/s)`)
}

main().catch(err => {
  console.error('[extract-images] Fatal error:', err)
  process.exit(1)
})
