#!/usr/bin/env node
/**
 * Backfill thumbnails for HTML documents that are missing them.
 */
const path = require('path')
const DocumentsDatabase = require('../archiver/lib/documents-db')
const { generateThumbnail } = require('./lib/thumbnails')

const DB_PATH = process.env.DOCS_DB_PATH || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const THUMB_DIR = process.env.THUMB_DIR || path.join(__dirname, '..', 'data', 'thumbnails')

async function main () {
  const db = new DocumentsDatabase(DB_PATH)
  const rows = db.db.prepare(
    'SELECT id, file_path, file_name FROM documents WHERE content_type = ? AND thumb_path IS NULL'
  ).all('html')

  console.log('[backfill] %d HTML documents need thumbnails', rows.length)

  let ok = 0
  let fail = 0
  for (const row of rows) {
    if (!row.file_path) { fail++; continue }
    const thumbDest = path.join(THUMB_DIR, 'crawled', `${row.id}.jpg`)
    try {
      const success = await generateThumbnail(row.file_path, thumbDest, 'html')
      if (success) {
        db.db.prepare('UPDATE documents SET thumb_path = ? WHERE id = ?').run(thumbDest, row.id)
        ok++
      } else {
        fail++
      }
    } catch (err) {
      console.error('[backfill] Failed %s: %s', row.id, err.message)
      fail++
    }
  }

  console.log('[backfill] Done: %d succeeded, %d failed', ok, fail)
  db.close()
}

main().catch(err => { console.error(err); process.exit(1) })
