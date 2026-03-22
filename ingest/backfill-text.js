#!/usr/bin/env node
/**
 * Backfill extracted_text for documents that have PDF files but no text in the DB.
 * Uses PyMuPDF to extract text layer content (not OCR).
 *
 * Usage: node ingest/backfill-text.js [--db-path /path/to/db] [--batch-size 100] [--limit 0]
 */
const path = require('path')
const { execFileSync } = require('node:child_process')
const DocumentsDatabase = require('../archiver/lib/documents-db')

const args = parseArgs(process.argv.slice(2))
const DB_PATH = args['db-path'] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const BATCH_SIZE = parseInt(args['batch-size'] || '100') || 100
const LIMIT = parseInt(args.limit || '0') || 0
const PYTHON_SCRIPT = path.join(__dirname, 'lib', 'extract-pdf-gen.py')

function parseArgs (argv) {
  const result = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i].startsWith('--')) result[argv[i].slice(2)] = argv[i + 1]
  }
  return result
}

function main () {
  const db = new DocumentsDatabase(DB_PATH)
  const update = db.db.prepare('UPDATE documents SET extracted_text = ? WHERE id = ?')

  let processed = 0
  let filled = 0
  let errors = 0
  const startTime = Date.now()
  let lastLog = startTime

  console.log('Backfilling text extraction...')

  while (true) {
    if (LIMIT > 0 && processed >= LIMIT) break

    const batchLimit = LIMIT > 0 ? Math.min(BATCH_SIZE, LIMIT - processed) : BATCH_SIZE
    const docs = db.db.prepare(`
      SELECT id, file_path FROM documents
      WHERE (extracted_text IS NULL OR extracted_text = '')
      AND content_type = 'pdf' AND file_size > 100
      AND file_path IS NOT NULL
      LIMIT ?
    `).all(batchLimit)

    if (docs.length === 0) break

    const batchUpdates = db.db.transaction((items) => {
      for (const item of items) {
        update.run(item.text, item.id)
      }
    })

    const updates = []
    for (const doc of docs) {
      try {
        const result = execFileSync('python3', [PYTHON_SCRIPT, 'extract', doc.file_path], {
          maxBuffer: 50 * 1024 * 1024,
          timeout: 15000
        })
        const parsed = JSON.parse(result.toString())
        if (parsed.full_text && parsed.full_text.trim().length > 0) {
          updates.push({ id: doc.id, text: parsed.full_text })
          filled++
        }
      } catch {
        errors++
      }
      processed++
    }

    if (updates.length > 0) batchUpdates(updates)

    const now = Date.now()
    if (now - lastLog > 10000) {
      const rate = Math.round(processed / ((now - startTime) / 1000))
      console.log(`  ${processed} processed (${filled} filled, ${errors} errors) ${rate}/s`)
      lastLog = now
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\nDone: ${processed} processed, ${filled} filled, ${errors} errors in ${elapsed}s`)
  db.db.close()
}

main()
