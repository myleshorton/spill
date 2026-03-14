#!/usr/bin/env node
/**
 * Phase 1: Triage Scanner — scores all documents with heuristics (no LLM).
 *
 * Usage:
 *   node ingest/triage-scan.js [--dataset N] [--batch-size 1000] [--db-path /path/to/documents.db]
 */
const path = require('path')
const DocumentsDatabase = require('../archiver/lib/documents-db')
const { triageScore, detectHiddenContent } = require('./lib/triage-heuristics')

const args = parseArgs(process.argv.slice(2))
const DB_PATH = args['db-path'] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const DATASET = args.dataset ? parseInt(args.dataset) : null
const BATCH_SIZE = parseInt(args['batch-size'] || '1000') || 1000

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
  const db = new DocumentsDatabase(DB_PATH)

  const whereClause = DATASET ? `WHERE d.data_set = ${DATASET}` : ''
  const total = db.db.prepare(`SELECT COUNT(*) as cnt FROM documents d ${whereClause}`).get().cnt
  console.log(`Triaging ${total} documents...`)

  let processed = 0
  let flagged = 0
  let hiddenCount = 0
  const scoreDistribution = {}
  const startTime = Date.now()
  let lastLog = startTime

  const upsertStmt = db.db.prepare(`
    INSERT OR REPLACE INTO extraction_triage (document_id, score, flags, triaged_at)
    VALUES (?, ?, ?, ?)
  `)

  const insertMany = db.db.transaction((rows) => {
    for (const row of rows) {
      upsertStmt.run(row.id, row.score, JSON.stringify(row.flags), Date.now())
    }
  })

  let offset = 0
  while (true) {
    const batch = db.db.prepare(`
      SELECT id, file_name, file_size, page_count, extracted_text, content_type
      FROM documents d ${whereClause}
      LIMIT ? OFFSET ?
    `).all(BATCH_SIZE, offset)

    if (batch.length === 0) break

    const rows = []
    for (const doc of batch) {
      const { score, flags } = triageScore(doc)
      const hidden = detectHiddenContent(doc)
      if (hidden) {
        flags.push('hidden_content')
        hiddenCount++
      }
      if (score > 0 || hidden) {
        rows.push({ id: doc.id, score: hidden ? Math.max(score, 50) : score, flags })
        flagged++
        const bucket = Math.floor(score / 10) * 10
        scoreDistribution[bucket] = (scoreDistribution[bucket] || 0) + 1
      }
      processed++
    }

    if (rows.length > 0) insertMany(rows)
    offset += BATCH_SIZE

    const now = Date.now()
    if (now - lastLog > 10000) {
      const rate = Math.round(processed / ((now - startTime) / 1000))
      console.log(`  ${processed}/${total} (${rate}/s) — ${flagged} flagged`)
      lastLog = now
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\nDone: ${processed} documents triaged in ${elapsed}s`)
  console.log(`Flagged: ${flagged} documents with score > 0`)
  console.log(`Hidden content detected: ${hiddenCount} documents`)
  console.log('\nScore distribution:')
  for (const [bucket, count] of Object.entries(scoreDistribution).sort((a, b) => b[0] - a[0])) {
    console.log(`  ${bucket}-${parseInt(bucket) + 9}: ${count}`)
  }

  db.db.close()
}

main().catch(err => { console.error(err); process.exit(1) })
