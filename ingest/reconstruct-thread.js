#!/usr/bin/env node
/**
 * Deep email thread reconstruction using GPT-4o.
 * Processes a PDF in overlapping page windows, extracts unique emails,
 * then consolidates into a final clean thread.
 *
 * Usage:
 *   node reconstruct-thread.js --db-path /path/to/db --doc-id <id> [--min-score 60] [--batch]
 *
 * --batch mode processes all docs above --min-score that haven't been reconstructed yet.
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('node:child_process')
const OpenAI = require('openai')
const DocumentsDatabase = require('../archiver/lib/documents-db')

const args = parseArgs(process.argv.slice(2))
const DB_PATH = args['db-path'] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const DOC_ID = args['doc-id'] || null
const MIN_SCORE = parseInt(args['min-score'] || '60') || 60
const BATCH = args.batch === 'true'
const PYTHON_SCRIPT = path.join(__dirname, 'lib', 'extract-pdf-gen.py')

const client = new OpenAI()

function parseArgs (argv) {
  const result = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i].startsWith('--')) result[argv[i].slice(2)] = argv[i + 1]
  }
  return result
}

function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

function buildWindows (pageCount) {
  // Adaptive windowing based on document size
  const windows = []
  if (pageCount <= 10) {
    windows.push([0, pageCount])
  } else if (pageCount <= 30) {
    for (let i = 0; i < pageCount; i += 6) {
      windows.push([Math.max(0, i - 2), Math.min(pageCount, i + 8)])
    }
  } else if (pageCount <= 100) {
    for (let i = 0; i < pageCount; i += 10) {
      windows.push([Math.max(0, i - 3), Math.min(pageCount, i + 13)])
    }
  } else {
    for (let i = 0; i < pageCount; i += 15) {
      windows.push([Math.max(0, i - 4), Math.min(pageCount, i + 18)])
    }
  }
  return windows
}

async function extractFromWindow (pages, start, end, prevContext) {
  const section = pages.slice(start, end).join('\n\n')
  if (section.length < 100) return null

  const resp = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are extracting emails from garbled OCR text from behind redaction bars in an Epstein archive PDF. Read through OCR errors aggressively.\n\nRULES:\n- Extract the FULL body text of every unique email in this section\n- Fix OCR errors where meaning is clear from context\n- Mark genuinely redacted/blacked-out content as [Redacted]\n- Strip HTML tags, base64, MIME headers, CSS, image filenames\n- Format: On [Date], [Sender] wrote:\\n[full body]\\n---\n- If the section only contains repeated quoted text from already-extracted emails, return just: DUPLICATE\n- Be thorough - extract every readable sentence, do not summarize or truncate'
      },
      {
        role: 'user',
        content: (prevContext
          ? 'Emails already extracted (do NOT repeat):\n' + prevContext + '\n\nExtract NEW emails from pages ' + (start + 1) + '-' + end + ':\n\n'
          : 'Extract emails from pages ' + (start + 1) + '-' + end + ':\n\n') + section.slice(0, 80000)
      }
    ],
    temperature: 0.1,
    max_tokens: 6000
  })

  const inputCost = (resp.usage.prompt_tokens / 1000000) * 2.50
  const outputCost = (resp.usage.completion_tokens / 1000000) * 10.00
  return { text: resp.choices[0].message.content, cost: inputCost + outputCost }
}

async function consolidate (rawEmails, fileName) {
  const resp = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'Produce the FINAL definitive reconstruction of an email thread from ' + fileName + ', a document from the Epstein archive.\n\nRULES:\n- Deduplicate: each unique email exactly once\n- Keep FULL body text of each email\n- Fix remaining OCR errors\n- Reverse chronological order (newest first)\n- Format: On [Date], [Sender] wrote:\\n[full body]\\n---\n- Mark redacted content as [Redacted]\n- Do NOT end with repeated [Redacted] tags\n- Do NOT truncate or summarize'
      },
      {
        role: 'user',
        content: 'Produce the final thread with full email bodies:\n\n' + rawEmails.slice(0, 120000)
      }
    ],
    temperature: 0.1,
    max_tokens: 16000
  })

  let output = resp.choices[0].message.content
  const spamIdx = output.indexOf('[Redacted] [Redacted] [Redacted]')
  if (spamIdx > -1) output = output.slice(0, spamIdx).trim()
  const inputCost = (resp.usage.prompt_tokens / 1000000) * 2.50
  const outputCost = (resp.usage.completion_tokens / 1000000) * 10.00
  return { output, tokens: resp.usage.total_tokens, cost: inputCost + outputCost }
}

async function reconstructDoc (db, sourceDoc) {
  const pdfPath = sourceDoc.file_path
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    console.error('  File not found: ' + pdfPath)
    return null
  }

  // Extract per-page text
  let parsed
  try {
    const result = execFileSync('python3', [PYTHON_SCRIPT, 'extract', pdfPath], { maxBuffer: 100 * 1024 * 1024 })
    parsed = JSON.parse(result.toString())
  } catch (e) {
    console.error('  PyMuPDF failed: ' + e.message)
    return null
  }

  const pages = parsed.pages
  const windows = buildWindows(pages.length)
  console.error('  ' + pages.length + ' pages, ' + windows.length + ' windows')

  const allEmails = []
  const prevLines = []
  let docCost = 0

  for (const [start, end] of windows) {
    const context = prevLines.slice(-15).join('\n')
    const result = await extractFromWindow(pages, start, end, context)

    if (result && result.text && !result.text.includes('DUPLICATE') && result.text.trim().length > 50) {
      allEmails.push(result.text.trim())
      docCost += result.cost || 0
      const lines = result.text.split('\n').filter(l => l.length > 30)
      for (const l of lines.slice(0, 5)) prevLines.push(l.slice(0, 100))
      console.error('    pages ' + (start + 1) + '-' + end + ': ' + result.text.length + ' chars')
    } else if (result) {
      docCost += result.cost || 0
    }
    await sleep(800)
  }

  if (allEmails.length === 0) {
    console.error('  No emails extracted')
    return null
  }

  // Consolidate
  const combined = allEmails.join('\n\n---\n\n')
  console.error('  Consolidating ' + allEmails.length + ' sections (' + combined.length + ' chars)...')
  const { output, cost: consolidateCost } = await consolidate(combined, sourceDoc.file_name)
  docCost += consolidateCost || 0

  const header = 'Reconstructed & Cleaned Email Thread \u2014 ' + sourceDoc.file_name + '\n' +
    'Unique messages presented in reverse chronological order (newest to oldest).\n' +
    'Reconstruction performed by GPT-4o from garbled OCR text extracted from behind redaction bars.\n\n---\n\n'

  const final = header + output
  const emailCount = (final.match(/\nOn /g) || []).length
  console.error('  Final: ' + final.length + ' chars, ' + emailCount + ' emails, $' + docCost.toFixed(2))

  // Update the extracted document
  const extracted = db.db.prepare(
    "SELECT id, file_path FROM documents WHERE title = ? LIMIT 1"
  ).get('Extracted: ' + sourceDoc.file_name)

  if (extracted) {
    fs.writeFileSync(extracted.file_path, final)
    db.db.prepare('UPDATE documents SET extracted_text = ? WHERE id = ?').run(final, extracted.id)
    console.error('  Updated ' + extracted.id)
  }

  return { emailCount, chars: final.length, cost: docCost }
}

async function main () {
  const db = new DocumentsDatabase(DB_PATH)
  let totalCost = 0
  let totalDocs = 0

  if (DOC_ID) {
    // Single document mode
    const doc = db.db.prepare('SELECT * FROM documents WHERE id = ?').get(DOC_ID)
    if (!doc) { console.error('Doc not found'); process.exit(1) }
    console.error('Reconstructing: ' + doc.file_name)
    const result = await reconstructDoc(db, doc)
    if (result) totalCost = result.cost
  } else if (BATCH) {
    // Batch mode: process all high-scoring docs
    const docs = db.db.prepare(`
      SELECT DISTINCT d.*
      FROM document_links dl
      JOIN documents d ON d.id = dl.target_id
      JOIN extraction_triage et ON et.document_id = d.id
      WHERE dl.link_type = 'source'
        AND et.score >= ?
      ORDER BY et.score DESC
    `).all(MIN_SCORE)

    // Skip EFTA00143287 (already done) and duplicates
    const seen = new Set()
    const toProcess = []
    for (const d of docs) {
      if (seen.has(d.file_name)) continue
      if (d.file_name === 'EFTA00143287.pdf') { seen.add(d.file_name); continue }
      seen.add(d.file_name)
      toProcess.push(d)
    }

    console.error('Processing ' + toProcess.length + ' docs (score >= ' + MIN_SCORE + ')')

    for (let i = 0; i < toProcess.length; i++) {
      const doc = toProcess[i]
      console.error('\n[' + (i + 1) + '/' + toProcess.length + '] ' + doc.file_name + ' (' + doc.page_count + 'p, score ' + doc.id + ')')
      try {
        const result = await reconstructDoc(db, doc)
        if (result) {
          totalCost += result.cost
          totalDocs++
          console.error('  Running total: ' + totalDocs + ' docs, $' + totalCost.toFixed(2))
        }
      } catch (e) {
        console.error('  Error: ' + e.message)
      }
    }
  }

  console.error('\nDone. ' + totalDocs + ' docs, $' + totalCost.toFixed(2) + ' total')
  db.db.close()
}

main().catch(e => { console.error(e.message); process.exit(1) })
