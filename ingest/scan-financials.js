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

const FINANCIAL_PROMPT = `Extract financial records from this document. Return a JSON object with an array:
{"records": [{"type":"transaction|balance|transfer|invoice","amount":N,"currency":"USD","date":"YYYY-MM-DD","from":"entity name","to":"entity name","description":"brief description"}]}

Rules:
- Only include clearly identifiable financial data
- Use null for unknown fields
- amount should be a number (no currency symbols)
- date should be ISO format YYYY-MM-DD
- type must be one of: transaction, balance, transfer, invoice
- Return {"records": []} if no financial data found`

let openai = null

function getOpenAI () {
  if (!openai) {
    const OpenAI = require('openai')
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openai
}

async function extractFinancials (text) {
  const client = getOpenAI()
  const truncated = text.slice(0, MAX_TEXT_CHARS)

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: FINANCIAL_PROMPT },
      { role: 'user', content: truncated }
    ],
    temperature: 0,
    max_tokens: 2000,
    response_format: { type: 'json_object' }
  })

  const content = response.choices[0]?.message?.content || '{"records":[]}'
  try {
    const parsed = JSON.parse(content)
    const records = Array.isArray(parsed) ? parsed : (parsed.records || [])
    return records.filter(r =>
      r.type && ['transaction', 'balance', 'transfer', 'invoice'].includes(r.type)
    )
  } catch {
    return []
  }
}

async function main () {
  if (!process.env.OPENAI_API_KEY) {
    console.error('[scan-financials] OPENAI_API_KEY not set — exiting.')
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
