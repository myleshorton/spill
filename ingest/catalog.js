#!/usr/bin/env node
/**
 * Step 1: Catalog all files from DOJ data sets.
 *
 * Walks the raw data directories, detects file types, and inserts
 * metadata records into the SQLite documents database.
 *
 * Usage:
 *   node catalog.js [--data-dir /path/to/data/raw] [--db-path /path/to/documents.db]
 *
 * Expected directory structure:
 *   /data/raw/ds1/
 *   /data/raw/ds2/
 *   ...
 *   /data/raw/ds12/
 */
const path = require('path')
const fs = require('fs')

// Re-use the archiver's DocumentsDatabase
const DocumentsDatabase = require('../archiver/lib/documents-db')
const { walkDir, detectFileType, generateId, getFileSize, categorizeByDataSet } = require('./lib/file-utils')

const args = parseArgs(process.argv.slice(2))
const DATA_DIR = args['data-dir'] || path.join(__dirname, '..', 'data', 'raw')
const DB_PATH = args['db-path'] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')

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
  console.log('[catalog] Starting file catalog...')
  console.log('[catalog] Data directory:', DATA_DIR)
  console.log('[catalog] Database:', DB_PATH)

  if (!fs.existsSync(DATA_DIR)) {
    console.error('[catalog] Data directory not found:', DATA_DIR)
    console.error('[catalog] Download the data sets first and place them in ds1/ through ds12/ subdirectories.')
    process.exit(1)
  }

  const db = new DocumentsDatabase(DB_PATH)
  let totalFiles = 0
  let totalBytes = 0

  for (let ds = 1; ds <= 12; ds++) {
    const dsDir = path.join(DATA_DIR, `ds${ds}`)
    if (!fs.existsSync(dsDir)) {
      console.log('[catalog] DS %d not found at %s, skipping', ds, dsDir)
      continue
    }

    console.log('[catalog] Scanning DS %d...', ds)

    let dsFiles = 0
    const batch = []
    for (const filePath of walkDir(dsDir)) {
      const { contentType } = detectFileType(filePath)
      const category = categorizeByDataSet(ds, filePath)
      const fileSize = getFileSize(filePath)
      const id = generateId(path.relative(DATA_DIR, filePath))
      const fileName = path.basename(filePath)
      const title = fileName
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/^\d+\s*/, '')
        .trim() || fileName

      batch.push({
        id,
        title,
        file_name: fileName,
        data_set: ds,
        content_type: contentType,
        category,
        file_size: fileSize,
        page_count: null,
        file_path: filePath,
        thumb_path: null,
        drive_key: null,
        file_key: null,
        extracted_text: null,
        transcript: null,
        source_url: null,
        created_at: Date.now(),
        indexed_at: null
      })

      totalFiles++
      dsFiles++
      totalBytes += fileSize

      if (batch.length >= 1000) {
        db.insertBatch(batch)
        process.stdout.write(`\r[catalog] DS ${ds}: ${dsFiles} files cataloged...`)
        batch.length = 0
      }
    }

    if (batch.length > 0) {
      db.insertBatch(batch)
    }

    console.log('\n[catalog] DS %d complete: %d files', ds, dsFiles)
  }

  const stats = db.stats()
  console.log('\n[catalog] === Catalog Complete ===')
  console.log('[catalog] Total files: %d', stats.totalDocuments)
  console.log('[catalog] Total size: %s GB', (totalBytes / (1024 * 1024 * 1024)).toFixed(1))
  console.log('[catalog] By type:', JSON.stringify(stats.byContentType, null, 2))
  console.log('[catalog] By data set:', JSON.stringify(stats.byDataSet, null, 2))

  db.close()
}

main().catch(err => {
  console.error('[catalog] Fatal error:', err)
  process.exit(1)
})
