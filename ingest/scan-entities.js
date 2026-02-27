#!/usr/bin/env node
/**
 * Batch entity extraction — NER via GPT-4o-mini to extract people, organizations, and locations.
 *
 * Usage:
 *   node ingest/scan-entities.js --dataset 10 [--batch-size 50] [--limit N] [--concurrency 3] [--db-path /path/to/documents.db]
 */
const path = require('path')
const pLimit = require('p-limit')

const DocumentsDatabase = require('../archiver/lib/documents-db')

const args = parseArgs(process.argv.slice(2))
const DB_PATH = args['db-path'] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const DATASET = parseInt(args.dataset || '10') || 10
const BATCH_SIZE = parseInt(args['batch-size'] || '50') || 50
const LIMIT = parseInt(args.limit || '0') || 0
const CONCURRENCY = parseInt(args.concurrency || '3') || 3
const RATE_LIMIT_MS = 200
const MAX_TEXT_CHARS = 8000

function parseArgs (argv) {
  const result = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i].startsWith('--')) {
      result[argv[i].slice(2)] = argv[i + 1]
    }
  }
  return result
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const NER_PROMPT = `Extract all named entities from this text. Return a JSON array only, no other text:
[{"name": "Full Name", "type": "person|organization|location", "count": N}]

Rules:
- Only include clearly identifiable entities
- Normalize names (e.g., "J. Epstein" → "Jeffrey Epstein")
- type must be one of: person, organization, location
- count is how many times the entity appears in the text
- Return [] if no entities found`

let openai = null

function getOpenAI () {
  if (!openai) {
    const OpenAI = require('openai')
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openai
}

async function extractEntities (text) {
  const client = getOpenAI()
  const truncated = text.slice(0, MAX_TEXT_CHARS)

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: NER_PROMPT },
      { role: 'user', content: truncated }
    ],
    temperature: 0,
    max_tokens: 2000,
    response_format: { type: 'json_object' }
  })

  const content = response.choices[0]?.message?.content || '[]'
  try {
    const parsed = JSON.parse(content)
    // Handle both array and {entities: [...]} formats
    const entities = Array.isArray(parsed) ? parsed : (parsed.entities || [])
    return entities.filter(e =>
      e.name && typeof e.name === 'string' && e.name.trim().length > 1 &&
      ['person', 'organization', 'location'].includes(e.type)
    )
  } catch {
    return []
  }
}

async function main () {
  if (!process.env.OPENAI_API_KEY) {
    console.error('[scan-entities] OPENAI_API_KEY not set — exiting.')
    process.exit(1)
  }

  console.log('[scan-entities] Starting batch entity extraction...')
  console.log('[scan-entities] Database:', DB_PATH)
  console.log('[scan-entities] Dataset:', DATASET)
  console.log('[scan-entities] Batch size:', BATCH_SIZE)
  console.log('[scan-entities] Concurrency:', CONCURRENCY)
  if (LIMIT > 0) console.log('[scan-entities] Limit:', LIMIT)

  const db = new DocumentsDatabase(DB_PATH)
  const limit = pLimit(CONCURRENCY)
  let entitiesFound = 0
  let docsWithEntities = 0
  let skipped = 0
  let errors = 0
  let totalProcessed = 0
  const startTime = Date.now()
  let lastTick = Date.now()

  try {
    while (true) {
      const remaining = LIMIT > 0 ? Math.min(BATCH_SIZE, LIMIT - totalProcessed) : BATCH_SIZE
      if (remaining <= 0) break

      const docs = db.getUnscannedForEntities(DATASET, remaining)
      if (docs.length === 0) break

      const tasks = docs.map(doc => limit(async () => {
        await sleep(RATE_LIMIT_MS)
        try {
          const text = doc.extracted_text || doc.transcript || ''
          if (text.trim().length < 20) {
            db.markEntityScanned(doc.id)
            skipped++
            return
          }

          const entities = await extractEntities(text)

          if (entities.length > 0) {
            for (const entity of entities) {
              const entityId = db.upsertEntity(entity.name, entity.type)
              if (entityId) {
                db.linkDocumentEntity(doc.id, entityId, entity.count || 1)
              }
            }
            entitiesFound += entities.length
            docsWithEntities++
          }

          db.markEntityScanned(doc.id)
        } catch (err) {
          console.warn('[scan-entities] Error for %s: %s', doc.id, err.message)
          db.markEntityScanned(doc.id)
          errors++
        }
      }))

      await Promise.allSettled(tasks)
      totalProcessed += docs.length

      if (Date.now() - lastTick >= 10000) {
        const elapsed = (Date.now() - startTime) / 1000
        const rate = totalProcessed / (elapsed || 1)
        console.log('[scan-entities] Progress: entities=%d docs_with=%d skipped=%d errors=%d total=%d (%s/s)',
          entitiesFound, docsWithEntities, skipped, errors, totalProcessed, rate.toFixed(1))
        lastTick = Date.now()
      }
    }
  } finally {
    db.close()
  }

  const elapsed = (Date.now() - startTime) / 1000
  console.log('\n[scan-entities] === Entity Extraction Complete ===')
  console.log('[scan-entities] Entities found: %d', entitiesFound)
  console.log('[scan-entities] Docs with entities: %d', docsWithEntities)
  console.log('[scan-entities] Skipped: %d', skipped)
  console.log('[scan-entities] Errors: %d', errors)
  console.log('[scan-entities] Total processed: %d', totalProcessed)
  console.log('[scan-entities] Elapsed: %ss', elapsed.toFixed(1))
}

main().catch(err => {
  console.error('[scan-entities] Fatal error:', err)
  process.exit(1)
})
