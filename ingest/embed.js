#!/usr/bin/env node
/**
 * Batch embedding script — generates embeddings for all documents missing them.
 *
 * Usage:
 *   node ingest/embed.js [--db-path /path/to/documents.db] [--batch-size 100] [--limit 10000]
 */
const path = require('path')

const DocumentsDatabase = require('../archiver/lib/documents-db')
const { embed, embedBatch, toBuffer } = require('./lib/embedder')

const args = parseArgs(process.argv.slice(2))
const DB_PATH = args['db-path'] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const BATCH_SIZE = parseInt(args['batch-size'] || '100') || 100
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

function buildText (doc) {
  const parts = [doc.title || '']
  if (doc.extracted_text) parts.push(doc.extracted_text)
  if (doc.transcript) parts.push(doc.transcript)
  return parts.join('\n\n').trim()
}

async function main () {
  console.log('[embed] Starting batch embedding...')
  console.log('[embed] Database:', DB_PATH)
  console.log('[embed] Batch size:', BATCH_SIZE)
  if (LIMIT > 0) console.log('[embed] Limit:', LIMIT)

  const db = new DocumentsDatabase(DB_PATH)
  let embedded = 0
  let skipped = 0
  let errors = 0
  let totalProcessed = 0

  try {
    while (true) {
      const remaining = LIMIT > 0 ? Math.min(BATCH_SIZE, LIMIT - totalProcessed) : BATCH_SIZE
      if (remaining <= 0) break

      const docs = db.getUnembeddedDocs(remaining)
      if (docs.length === 0) break

      const texts = []
      const validDocs = []

      for (const doc of docs) {
        const text = buildText(doc)
        if (text.length < 20) {
          skipped++
          totalProcessed++
          continue
        }
        texts.push(text)
        validDocs.push(doc)
      }

      if (texts.length > 0) {
        try {
          const embeddings = await embedBatch(texts)
          for (let i = 0; i < embeddings.length; i++) {
            if (embeddings[i]) {
              db.setEmbedding(validDocs[i].id, toBuffer(embeddings[i]))
              embedded++
            } else {
              skipped++
            }
          }
        } catch (err) {
          console.error('[embed] Batch error: %s', err.message)
          errors += texts.length
        }
      }

      totalProcessed += docs.length

      if (totalProcessed % 500 === 0 || docs.length < remaining) {
        console.log('[embed] Progress: embedded=%d skipped=%d errors=%d total=%d',
          embedded, skipped, errors, totalProcessed)
      }

      // First batch returned null embeddings — API key probably missing
      if (embedded === 0 && skipped === validDocs.length && validDocs.length > 0) {
        console.warn('[embed] No embeddings generated — check OPENAI_API_KEY')
        break
      }
    }
  } finally {
    db.close()
  }

  console.log('\n[embed] === Embedding Complete ===')
  console.log('[embed] Embedded: %d', embedded)
  console.log('[embed] Skipped: %d', skipped)
  console.log('[embed] Errors: %d', errors)
}

main().catch(err => {
  console.error('[embed] Fatal error:', err)
  process.exit(1)
})
