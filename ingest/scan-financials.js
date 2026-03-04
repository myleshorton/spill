#!/usr/bin/env node
/**
 * Batch financial document parsing — structured extraction via GPT-4o-mini.
 *
 * Usage:
 *   node ingest/scan-financials.js --dataset 10 [--batch-size 50] [--limit N] [--concurrency 3] [--db-path /path/to/documents.db]
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

const FINANCIAL_PROMPT = `You are analyzing documents from the Jeffrey Epstein case for any financial information.

Extract ALL mentions of money, payments, purchases, donations, fees, salaries, property values, travel costs, wire transfers, account balances, or any other financial activity. These documents are mostly emails with OCR artifacts — look past garbled text.

Return JSON: {"records": [{"type":"...", "amount":N, "currency":"USD", "date":"YYYY-MM-DD", "from":"entity name", "to":"entity name", "description":"brief description"}]}

Types: payment, purchase, travel, donation, transfer, salary, fee, property, investment, legal, other

Rules:
- Extract ANY dollar amount or financial reference, even informal ones ("$245 chair", "tickets cost $104")
- "from" and "to" should be real people, companies, or accounts — use full names when available
- Use null for unknown fields — partial records are fine
- amount as a number, no currency symbols
- date as YYYY-MM-DD when available
- Note travel bookings with costs (flights, hotels) as type "travel"
- Note property references with values as type "property"
- Return {"records": []} ONLY if there is truly zero financial information`

let anthropic = null

function getAnthropic () {
  if (!anthropic) {
    const Anthropic = require('@anthropic-ai/sdk')
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropic
}

async function extractFinancials (text) {
  const client = getAnthropic()
  const truncated = text.slice(0, MAX_TEXT_CHARS)

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    system: FINANCIAL_PROMPT,
    messages: [
      { role: 'user', content: truncated }
    ]
  })

  const content = response.content[0]?.text || '{"records":[]}'
  // Extract JSON from response (Claude may wrap it in markdown code blocks)
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  const jsonStr = jsonMatch ? jsonMatch[0] : '{"records":[]}'
  try {
    const parsed = JSON.parse(jsonStr)
    const records = Array.isArray(parsed) ? parsed : (parsed.records || [])
    const VALID_TYPES = new Set(['payment','purchase','travel','donation','transfer','salary','fee','property','investment','legal','other','transaction','balance','invoice'])
    return records.filter(r => r.type && VALID_TYPES.has(r.type))
  } catch {
    return []
  }
}

async function main () {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[scan-financials] ANTHROPIC_API_KEY not set — exiting.')
    process.exit(1)
  }

  console.log('[scan-financials] Starting batch financial extraction...')
  console.log('[scan-financials] Database:', DB_PATH)
  console.log('[scan-financials] Dataset:', DATASET)
  console.log('[scan-financials] Batch size:', BATCH_SIZE)
  console.log('[scan-financials] Concurrency:', CONCURRENCY)
  if (LIMIT > 0) console.log('[scan-financials] Limit:', LIMIT)

  const db = new DocumentsDatabase(DB_PATH)
  const limit = pLimit(CONCURRENCY)
  let recordsFound = 0
  let docsWithRecords = 0
  let skipped = 0
  let errors = 0
  let totalProcessed = 0
  const startTime = Date.now()
  let lastTick = Date.now()

  try {
    while (true) {
      const remaining = LIMIT > 0 ? Math.min(BATCH_SIZE, LIMIT - totalProcessed) : BATCH_SIZE
      if (remaining <= 0) break

      const docs = db.getUnscannedFinancials(DATASET, remaining)
      if (docs.length === 0) break

      const tasks = docs.map(doc => limit(async () => {
        await sleep(RATE_LIMIT_MS)
        try {
          const text = doc.extracted_text || doc.transcript || ''
          if (text.trim().length < 20) {
            db.markFinancialScanned(doc.id)
            skipped++
            return
          }

          const records = await extractFinancials(text)
          const rawJson = JSON.stringify(records)

          if (records.length > 0) {
            for (const record of records) {
              db.insertFinancialRecord({
                documentId: doc.id,
                type: record.type,
                amount: record.amount,
                currency: record.currency || 'USD',
                date: record.date,
                from: record.from,
                to: record.to,
                description: record.description,
                rawJson
              })
            }
            recordsFound += records.length
            docsWithRecords++
          }

          db.markFinancialScanned(doc.id)
        } catch (err) {
          console.warn('[scan-financials] Error for %s: %s', doc.id, err.message)
          db.markFinancialScanned(doc.id)
          errors++
        }
      }))

      await Promise.allSettled(tasks)
      totalProcessed += docs.length

      if (Date.now() - lastTick >= 10000) {
        const elapsed = (Date.now() - startTime) / 1000
        const rate = totalProcessed / (elapsed || 1)
        console.log('[scan-financials] Progress: records=%d docs_with=%d skipped=%d errors=%d total=%d (%s/s)',
          recordsFound, docsWithRecords, skipped, errors, totalProcessed, rate.toFixed(1))
        lastTick = Date.now()
      }
    }
  } finally {
    db.close()
  }

  const elapsed = (Date.now() - startTime) / 1000
  console.log('\n[scan-financials] === Financial Extraction Complete ===')
  console.log('[scan-financials] Records found: %d', recordsFound)
  console.log('[scan-financials] Docs with records: %d', docsWithRecords)
  console.log('[scan-financials] Skipped: %d', skipped)
  console.log('[scan-financials] Errors: %d', errors)
  console.log('[scan-financials] Total processed: %d', totalProcessed)
  console.log('[scan-financials] Elapsed: %ss', elapsed.toFixed(1))
}

main().catch(err => {
  console.error('[scan-financials] Fatal error:', err)
  process.exit(1)
})
