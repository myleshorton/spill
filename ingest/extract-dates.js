#!/usr/bin/env node
/**
 * Batch document date extraction — normalizes dates from EXIF, filenames, and crawl timestamps.
 *
 * Priority order:
 *   1. media_date (EXIF) — highest confidence
 *   2. Dates parsed from filename patterns
 *   3. created_at (crawl timestamp) — lowest confidence
 *
 * Usage:
 *   node ingest/extract-dates.js --dataset 10 [--batch-size 500] [--limit N] [--db-path /path/to/documents.db]
 */
const path = require('path')

const DocumentsDatabase = require('../archiver/lib/documents-db')
const SearchIndex = require('../archiver/lib/meilisearch')

const args = parseArgs(process.argv.slice(2))
const DB_PATH = args['db-path'] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const MEILI_HOST = args['meili-host'] || process.env.MEILI_HOST || 'http://localhost:7700'
const MEILI_KEY = args['meili-key'] || process.env.MEILI_API_KEY || ''
const DATASET = parseInt(args.dataset || '10') || 10
const BATCH_SIZE = parseInt(args['batch-size'] || '500') || 500
const LIMIT = parseInt(args.limit || '0') || 0
const MEILI_FLUSH = 500

function parseArgs (argv) {
  const result = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i].startsWith('--')) {
      result[argv[i].slice(2)] = argv[i + 1]
    }
  }
  return result
}

// Filename date patterns
const FILENAME_PATTERNS = [
  // 2005-03-15 or 2005_03_15 or 20050315
  /(\d{4})[-_](\d{2})[-_](\d{2})/,
  // IMG_20040622 or VID_20040622 or DSC_20040622
  /(?:IMG|VID|DSC|MOV|WA|Screenshot)[_-]?(\d{4})(\d{2})(\d{2})/i,
  // 20040622_123456
  /^(\d{4})(\d{2})(\d{2})[_-]\d{4,6}/,
  // Standalone 8-digit date: 20040622
  /(?:^|[^0-9])(\d{4})(\d{2})(\d{2})(?:[^0-9]|$)/
]

function extractDateFromFilename (fileName) {
  if (!fileName) return null

  for (const pattern of FILENAME_PATTERNS) {
    const match = fileName.match(pattern)
    if (match) {
      const year = parseInt(match[1])
      const month = parseInt(match[2])
      const day = parseInt(match[3])

      // Sanity checks
      if (year < 1900 || year > 2030) continue
      if (month < 1 || month > 12) continue
      if (day < 1 || day > 31) continue

      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00.000Z`
      const d = new Date(dateStr)
      if (!isNaN(d.getTime())) return dateStr
    }
  }
  return null
}

function extractDate (doc) {
  // Priority 1: media_date from EXIF
  if (doc.media_date) {
    const d = new Date(doc.media_date)
    if (!isNaN(d.getTime())) {
      return { date: d.toISOString(), source: 'exif' }
    }
  }

  // Priority 2: filename patterns
  const filenameDate = extractDateFromFilename(doc.file_name)
  if (filenameDate) {
    return { date: filenameDate, source: 'filename' }
  }

  // No crawl timestamp fallback — those are just ingest dates, not document dates
  return null
}

async function main () {
  console.log('[extract-dates] Starting batch date extraction...')
  console.log('[extract-dates] Database:', DB_PATH)
  console.log('[extract-dates] Dataset:', DATASET)
  console.log('[extract-dates] Batch size:', BATCH_SIZE)
  console.log('[extract-dates] Meilisearch:', MEILI_HOST)
  if (LIMIT > 0) console.log('[extract-dates] Limit:', LIMIT)

  const db = new DocumentsDatabase(DB_PATH)
  const search = new SearchIndex({ host: MEILI_HOST, apiKey: MEILI_KEY })
  let exifDates = 0
  let filenameDates = 0
  let crawlDates = 0
  let skipped = 0
  let totalProcessed = 0
  const startTime = Date.now()
  let lastTick = Date.now()
  let meiliBuffer = []

  async function flushMeili () {
    if (meiliBuffer.length === 0) return
    try {
      await search.addDocuments(meiliBuffer)
      meiliBuffer = []
    } catch (err) {
      console.warn('[extract-dates] Meilisearch flush error:', err.message)
    }
  }

  try {
    while (true) {
      const remaining = LIMIT > 0 ? Math.min(BATCH_SIZE, LIMIT - totalProcessed) : BATCH_SIZE
      if (remaining <= 0) break

      const docs = db.getUndatedDocs(DATASET, remaining)
      if (docs.length === 0) break

      for (const doc of docs) {
        const result = extractDate(doc)
        if (result) {
          db.setDocumentDate(doc.id, result.date, result.source)
          if (result.source === 'exif') exifDates++
          else if (result.source === 'filename') filenameDates++
          else crawlDates++

          const updatedDoc = db.get(doc.id)
          if (updatedDoc) meiliBuffer.push(updatedDoc)
        } else {
          // Mark with a sentinel so we don't reprocess
          db.setDocumentDate(doc.id, '_none', 'none')
          skipped++
        }
      }

      totalProcessed += docs.length

      if (meiliBuffer.length >= MEILI_FLUSH) {
        await flushMeili()
      }

      if (Date.now() - lastTick >= 10000) {
        const elapsed = (Date.now() - startTime) / 1000
        const rate = totalProcessed / (elapsed || 1)
        console.log('[extract-dates] Progress: exif=%d filename=%d crawl=%d skipped=%d total=%d (%s/s)',
          exifDates, filenameDates, crawlDates, skipped, totalProcessed, rate.toFixed(1))
        lastTick = Date.now()
      }
    }

    await flushMeili()
  } finally {
    db.close()
  }

  const elapsed = (Date.now() - startTime) / 1000
  const total = exifDates + filenameDates + crawlDates
  console.log('\n[extract-dates] === Date Extraction Complete ===')
  console.log('[extract-dates] EXIF dates: %d', exifDates)
  console.log('[extract-dates] Filename dates: %d', filenameDates)
  console.log('[extract-dates] Crawl dates: %d', crawlDates)
  console.log('[extract-dates] Total dated: %d', total)
  console.log('[extract-dates] Skipped: %d', skipped)
  console.log('[extract-dates] Total processed: %d', totalProcessed)
  console.log('[extract-dates] Elapsed: %ss', elapsed.toFixed(1))
}

main().catch(err => {
  console.error('[extract-dates] Fatal error:', err)
  process.exit(1)
})
