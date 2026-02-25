#!/usr/bin/env node
/**
 * Step 2: Extract text and generate thumbnails for cataloged documents.
 *
 * Reads documents from SQLite that haven't been processed yet,
 * extracts text (via pdf-parse or Tesseract OCR), generates thumbnails,
 * and updates the database.
 *
 * Usage:
 *   node ingest.js [--db-path /path/to/documents.db] [--thumb-dir /path/to/thumbs] [--limit 1000]
 */
const path = require('path')
const fs = require('fs')

const DocumentsDatabase = require('../archiver/lib/documents-db')
const { extractText, getPageCount } = require('./lib/text-extract')
const { generateThumbnail } = require('./lib/thumbnails')

const args = parseArgs(process.argv.slice(2))
const DB_PATH = args['db-path'] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const THUMB_DIR = args['thumb-dir'] || path.join(__dirname, '..', 'data', 'thumbs')
const LIMIT = parseInt(args.limit || '0') || 0

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
  console.log('[ingest] Starting text extraction and thumbnail generation...')
  console.log('[ingest] Database:', DB_PATH)
  console.log('[ingest] Thumbnail dir:', THUMB_DIR)

  if (!fs.existsSync(THUMB_DIR)) {
    fs.mkdirSync(THUMB_DIR, { recursive: true })
  }

  const db = new DocumentsDatabase(DB_PATH)
  const total = db.count()
  console.log('[ingest] %d total documents in database', total)

  // Process documents that haven't been fully processed yet
  // (no extracted_text and a file_path exists)
  const stmt = db.db.prepare(`
    SELECT * FROM documents
    WHERE file_path IS NOT NULL
      AND (extracted_text IS NULL OR thumb_path IS NULL)
    ORDER BY data_set ASC, rowid ASC
    ${LIMIT > 0 ? `LIMIT ${LIMIT}` : ''}
  `)
  const pending = stmt.all()
  console.log('[ingest] %d documents pending processing', pending.length)

  let processed = 0
  let textExtracted = 0
  let thumbsGenerated = 0
  let errors = 0

  for (const doc of pending) {
    processed++
    if (processed % 100 === 0 || processed === 1) {
      console.log('[ingest] Progress: %d/%d (text: %d, thumbs: %d, errors: %d)',
        processed, pending.length, textExtracted, thumbsGenerated, errors)
    }

    const updates = {}

    // Extract text if needed
    if (!doc.extracted_text && doc.file_path && fs.existsSync(doc.file_path)) {
      try {
        const text = await extractText(doc.file_path)
        if (text && text.length > 0) {
          updates.extracted_text = text
          textExtracted++
        }
      } catch (err) {
        console.error('[ingest] Text extraction failed for %s: %s', doc.id, err.message)
        errors++
      }
    }

    // Get page count for PDFs
    if (!doc.page_count && doc.content_type === 'pdf' && doc.file_path) {
      const pages = getPageCount(doc.file_path)
      if (pages) updates.page_count = pages
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

    // Update database if we have changes
    if (Object.keys(updates).length > 0) {
      const sets = Object.keys(updates).map(k => `${k} = @${k}`).join(', ')
      updates.id = doc.id
      db.db.prepare(`UPDATE documents SET ${sets} WHERE id = @id`).run(updates)
    }
  }

  console.log('\n[ingest] === Ingest Complete ===')
  console.log('[ingest] Processed: %d', processed)
  console.log('[ingest] Text extracted: %d', textExtracted)
  console.log('[ingest] Thumbnails generated: %d', thumbsGenerated)
  console.log('[ingest] Errors: %d', errors)

  db.close()
}

main().catch(err => {
  console.error('[ingest] Fatal error:', err)
  process.exit(1)
})
