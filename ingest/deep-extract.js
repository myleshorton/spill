#!/usr/bin/env node
/**
 * Phase 2: Deep Extractor — processes triaged documents in score order.
 *
 * Usage:
 *   node ingest/deep-extract.js [--min-score 20] [--limit 100] [--concurrency 5] [--db-path /path/to/documents.db]
 */
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
// Using spawn (not exec) — safe from shell injection, arguments passed as array
const { spawn } = require('node:child_process')
const pLimit = require('p-limit')

const DocumentsDatabase = require('../archiver/lib/documents-db')
const { groqCleanup } = require('./lib/extract-groq')
const { storeExtractionMetadata } = require('./lib/extract-metadata')

const args = parseArgs(process.argv.slice(2))
const DB_PATH = args['db-path'] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const MIN_SCORE = parseInt(args['min-score'] || '20') || 20
const LIMIT = parseInt(args.limit || '0') || 0
const CONCURRENCY = parseInt(args.concurrency || '5') || 5
const CONTENT_DIR = args['content-dir'] || path.join(__dirname, '..', 'archiver', 'data', 'content')
const PYTHON_SCRIPT = path.join(__dirname, 'lib', 'extract-pdf-gen.py')

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

function runPython (pyArgs, stdin = null) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [PYTHON_SCRIPT, ...pyArgs], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', d => { stdout += d })
    proc.stderr.on('data', d => { stderr += d })
    proc.on('close', code => {
      if (code !== 0) reject(new Error(`Python exit ${code}: ${stderr}`))
      else resolve(stdout)
    })
    if (stdin) {
      proc.stdin.write(stdin)
      proc.stdin.end()
    } else {
      proc.stdin.end()
    }
  })
}

function extractEmailHeaders (text) {
  const headers = []
  const pattern = /(?:^|\n)(From:\s*.+?)(?=\n(?:From:|$))/gs
  let match
  while ((match = pattern.exec(text)) !== null) {
    const block = match[1]
    const from = block.match(/From:\s*(.+)/)?.[1]?.trim()
    const to = block.match(/To:\s*(.+)/)?.[1]?.trim()
    const subject = block.match(/Subject:\s*(.+)/)?.[1]?.trim()
    const date = block.match(/Date:\s*(.+)/)?.[1]?.trim()
    if (from) headers.push({ from, to, subject, date })
  }
  return headers
}

async function processDocument (db, doc) {
  const filePath = doc.file_path
  if (!filePath || !fs.existsSync(filePath)) {
    db.markDeepExtractScanned(doc.document_id)
    return { status: 'skipped', reason: 'file_not_found' }
  }

  let extractedText = doc.extracted_text || ''

  // Step 1: Try PyMuPDF extraction for PDFs
  if (doc.content_type === 'pdf' || (doc.file_name || '').toLowerCase().endsWith('.pdf')) {
    try {
      const result = JSON.parse(await runPython(['extract', filePath]))
      if (result.full_text && result.full_text.length > extractedText.length) {
        extractedText = result.full_text
      }
    } catch (err) {
      console.warn(`  PyMuPDF failed for ${doc.document_id}: ${err.message}`)
    }
  }

  // Step 2: Clean HTML if present
  if (/<(div|br|table|html|body)[>\s]/i.test(extractedText)) {
    try {
      const cleaned = await runPython(['clean-html'], extractedText)
      if (cleaned.trim().length > 100) {
        extractedText = cleaned.trim()
      }
    } catch { /* keep original */ }
  }

  // Step 3: Extract email headers programmatically
  const emailHeaders = extractEmailHeaders(extractedText)

  // Step 4: Groq LLM cleanup
  let groqResult = null
  try {
    groqResult = await groqCleanup(extractedText)
    await sleep(200) // rate limit
  } catch (err) {
    console.warn(`  Groq failed for ${doc.document_id}: ${err.message}`)
  }

  // Step 5: Generate output PDF
  const docId = crypto.createHash('md5').update(`deep_extract_${doc.document_id}_${Date.now()}`).digest('hex')
  const outputDir = path.join(CONTENT_DIR, 'extracted')
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `${docId}.pdf`)

  const title = `Extracted: ${doc.file_name || doc.document_id}`
  const contentForPdf = groqResult?.cleaned_text || extractedText.slice(0, 50000)

  try {
    await runPython(['generate', outputPath, title], contentForPdf)
  } catch (err) {
    console.warn(`  PDF generation failed for ${doc.document_id}: ${err.message}`)
    db.markDeepExtractScanned(doc.document_id)
    return { status: 'error', reason: 'pdf_gen_failed' }
  }

  // Step 6: Store results
  const now = Date.now()
  db.db.prepare(`
    INSERT OR IGNORE INTO documents (id, title, file_name, data_set, content_type, file_path, extracted_text, created_at, collection_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    docId,
    title,
    `${docId}.pdf`,
    0,
    'pdf',
    outputPath,
    groqResult?.cleaned_text || extractedText.slice(0, 10000),
    now,
    1
  )

  // Bidirectional links
  db.linkDocuments(doc.document_id, docId, 'extraction', 'Deep extraction output')
  db.linkDocuments(docId, doc.document_id, 'source', 'Original source document')

  // Store metadata
  storeExtractionMetadata(db, doc.document_id, docId, groqResult, 'deep_extraction')

  // Mark scanned
  db.markDeepExtractScanned(doc.document_id)

  return { status: 'success', extractedDocId: docId, emailCount: emailHeaders.length }
}

async function main () {
  const db = new DocumentsDatabase(DB_PATH)
  const limiter = pLimit(CONCURRENCY)

  let totalProcessed = 0
  let totalSuccess = 0
  let totalError = 0
  const startTime = Date.now()
  let lastLog = startTime

  console.log(`Deep extraction: min_score=${MIN_SCORE}, concurrency=${CONCURRENCY}`)

  while (true) {
    const batchLimit = LIMIT > 0 ? Math.min(100, LIMIT - totalProcessed) : 100
    if (batchLimit <= 0) break

    const docs = db.getTriagedDocs(MIN_SCORE, batchLimit, 0) // offset=0 because we mark scanned
    if (docs.length === 0) break

    const results = await Promise.all(
      docs.map(doc => limiter(async () => {
        try {
          return await processDocument(db, doc)
        } catch (err) {
          console.error(`  Error processing ${doc.document_id}: ${err.message}`)
          db.markDeepExtractScanned(doc.document_id)
          return { status: 'error', reason: err.message }
        }
      }))
    )

    for (const r of results) {
      totalProcessed++
      if (r.status === 'success') totalSuccess++
      else totalError++
    }

    const now = Date.now()
    if (now - lastLog > 10000) {
      const elapsed = ((now - startTime) / 1000).toFixed(1)
      console.log(`  ${totalProcessed} processed (${totalSuccess} success, ${totalError} errors) in ${elapsed}s`)
      lastLog = now
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\nDone: ${totalProcessed} documents in ${elapsed}s`)
  console.log(`  Success: ${totalSuccess}`)
  console.log(`  Errors: ${totalError}`)

  db.db.close()
}

main().catch(err => { console.error(err); process.exit(1) })
