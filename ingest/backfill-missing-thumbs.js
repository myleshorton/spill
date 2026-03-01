#!/usr/bin/env node
/**
 * Backfill thumbnails for all documents that are missing them.
 * Handles pdf, video, image, and html content types.
 */
const path = require('path')
const fs = require('fs')
const DocumentsDatabase = require('../archiver/lib/documents-db')
const { generateThumbnail } = require('./lib/thumbnails')

const DB_PATH = process.env.DOCS_DB_PATH || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const THUMB_DIR = process.env.THUMB_DIR || '/data/thumbnails'
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100', 10)
const CONTENT_TYPE = process.env.CONTENT_TYPE || null // optional filter: pdf, video, image, html

async function main () {
  const db = new DocumentsDatabase(DB_PATH)

  let query = 'SELECT id, file_path, file_name, content_type FROM documents WHERE thumb_path IS NULL AND file_path IS NOT NULL'
  const params = []
  if (CONTENT_TYPE) {
    query += ' AND content_type = ?'
    params.push(CONTENT_TYPE)
  } else {
    query += " AND content_type IN ('pdf', 'video', 'image', 'html')"
  }

  const rows = db.db.prepare(query).all(...params)
  console.log('[backfill] %d documents need thumbnails', rows.length)

  let ok = 0
  let fail = 0
  let skip = 0

  for (const row of rows) {
    if (!row.file_path || !fs.existsSync(row.file_path)) {
      skip++
      continue
    }

    const thumbDest = path.join(THUMB_DIR, 'crawled', `${row.id}.jpg`)
    try {
      const success = await generateThumbnail(row.file_path, thumbDest, row.content_type)
      if (success) {
        db.db.prepare('UPDATE documents SET thumb_path = ? WHERE id = ?').run(thumbDest, row.id)
        ok++
      } else {
        fail++
      }
    } catch (err) {
      console.error('[backfill] Failed %s (%s): %s', row.id, row.file_name, err.message)
      fail++
    }

    if ((ok + fail + skip) % BATCH_SIZE === 0) {
      console.log('[backfill] Progress: %d/%d (ok=%d fail=%d skip=%d)', ok + fail + skip, rows.length, ok, fail, skip)
    }
  }

  console.log('[backfill] Done: %d succeeded, %d failed, %d skipped (no file)', ok, fail, skip)
  db.close()
}

main().catch(err => { console.error(err); process.exit(1) })
