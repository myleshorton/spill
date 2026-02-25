#!/usr/bin/env node
/**
 * Step 3: Index all documents into Meilisearch for full-text search.
 *
 * Reads documents from SQLite in batches and pushes them to Meilisearch.
 *
 * Usage:
 *   node index-search.js [--db-path /path/to/documents.db] [--meili-host http://localhost:7700] [--batch-size 500]
 */
const path = require('path')

const DocumentsDatabase = require('../archiver/lib/documents-db')
const SearchIndex = require('../archiver/lib/meilisearch')

const args = parseArgs(process.argv.slice(2))
const DB_PATH = args['db-path'] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const MEILI_HOST = args['meili-host'] || process.env.MEILI_HOST || 'http://localhost:7700'
const MEILI_KEY = args['meili-key'] || process.env.MEILI_API_KEY || ''
const BATCH_SIZE = parseInt(args['batch-size'] || '500')

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
  console.log('[index] Starting Meilisearch indexing...')
  console.log('[index] Database:', DB_PATH)
  console.log('[index] Meilisearch:', MEILI_HOST)
  console.log('[index] Batch size:', BATCH_SIZE)

  const db = new DocumentsDatabase(DB_PATH)
  const total = db.count()
  console.log('[index] %d documents to index', total)

  const search = new SearchIndex({ host: MEILI_HOST, apiKey: MEILI_KEY })
  await search.setup()
  console.log('[index] Meilisearch index configured')

  let indexed = 0
  let offset = 0

  while (offset < total) {
    const batch = db.allForIndexing(BATCH_SIZE, offset)
    if (batch.length === 0) break

    try {
      const task = await search.addDocuments(batch)
      indexed += batch.length
      console.log('[index] Indexed %d/%d (task: %s)', indexed, total, task.taskUid)
    } catch (err) {
      console.error('[index] Batch failed at offset %d: %s', offset, err.message)
      // Continue with next batch
    }

    offset += BATCH_SIZE
  }

  // Update indexed_at timestamps
  console.log('[index] Updating indexed_at timestamps...')
  const updateStmt = db.db.prepare('UPDATE documents SET indexed_at = ? WHERE indexed_at IS NULL')
  updateStmt.run(Date.now())

  console.log('\n[index] === Indexing Complete ===')
  console.log('[index] Total indexed: %d', indexed)

  const searchStats = await search.getStats()
  console.log('[index] Meilisearch stats:', JSON.stringify(searchStats, null, 2))

  db.close()
}

main().catch(err => {
  console.error('[index] Fatal error:', err)
  process.exit(1)
})
