#!/usr/bin/env node
/**
 * Describe extracted photos using Claude claude-haiku-4-5-20251001 vision.
 *
 * For each image with category='photo' that lacks image_keywords, sends the
 * image to Claude and gets back:
 *   - A short descriptive title (replaces the hash-based default)
 *   - Comma-separated searchable keywords
 *
 * Updates both `title` and `image_keywords` in the DB, then re-indexes in
 * Meilisearch so the photos become searchable.
 *
 * Uses the Anthropic Messages API directly via node:https (no SDK required).
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node ingest/describe-photos.js [options]
 *
 * Options:
 *   --db-path      Path to documents.db   (default: archiver/data/documents.db)
 *   --limit        Max photos to process  (default: 0 = all)
 *   --concurrency  Parallel API calls     (default: 3)
 *   --batch-size   DB query batch size    (default: 100)
 *   --meili-host   Meilisearch host       (default: http://localhost:7700)
 */
const path = require('path')
const fs = require('fs')
const https = require('https')

const DocumentsDatabase = require('../archiver/lib/documents-db')
const SearchIndex = require('../archiver/lib/meilisearch')

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = parseArgs(process.argv.slice(2))
const DB_PATH = args['db-path'] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const LIMIT = parseInt(args.limit || '0') || 0
const CONCURRENCY = parseInt(args.concurrency || '3') || 3
const BATCH_SIZE = parseInt(args['batch-size'] || '100') || 100
const MEILI_HOST = args['meili-host'] || process.env.MEILI_HOST || 'http://localhost:7700'
const MEILI_KEY = process.env.MEILI_API_KEY || ''
const MEILI_FLUSH = 200
const RATE_LIMIT_MS = 200
const MAX_FILE_SIZE = 5 * 1024 * 1024 // Claude vision limit per image
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

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
// Worker pool
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

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Raw HTTPS call to Anthropic Messages API
// ---------------------------------------------------------------------------
function callClaude (body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body)) } catch (e) { reject(new Error('Bad JSON: ' + body.slice(0, 200))) }
        } else {
          const err = new Error(`Anthropic API ${res.statusCode}: ${body.slice(0, 300)}`)
          err.status = res.statusCode
          reject(err)
        }
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

// ---------------------------------------------------------------------------
// Vision call — returns { title, keywords } or null
// ---------------------------------------------------------------------------
const PROMPT = `Look at this image and respond with exactly two lines:
Line 1: A short descriptive title for this image (5-12 words, like a photo caption)
Line 2: Comma-separated keywords describing: people, objects, setting, activities, visible text

Example response:
Two men shaking hands at a formal dinner
men, handshake, formal dinner, suits, table, dining room, chandelier

Respond with ONLY those two lines, nothing else.`

const MAX_RETRIES = 3
const RETRY_DELAYS = [1000, 4000, 16000]

async function describeImage (filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' }
  const mediaType = mimeMap[ext] || 'image/jpeg'

  let stat
  try { stat = fs.statSync(filePath) } catch { return null }
  if (stat.size === 0 || stat.size > MAX_FILE_SIZE) return null

  const buffer = fs.readFileSync(filePath)
  const base64 = buffer.toString('base64')

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await callClaude({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 250,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 }
            },
            { type: 'text', text: PROMPT }
          ]
        }]
      })

      const text = res.content?.[0]?.text?.trim()
      if (!text) return null

      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
      if (lines.length < 2) {
        return { title: text.slice(0, 80), keywords: text }
      }
      return { title: lines[0].slice(0, 200), keywords: lines.slice(1).join(', ') }
    } catch (err) {
      const status = err.status || 0
      if (status === 400) {
        return { title: null, keywords: '_unsupported' }
      }
      const retryable = status === 429 || status >= 500 || status === 529
      if (retryable && attempt < MAX_RETRIES - 1) {
        console.warn('[describe-photos] API error %d, retrying in %dms...', status, RETRY_DELAYS[attempt])
        await sleep(RETRY_DELAYS[attempt])
        continue
      }
      throw err
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main () {
  const TAG = '[describe-photos]'

  if (!ANTHROPIC_API_KEY) {
    console.error(`${TAG} ANTHROPIC_API_KEY not set — exiting.`)
    process.exit(1)
  }

  console.log(`${TAG} Starting photo description (Claude Haiku 4.5)`)
  console.log(`${TAG} Database: ${DB_PATH}`)
  console.log(`${TAG} Concurrency: ${CONCURRENCY}`)
  console.log(`${TAG} Meilisearch: ${MEILI_HOST}`)
  if (LIMIT > 0) console.log(`${TAG} Limit: ${LIMIT}`)

  const db = new DocumentsDatabase(DB_PATH)
  const search = new SearchIndex({ host: MEILI_HOST, apiKey: MEILI_KEY })
  const pool = makePool(CONCURRENCY)

  let described = 0
  let skipped = 0
  let errors = 0
  let totalProcessed = 0
  const startTime = Date.now()
  let lastLog = Date.now()
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
        SELECT id, title, file_path, file_name
        FROM documents
        WHERE content_type = 'image' AND image_keywords IS NULL AND file_path IS NOT NULL
        LIMIT ?
      `).all(queryLimit)

      if (docs.length === 0) break

      const tasks = docs.map(doc => pool(async () => {
        await sleep(RATE_LIMIT_MS)

        if (!doc.file_path || !fs.existsSync(doc.file_path)) {
          db.setImageKeywords(doc.id, '_missing')
          skipped++
          return
        }

        try {
          const result = await describeImage(doc.file_path)
          if (!result) {
            skipped++
            return
          }

          db.setImageKeywords(doc.id, result.keywords)

          if (result.title && result.title !== '_unsupported') {
            db.db.prepare('UPDATE documents SET title = ? WHERE id = ?').run(result.title, doc.id)
          }

          const updatedDoc = db.get(doc.id)
          if (updatedDoc) meiliBuffer.push(updatedDoc)

          described++
        } catch (err) {
          console.error(`${TAG} Error for ${doc.id}: ${err.message}`)
          errors++
        }
      }))

      await Promise.allSettled(tasks)
      totalProcessed += docs.length

      if (meiliBuffer.length >= MEILI_FLUSH) {
        await flushMeili()
      }

      if (Date.now() - lastLog >= 10000) {
        const elapsed = (Date.now() - startTime) / 1000
        const rate = described / (elapsed || 1)
        console.log(
          `${TAG} Progress: described=${described} skipped=${skipped} errors=${errors} total=${totalProcessed} (${rate.toFixed(1)}/s)`
        )
        lastLog = Date.now()
      }
    }

    await flushMeili()
  } finally {
    db.close()
  }

  const elapsed = (Date.now() - startTime) / 1000
  const rate = described / (elapsed || 1)
  console.log(`\n${TAG} === Description Complete ===`)
  console.log(`${TAG} Described:  ${described}`)
  console.log(`${TAG} Skipped:    ${skipped}`)
  console.log(`${TAG} Errors:     ${errors}`)
  console.log(`${TAG} Total:      ${totalProcessed}`)
  console.log(`${TAG} Elapsed:    ${elapsed.toFixed(1)}s (${rate.toFixed(1)} images/s)`)
}

main().catch(err => {
  console.error('[describe-photos] Fatal error:', err)
  process.exit(1)
})
