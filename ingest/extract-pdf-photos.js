#!/usr/bin/env node
/**
 * Extract embedded photographs from PDF documents.
 *
 * Most PDFs in the archive are scanned text pages (816x1073 grayscale).
 * An estimated ~8,600 PDFs contain actual embedded photographs at higher
 * resolution. This script finds and extracts them as standalone JPEG images.
 *
 * Phase 1: Scan each PDF with `pdfimages -list` to enumerate embedded images
 * Phase 2: Extract qualifying images with `pdfimages -png`, convert to JPEG
 *
 * Each extracted photo becomes a NEW document record (original PDF preserved).
 *
 * Usage:
 *   node ingest/extract-pdf-photos.js [options]
 *
 * Options:
 *   --db-path      Path to documents.db   (default: archiver/data/documents.db)
 *   --out-dir      Image output directory  (default: /data/extracted-images)
 *   --thumb-dir    Thumbnail output dir    (default: /data/thumbnails)
 *   --limit        Max PDFs to process     (default: 0 = all)
 *   --concurrency  Parallel workers        (default: 8)
 *   --meili-host   Meilisearch host        (default: http://localhost:7700)
 *   --batch-size   DB query batch size     (default: 500)
 *   --min-size     Min PDF file_size bytes (default: 500000)
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

const DocumentsDatabase = require('../archiver/lib/documents-db')
const SearchIndex = require('../archiver/lib/meilisearch')
const { generateThumbnail } = require('./lib/thumbnails')

let sharp
try { sharp = require('sharp') } catch { sharp = null }

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = parseArgs(process.argv.slice(2))
const DB_PATH = args['db-path'] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const OUT_DIR = args['out-dir'] || process.env.OUT_DIR || '/data/extracted-images'
const THUMB_DIR = args['thumb-dir'] || process.env.THUMB_DIR || '/data/thumbnails'
const LIMIT = parseInt(args.limit || '0') || 0
const CONCURRENCY = parseInt(args.concurrency || '8') || 8
const MEILI_HOST = args['meili-host'] || process.env.MEILI_HOST || 'http://localhost:7700'
const MEILI_KEY = process.env.MEILI_API_KEY || ''
const BATCH_SIZE = parseInt(args['batch-size'] || '500') || 500
const MIN_SIZE = parseInt(args['min-size'] || '500000') || 500000
const MEILI_FLUSH = 500

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
// Parse `pdfimages -list` output and apply heuristics
// ---------------------------------------------------------------------------
function parseSize (sizeStr) {
  if (!sizeStr) return 0
  const match = sizeStr.match(/^([\d.]+)([KMG])?$/i)
  if (!match) return 0
  const num = parseFloat(match[1])
  const unit = (match[2] || '').toUpperCase()
  if (unit === 'K') return num * 1024
  if (unit === 'M') return num * 1024 * 1024
  if (unit === 'G') return num * 1024 * 1024 * 1024
  return num
}

function scanPdf (pdfPath) {
  let output
  try {
    output = execFileSync('pdfimages', ['-list', pdfPath], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    })
  } catch {
    return []
  }

  const qualifying = []
  const lines = output.split('\n')

  for (const line of lines) {
    // Skip header and separator lines
    if (line.startsWith('page') || line.startsWith('---') || line.trim() === '') continue

    // Fields: page num type width height color comp bpc enc interp object ID x-ppi y-ppi size ratio
    const parts = line.trim().split(/\s+/)
    if (parts.length < 15) continue

    const num = parseInt(parts[1])
    const type = parts[2]
    const width = parseInt(parts[3])
    const height = parseInt(parts[4])
    const sizeStr = parts[14]
    const embeddedSize = parseSize(sizeStr)

    // Skip masks and inline images
    if (type === 'smask' || type === 'stencil') continue

    // Heuristic: skip standard page scan dimensions
    if (width === 816 || height === 816) continue
    if (width === 1056 || height === 1056) continue

    // Require at least 1000px on the longer side
    const longerSide = Math.max(width, height)
    if (longerSide < 1000) continue

    // Require embedded size > 200KB
    if (embeddedSize < 200 * 1024) continue

    qualifying.push({ num, width, height, embeddedSize })
  }

  return qualifying
}

// ---------------------------------------------------------------------------
// Extract images from a PDF and return paths to qualifying ones
// ---------------------------------------------------------------------------
function extractImages (pdfPath, qualifyingNums) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfphoto-'))
  const prefix = path.join(tmpDir, 'img')

  try {
    execFileSync('pdfimages', ['-png', pdfPath, prefix], {
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe']
    })
  } catch {
    cleanup(tmpDir)
    return { files: [], tmpDir }
  }

  // Match extracted files to qualifying image numbers
  const numSet = new Set(qualifyingNums)
  const files = []

  try {
    const entries = fs.readdirSync(tmpDir)
    for (const entry of entries) {
      // pdfimages output: img-NNN.png (zero-padded)
      const match = entry.match(/^img-(\d+)\.png$/)
      if (!match) continue
      const num = parseInt(match[1])
      if (!numSet.has(num)) continue
      files.push({ num, path: path.join(tmpDir, entry) })
    }
  } catch { /* empty */ }

  return { files, tmpDir }
}

// ---------------------------------------------------------------------------
// Generate a deterministic document ID from parent path + image number
// ---------------------------------------------------------------------------
function makeDocId (parentPath, imageNum) {
  return crypto.createHash('sha256')
    .update(`${parentPath}:${imageNum}`)
    .digest('hex')
    .slice(0, 16)
}

function cleanup (dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main () {
  const TAG = '[extract-pdf-photos]'
  console.log(`${TAG} Starting PDF photo extraction`)
  console.log(`${TAG} Database: ${DB_PATH}`)
  console.log(`${TAG} Output dir: ${OUT_DIR}`)
  console.log(`${TAG} Thumb dir: ${THUMB_DIR}`)
  console.log(`${TAG} Min PDF size: ${(MIN_SIZE / 1024).toFixed(0)}KB`)
  console.log(`${TAG} Concurrency: ${CONCURRENCY}`)
  console.log(`${TAG} Meilisearch: ${MEILI_HOST}`)
  if (LIMIT > 0) console.log(`${TAG} Limit: ${LIMIT}`)
  if (!sharp) console.warn(`${TAG} WARNING: sharp not available, will save as PNG instead of JPEG`)

  // Ensure output directory exists
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

  const db = new DocumentsDatabase(DB_PATH)
  const search = new SearchIndex({ host: MEILI_HOST, apiKey: MEILI_KEY })
  const pool = makePool(CONCURRENCY)

  let scanned = 0
  let pdfsWithPhotos = 0
  let photosExtracted = 0
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

      const docs = db.db.prepare(`
        SELECT id, title, file_name, file_path, file_size, data_set, source_url, collection_id
        FROM documents
        WHERE content_type = 'pdf' AND image_scan_attempted = 0 AND file_size > ?
        LIMIT ?
      `).all(MIN_SIZE, queryLimit)

      if (docs.length === 0) break

      const tasks = docs.map(doc => pool(async () => {
        if (!doc.file_path || !fs.existsSync(doc.file_path)) {
          db.db.prepare('UPDATE documents SET image_scan_attempted = 1 WHERE id = ?').run(doc.id)
          skipped++
          return
        }

        // Phase 1: Scan with pdfimages -list
        const qualifying = scanPdf(doc.file_path)
        scanned++

        if (qualifying.length === 0) {
          db.db.prepare('UPDATE documents SET image_scan_attempted = 1 WHERE id = ?').run(doc.id)
          return
        }

        // Phase 2: Extract qualifying images
        const qualifyingNums = qualifying.map(q => q.num)
        const { files, tmpDir } = extractImages(doc.file_path, qualifyingNums)

        if (files.length === 0) {
          db.db.prepare('UPDATE documents SET image_scan_attempted = 1 WHERE id = ?').run(doc.id)
          cleanup(tmpDir)
          return
        }

        pdfsWithPhotos++

        try {
          for (let i = 0; i < files.length; i++) {
            const file = files[i]
            const docId = makeDocId(doc.file_path, file.num)
            const imageNum = i + 1 // 1-based for display
            const jpegName = `${docId}.jpg`
            const destPath = path.join(OUT_DIR, jpegName)

            try {
              // Convert to JPEG with sharp (or copy PNG as fallback)
              if (sharp) {
                await sharp(file.path)
                  .jpeg({ quality: 85 })
                  .toFile(destPath)
              } else {
                const pngDest = path.join(OUT_DIR, `${docId}.png`)
                fs.copyFileSync(file.path, pngDest)
              }

              const finalPath = sharp ? destPath : path.join(OUT_DIR, `${docId}.png`)
              const finalName = sharp ? jpegName : `${docId}.png`
              const stat = fs.statSync(finalPath)

              // Build title from parent
              const parentTitle = doc.title || doc.file_name || 'Untitled'
              const suffix = files.length > 1 ? ` - Image ${imageNum}` : ' - Image'
              const title = parentTitle + suffix
              const fileName = path.basename(doc.file_name || 'document', path.extname(doc.file_name || '.pdf')) + `-img${imageNum}${sharp ? '.jpg' : '.png'}`

              // Insert new document record
              db.insert({
                id: docId,
                title,
                file_name: fileName,
                data_set: doc.data_set,
                content_type: 'image',
                category: 'photo',
                file_size: stat.size,
                file_path: finalPath,
                source_url: doc.source_url || null,
                collection_id: doc.collection_id || 1,
                created_at: Date.now()
              })

              // Generate thumbnail
              const thumbDest = path.join(THUMB_DIR, 'extracted', `${docId}.jpg`)
              const thumbOk = await generateThumbnail(finalPath, thumbDest, 'image')
              if (thumbOk) {
                db.db.prepare('UPDATE documents SET thumb_path = ? WHERE id = ?').run(thumbDest, docId)
              }

              // Buffer for Meilisearch
              const newDoc = db.get(docId)
              if (newDoc) meiliBuffer.push(newDoc)

              photosExtracted++
            } catch (err) {
              console.error(`${TAG} Error extracting image ${file.num} from ${doc.id}: ${err.message}`)
              errors++
            }
          }
        } finally {
          cleanup(tmpDir)
          db.db.prepare('UPDATE documents SET image_scan_attempted = 1 WHERE id = ?').run(doc.id)
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
        const rate = scanned / (elapsed || 1)
        console.log(
          `${TAG} Progress: scanned=${scanned} withPhotos=${pdfsWithPhotos} extracted=${photosExtracted} errors=${errors} (${rate.toFixed(1)} PDFs/s)`
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
  console.log(`\n${TAG} === Extraction Complete ===`)
  console.log(`${TAG} PDFs scanned:      ${scanned}`)
  console.log(`${TAG} PDFs with photos:  ${pdfsWithPhotos}`)
  console.log(`${TAG} Photos extracted:  ${photosExtracted}`)
  console.log(`${TAG} Skipped (no file): ${skipped}`)
  console.log(`${TAG} Errors:            ${errors}`)
  console.log(`${TAG} Total processed:   ${totalProcessed}`)
  console.log(`${TAG} Elapsed:           ${elapsed.toFixed(1)}s`)
}

main().catch(err => {
  console.error('[extract-pdf-photos] Fatal error:', err)
  process.exit(1)
})
