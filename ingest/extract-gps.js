#!/usr/bin/env node
/**
 * Batch GPS + date + title extraction from EXIF metadata.
 *
 * Scans images, videos, and audio for embedded GPS coordinates,
 * dates, and descriptions. Updates document titles when the current
 * title is just a filename.
 *
 * Usage:
 *   node ingest/extract-gps.js --dataset 10 [--batch-size 200] [--limit N] [--concurrency 5]
 *     [--content-types image,video,audio] [--db-path /path/to/documents.db] [--meili-host http://localhost:7700]
 */
const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')
const pLimit = require('p-limit')

const DocumentsDatabase = require('../archiver/lib/documents-db')
const SearchIndex = require('../archiver/lib/meilisearch')

const args = parseArgs(process.argv.slice(2))
const DB_PATH = args['db-path'] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const MEILI_HOST = args['meili-host'] || process.env.MEILI_HOST || 'http://localhost:7700'
const MEILI_KEY = args['meili-key'] || process.env.MEILI_API_KEY || ''
const DATASET = parseInt(args.dataset || '10') || 10
const BATCH_SIZE = parseInt(args['batch-size'] || '200') || 200
const LIMIT = parseInt(args.limit || '0') || 0
const CONCURRENCY = parseInt(args.concurrency || '5') || 5
const MEILI_FLUSH = 500
const MAX_FILE_SIZE = parseInt(args['max-file-size'] || '0') || 50 * 1024 * 1024 // 50 MB default

// Default to media types only — PDFs rarely have EXIF and are expensive to scan
const CONTENT_TYPES = (args['content-types'] || 'image,video,audio').split(',').map(s => s.trim()).filter(Boolean)

function parseArgs (argv) {
  const result = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i].startsWith('--')) {
      result[argv[i].slice(2)] = argv[i + 1]
    }
  }
  return result
}

function isValidLatitude (v) {
  return typeof v === 'number' && isFinite(v) && v >= -90 && v <= 90
}

function isValidLongitude (v) {
  return typeof v === 'number' && isFinite(v) && v >= -180 && v <= 180
}

function formatExifDate (d) {
  if (!d) return null
  if (d instanceof Date && !isNaN(d.getTime())) {
    return d.toISOString()
  }
  // Try parsing EXIF date string like "2005:03:15 14:30:00"
  if (typeof d === 'string') {
    const cleaned = d.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
    const parsed = new Date(cleaned)
    if (!isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return null
}

function formatDateHuman (isoStr) {
  if (!isoStr) return null
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return null
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

function looksLikeFilename (title) {
  if (!title) return true
  const t = title.trim()
  // Matches: IMG_0001.jpg, DSC_4521.pdf, VID_0032.mp4
  if (/^[A-Za-z0-9_\- ]+\.[a-zA-Z0-9]{2,5}$/.test(t)) return true
  // Matches: EFTA00003212, DSC 0001 (evidence IDs without extension)
  if (/^[A-Z]{2,6}\d{5,12}$/.test(t)) return true
  // Matches: "DSC 0001" style (letters + space + digits)
  if (/^[A-Z]{2,6}\s\d{3,8}$/.test(t)) return true
  return false
}

function generateTitle (doc, exifDesc, mediaDate) {
  // Only update if title looks like a bare filename
  if (!looksLikeFilename(doc.title)) return null

  // Priority 1: EXIF description/title
  if (exifDesc && exifDesc.trim().length > 3) {
    const desc = exifDesc.trim().slice(0, 200)
    if (mediaDate) {
      return `${desc} (${formatDateHuman(mediaDate)})`
    }
    return desc
  }

  // Priority 2: image_keywords from DB
  if (doc.image_keywords && doc.image_keywords !== '_unsupported') {
    const keywords = doc.image_keywords.split(',').map(k => k.trim()).filter(Boolean).slice(0, 5)
    if (keywords.length > 0) {
      const kwStr = keywords.join(', ')
      if (mediaDate) {
        return `${kwStr} (${formatDateHuman(mediaDate)})`
      }
      return kwStr
    }
  }

  // Priority 3: content type + date
  if (mediaDate) {
    const typeLabel = doc.content_type === 'image' ? 'Photograph'
      : doc.content_type === 'video' ? 'Video'
        : doc.content_type === 'audio' ? 'Audio'
          : doc.content_type === 'pdf' ? 'Document'
            : 'File'
    return `${typeLabel} — ${formatDateHuman(mediaDate)}`
  }

  return null
}

async function extractExif (filePath) {
  const exifr = require('exifr')

  // Read only first 512 KB — EXIF is always in the file header
  const fd = fs.openSync(filePath, 'r')
  try {
    const chunkSize = Math.min(fs.fstatSync(fd).size, 512 * 1024)
    const buf = Buffer.alloc(chunkSize)
    fs.readSync(fd, buf, 0, chunkSize, 0)
    fs.closeSync(fd)

    const data = await exifr.parse(buf, {
      gps: true,
      pick: [
        'latitude', 'longitude',
        'DateTimeOriginal', 'CreateDate', 'ModifyDate',
        'ImageDescription', 'Subject', 'Title', 'Caption'
      ]
    })
    return data || null
  } catch {
    try { fs.closeSync(fd) } catch {}
    return null
  }
}

function ffprobeMetadata (filePath) {
  return new Promise((resolve) => {
    execFile('ffprobe', [
      '-v', 'quiet', '-print_format', 'json',
      '-show_entries', 'format_tags=creation_time,location,com.apple.quicktime.location.ISO6709',
      filePath
    ], { timeout: 10000 }, (err, stdout) => {
      if (err) return resolve(null)
      try {
        const json = JSON.parse(stdout)
        const tags = (json.format && json.format.tags) || {}
        const result = {}

        // creation_time → CreateDate
        if (tags.creation_time) {
          result.CreateDate = new Date(tags.creation_time)
        }

        // GPS from location tag (format: "+26.6844-080.0508/")
        const loc = tags.location || tags['com.apple.quicktime.location.ISO6709']
        if (loc) {
          const m = loc.match(/([+-]\d+\.?\d*?)([+-]\d+\.?\d*)/)
          if (m) {
            result.latitude = parseFloat(m[1])
            result.longitude = parseFloat(m[2])
          }
        }

        resolve(Object.keys(result).length > 0 ? result : null)
      } catch {
        resolve(null)
      }
    })
  })
}

const VIDEO_AUDIO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.m4v', '.m4a', '.mp3', '.wav', '.flac', '.ogg', '.3gp'])

async function main () {
  console.log('[extract-gps] Starting batch GPS + date + title extraction...')
  console.log('[extract-gps] Database:', DB_PATH)
  console.log('[extract-gps] Dataset:', DATASET)
  console.log('[extract-gps] Content types:', CONTENT_TYPES.join(', '))
  console.log('[extract-gps] Batch size:', BATCH_SIZE)
  console.log('[extract-gps] Concurrency:', CONCURRENCY)
  console.log('[extract-gps] Max file size:', (MAX_FILE_SIZE / 1024 / 1024).toFixed(0) + ' MB')
  console.log('[extract-gps] Meilisearch:', MEILI_HOST)
  if (LIMIT > 0) console.log('[extract-gps] Limit:', LIMIT)

  const db = new DocumentsDatabase(DB_PATH)
  const search = new SearchIndex({ host: MEILI_HOST, apiKey: MEILI_KEY })
  const limit = pLimit(CONCURRENCY)

  let gpsFound = 0
  let datesFound = 0
  let titlesUpdated = 0
  let skipped = 0
  let errors = 0
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
      console.warn('[extract-gps] Meilisearch flush error:', err.message)
    }
  }

  try {
    while (true) {
      const remaining = LIMIT > 0 ? Math.min(BATCH_SIZE, LIMIT - totalProcessed) : BATCH_SIZE
      if (remaining <= 0) break

      const docs = db.getUngeolocatedDocs(DATASET, CONTENT_TYPES, remaining)
      if (docs.length === 0) break

      const tasks = docs.map(doc => limit(async () => {
        try {
          if (!doc.file_path || !fs.existsSync(doc.file_path)) {
            db.markGeoScanned(doc.id)
            skipped++
            return
          }

          // Skip files larger than max size
          try {
            const stat = fs.statSync(doc.file_path)
            if (stat.size > MAX_FILE_SIZE) {
              db.markGeoScanned(doc.id)
              skipped++
              return
            }
          } catch {
            db.markGeoScanned(doc.id)
            skipped++
            return
          }

          const ext = path.extname(doc.file_path).toLowerCase()
          let exif = await extractExif(doc.file_path)

          // Fallback to ffprobe for video/audio containers
          if (!exif && VIDEO_AUDIO_EXTS.has(ext)) {
            exif = await ffprobeMetadata(doc.file_path)
          }

          let mediaDate = null
          let exifDesc = null

          if (exif) {
            // GPS
            if (isValidLatitude(exif.latitude) && isValidLongitude(exif.longitude)) {
              db.setGeoLocation(doc.id, exif.latitude, exif.longitude)
              gpsFound++
            }

            // Date
            const rawDate = exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate
            mediaDate = formatExifDate(rawDate)
            if (mediaDate) {
              db.setMediaDate(doc.id, mediaDate)
              datesFound++
            }

            // Description
            exifDesc = exif.ImageDescription || exif.Title || exif.Caption
            if (Array.isArray(exif.Subject) && exif.Subject.length > 0 && !exifDesc) {
              exifDesc = exif.Subject.slice(0, 5).join(', ')
            }
          }

          // Title generation
          const newTitle = generateTitle(doc, exifDesc, mediaDate)
          if (newTitle) {
            db.db.prepare('UPDATE documents SET title = ? WHERE id = ?').run(newTitle, doc.id)
            titlesUpdated++
          }

          // Mark as scanned
          db.markGeoScanned(doc.id)

          // Buffer for Meilisearch update
          const updatedDoc = db.get(doc.id)
          if (updatedDoc) {
            meiliBuffer.push(updatedDoc)
          }

          if (meiliBuffer.length >= MEILI_FLUSH) {
            await flushMeili()
          }
        } catch (err) {
          console.warn('[extract-gps] Error for %s: %s', doc.id, err.message)
          try { db.markGeoScanned(doc.id) } catch {}
          errors++
        }
      }))

      await Promise.allSettled(tasks)
      totalProcessed += docs.length

      // Flush Meilisearch at end of each batch to prevent buffer growth
      if (meiliBuffer.length > 0) {
        await flushMeili()
      }

      // Progress ticker every 10s
      if (Date.now() - lastTick >= 10000) {
        const elapsed = (Date.now() - startTime) / 1000
        const rate = totalProcessed / elapsed
        console.log(`[extract-gps] Progress: gps=${gpsFound} dates=${datesFound} titles=${titlesUpdated} errors=${errors} total=${totalProcessed} (${rate.toFixed(1)}/s)`)
        lastTick = Date.now()
      }
    }

    // Final Meilisearch flush
    await flushMeili()
  } finally {
    db.close()
  }

  const elapsed = (Date.now() - startTime) / 1000
  const rate = totalProcessed / (elapsed || 1)
  console.log(`\n[extract-gps] === GPS + Date + Title Extraction Complete ===`)
  console.log(`[extract-gps] GPS found: ${gpsFound}`)
  console.log(`[extract-gps] Dates found: ${datesFound}`)
  console.log(`[extract-gps] Titles updated: ${titlesUpdated}`)
  console.log(`[extract-gps] Skipped: ${skipped}`)
  console.log(`[extract-gps] Errors: ${errors}`)
  console.log(`[extract-gps] Total processed: ${totalProcessed}`)
  console.log(`[extract-gps] Elapsed: ${elapsed.toFixed(1)}s (${rate.toFixed(1)} files/s)`)
}

main().catch(err => {
  console.error('[extract-gps] Fatal error:', err)
  process.exit(1)
})
