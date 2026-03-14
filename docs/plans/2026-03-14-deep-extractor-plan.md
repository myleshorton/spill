# Deep Document Extractor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a two-phase pipeline that triages all 1.44M documents with heuristics, then deep-extracts flagged documents using PyMuPDF, regex, and Groq LLM.

**Architecture:** Phase 1 scores every document with 8 heuristic signals (no LLM). Phase 2 processes flagged documents in score order: PyMuPDF extraction, programmatic parsing, single Groq LLM call, PDF generation, and metadata storage.

**Tech Stack:** Node.js, better-sqlite3, p-limit, PyMuPDF (fitz), fpdf2, Groq (openai SDK), Meilisearch

---

### Task 1: DB Migrations

**Files:**
- Modify: `archiver/lib/documents-db.js` (`_migrate()` method)

**Step 1: Add migrations**

Add to the `_migrate()` method:

```js
// deep_extract_attempted column
try {
  this.db.exec('ALTER TABLE documents ADD COLUMN deep_extract_attempted INTEGER DEFAULT 0')
} catch (e) { /* column exists */ }

// extraction_triage table
this.db.exec(`
  CREATE TABLE IF NOT EXISTS extraction_triage (
    document_id TEXT PRIMARY KEY,
    score INTEGER,
    flags TEXT,
    triaged_at INTEGER,
    FOREIGN KEY (document_id) REFERENCES documents(id)
  );
  CREATE INDEX IF NOT EXISTS idx_triage_score ON extraction_triage(score);
`)

// extraction_metadata table
this.db.exec(`
  CREATE TABLE IF NOT EXISTS extraction_metadata (
    document_id TEXT PRIMARY KEY,
    extracted_doc_id TEXT,
    extraction_type TEXT,
    email_count INTEGER,
    senders TEXT,
    recipients TEXT,
    date_range_start TEXT,
    date_range_end TEXT,
    people_mentioned TEXT,
    summary TEXT,
    confidence REAL,
    extracted_at INTEGER,
    FOREIGN KEY (document_id) REFERENCES documents(id),
    FOREIGN KEY (extracted_doc_id) REFERENCES documents(id)
  );
`)
```

**Step 2: Add helper methods**

```js
upsertTriage (documentId, score, flags) {
  this.db.prepare(`
    INSERT OR REPLACE INTO extraction_triage (document_id, score, flags, triaged_at)
    VALUES (?, ?, ?, ?)
  `).run(documentId, score, JSON.stringify(flags), Date.now())
}

getTriagedDocs (minScore = 20, limit = 1000, offset = 0) {
  return this.db.prepare(`
    SELECT et.*, d.file_name, d.file_path, d.extracted_text, d.file_size, d.page_count, d.content_type
    FROM extraction_triage et
    JOIN documents d ON d.id = et.document_id
    WHERE et.score >= ? AND (d.deep_extract_attempted = 0 OR d.deep_extract_attempted IS NULL)
    ORDER BY et.score DESC
    LIMIT ? OFFSET ?
  `).all(minScore, limit, offset)
}

insertExtractionMetadata (meta) {
  this.db.prepare(`
    INSERT OR REPLACE INTO extraction_metadata
    (document_id, extracted_doc_id, extraction_type, email_count, senders, recipients,
     date_range_start, date_range_end, people_mentioned, summary, confidence, extracted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    meta.documentId, meta.extractedDocId, meta.extractionType, meta.emailCount || 0,
    JSON.stringify(meta.senders || []), JSON.stringify(meta.recipients || []),
    meta.dateRangeStart || null, meta.dateRangeEnd || null,
    JSON.stringify(meta.peopleMentioned || []), meta.summary || null,
    meta.confidence || 0, Date.now()
  )
}

markDeepExtractScanned (docId) {
  this.db.prepare('UPDATE documents SET deep_extract_attempted = 1 WHERE id = ?').run(docId)
}
```

**Step 3: Verify**

Run: `cd /opt/spill-archive && node -e "const DB = require('./archiver/lib/documents-db'); const db = new DB('./archiver/data/documents.db'); console.log('OK')"`

**Step 4: Commit**

```bash
git add archiver/lib/documents-db.js
git commit -m "feat: add deep extractor DB migrations and helper methods"
```

---

### Task 2: Triage Heuristics Library

**Files:**
- Create: `ingest/lib/triage-heuristics.js`

**Step 1: Create the scoring module**

```js
'use strict'

const SIGNALS = [
  {
    name: 'html_tags',
    points: 25,
    test: (doc) => {
      const text = doc.extracted_text || ''
      return /<(div|br|table|blockquote|span|td|tr|th|p\s|html|body|head)[>\s/]/i.test(text)
    }
  },
  {
    name: 'email_headers',
    points: 20,
    test: (doc) => {
      const text = doc.extracted_text || ''
      const headers = ['From:', 'To:', 'Subject:', 'Date:']
      const matches = headers.filter(h => text.includes(h))
      return matches.length >= 2
    }
  },
  {
    name: 'high_size_ratio',
    points: 15,
    test: (doc) => {
      const fileSize = doc.file_size || 0
      const textLen = (doc.extracted_text || '').length
      return fileSize > 500000 && textLen < 2000
    }
  },
  {
    name: 'multipage_short_text',
    points: 10,
    test: (doc) => {
      const pages = doc.page_count || 0
      const textLen = (doc.extracted_text || '').length
      return pages > 10 && textLen < 5000
    }
  },
  {
    name: 'embedded_images',
    points: 10,
    test: (doc) => {
      const text = doc.extracted_text || ''
      return /cid:|data:image|<img[\s>]/i.test(text)
    }
  },
  {
    name: 'email_filename',
    points: 10,
    test: (doc) => {
      const name = doc.file_name || ''
      return /^(EFTA|MAIL|MSG)/i.test(name)
    }
  },
  {
    name: 'attachment_refs',
    points: 5,
    test: (doc) => {
      const text = doc.extracted_text || ''
      return /attachment|attached file|see attached/i.test(text)
    }
  },
  {
    name: 'very_long_text',
    points: 5,
    test: (doc) => {
      return (doc.extracted_text || '').length > 100000
    }
  }
]

function triageScore (doc) {
  let score = 0
  const flags = []
  for (const signal of SIGNALS) {
    try {
      if (signal.test(doc)) {
        score += signal.points
        flags.push(signal.name)
      }
    } catch { /* skip broken signal */ }
  }
  return { score, flags }
}

module.exports = { triageScore, SIGNALS }
```

**Step 2: Commit**

```bash
git add ingest/lib/triage-heuristics.js
git commit -m "feat: add triage heuristics scoring library"
```

---

### Task 3: Triage Scanner Script

**Files:**
- Create: `ingest/triage-scan.js`

**Step 1: Create the scanner**

```js
#!/usr/bin/env node
/**
 * Phase 1: Triage Scanner — scores all documents with heuristics (no LLM).
 *
 * Usage:
 *   node ingest/triage-scan.js [--dataset N] [--batch-size 1000] [--db-path /path/to/documents.db]
 */
const path = require('path')
const DocumentsDatabase = require('../archiver/lib/documents-db')
const { triageScore } = require('./lib/triage-heuristics')

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
      if (score > 0) {
        rows.push({ id: doc.id, score, flags })
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
  console.log('\nScore distribution:')
  for (const [bucket, count] of Object.entries(scoreDistribution).sort((a, b) => b[0] - a[0])) {
    console.log(`  ${bucket}-${parseInt(bucket) + 9}: ${count}`)
  }

  db.db.close()
}

main().catch(err => { console.error(err); process.exit(1) })
```

**Step 2: Test locally**

Run: `node ingest/triage-scan.js --db-path archiver/data/documents.db`

(Will use local DB — if empty, test in Docker instead.)

**Step 3: Commit**

```bash
git add ingest/triage-scan.js
git commit -m "feat: add Phase 1 triage scanner script"
```

---

### Task 4: Python Extraction + PDF Generation

**Files:**
- Create: `ingest/lib/extract-pdf-gen.py`

**Step 1: Create the Python script**

```python
#!/usr/bin/env python3
"""
Extract text from PDFs using PyMuPDF and generate clean PDFs using fpdf2.

Usage:
  python3 extract-pdf-gen.py extract <input.pdf>          # Extract text to stdout
  python3 extract-pdf-gen.py generate <output.pdf> <title> # Read stdin, generate PDF
"""
import sys
import json
import re
import os


def extract_text(pdf_path):
    """Extract all text from a PDF using PyMuPDF."""
    import fitz
    doc = fitz.open(pdf_path)
    pages = []
    for page in doc:
        text = page.get_text()
        if text.strip():
            pages.append(text)
    doc.close()
    result = {
        'page_count': len(pages),
        'pages': pages,
        'full_text': '\n\n'.join(pages)
    }
    print(json.dumps(result))


def clean_html(text):
    """Strip HTML tags and clean up extracted text."""
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<p[^>]*>', '\n\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<div[^>]*>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'&quot;', '"', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def generate_pdf(output_path, title):
    """Read text from stdin and generate a formatted PDF."""
    from fpdf import FPDF

    content = sys.stdin.read()

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)

    # Try to use DejaVu for Unicode support, fall back to Helvetica
    font_name = 'Helvetica'
    dejavu_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    dejavu_bold = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    if os.path.exists(dejavu_path):
        pdf.add_font('DejaVu', '', dejavu_path, uni=True)
        if os.path.exists(dejavu_bold):
            pdf.add_font('DejaVu', 'B', dejavu_bold, uni=True)
        font_name = 'DejaVu'

    # Title page
    pdf.add_page()
    pdf.set_font(font_name, 'B', 18)
    pdf.multi_cell(0, 12, title)
    pdf.ln(5)
    pdf.set_font(font_name, '', 9)
    pdf.cell(0, 6, 'Deep Extraction — Spill Archive')
    pdf.ln(10)

    # Content
    pdf.set_font(font_name, '', 10)
    usable_width = pdf.w - pdf.l_margin - pdf.r_margin

    for line in content.split('\n'):
        if line.startswith('From:') or line.startswith('To:') or line.startswith('Subject:') or line.startswith('Date:'):
            pdf.set_font(font_name, 'B', 10)
            pdf.multi_cell(usable_width, 5, line)
            pdf.set_font(font_name, '', 10)
        elif line.strip() == '---':
            pdf.ln(3)
            pdf.cell(usable_width, 0, '', border='T')
            pdf.ln(3)
        else:
            pdf.multi_cell(usable_width, 5, line)

    pdf.output(output_path)
    print(json.dumps({'pages': pdf.page, 'size': os.path.getsize(output_path)}))


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: extract-pdf-gen.py <extract|generate> <path> [title]', file=sys.stderr)
        sys.exit(1)

    command = sys.argv[1]
    if command == 'extract':
        extract_text(sys.argv[2])
    elif command == 'generate':
        title = sys.argv[3] if len(sys.argv) > 3 else 'Extracted Document'
        generate_pdf(sys.argv[2], title)
    elif command == 'clean-html':
        text = sys.stdin.read()
        print(clean_html(text))
    else:
        print(f'Unknown command: {command}', file=sys.stderr)
        sys.exit(1)
```

**Step 2: Commit**

```bash
git add ingest/lib/extract-pdf-gen.py
git commit -m "feat: add Python PDF extraction and generation script"
```

---

### Task 5: Groq LLM Cleanup Module

**Files:**
- Create: `ingest/lib/extract-groq.js`

**Step 1: Create the module**

```js
'use strict'

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
const MAX_INPUT_CHARS = 6000

let groqClient = null

function getGroq () {
  if (!groqClient) {
    const OpenAI = require('openai')
    groqClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1'
    })
  }
  return groqClient
}

const PROMPT = `You are analyzing a document extracted from a large archive. The text has been programmatically parsed from a PDF and may contain OCR errors, garbled names, or formatting artifacts.

Analyze the text and return a JSON object with these fields:
{
  "cleaned_text": "First 2000 chars of cleaned-up text (fix obvious OCR errors, normalize names)",
  "people": ["List of people mentioned (full names, normalized)"],
  "organizations": ["List of organizations mentioned"],
  "document_type": "email_thread | embedded_html | metadata_rich | structured_table | correspondence | legal | financial | other",
  "summary": "2-3 sentence summary of what this document contains",
  "email_count": 0,
  "senders": ["email senders if applicable"],
  "recipients": ["email recipients if applicable"],
  "date_range_start": "ISO date or null",
  "date_range_end": "ISO date or null",
  "confidence": 0.8
}

Return ONLY valid JSON, no other text.`

async function groqCleanup (text) {
  const client = getGroq()
  const truncated = text.slice(0, MAX_INPUT_CHARS)

  const response = await client.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: PROMPT },
      { role: 'user', content: truncated }
    ],
    temperature: 0.1,
    max_tokens: 3000,
    response_format: { type: 'json_object' }
  })

  const content = response.choices[0]?.message?.content
  if (!content) return null

  try {
    return JSON.parse(content)
  } catch {
    console.warn('Failed to parse Groq response as JSON')
    return null
  }
}

module.exports = { groqCleanup }
```

**Step 2: Commit**

```bash
git add ingest/lib/extract-groq.js
git commit -m "feat: add Groq LLM cleanup module for deep extraction"
```

---

### Task 6: Extraction Metadata Module

**Files:**
- Create: `ingest/lib/extract-metadata.js`

**Step 1: Create the module**

```js
'use strict'

function storeExtractionMetadata (db, sourceDocId, extractedDocId, groqResult, extractionType) {
  db.insertExtractionMetadata({
    documentId: sourceDocId,
    extractedDocId,
    extractionType: groqResult?.document_type || extractionType || 'unknown',
    emailCount: groqResult?.email_count || 0,
    senders: groqResult?.senders || [],
    recipients: groqResult?.recipients || [],
    dateRangeStart: groqResult?.date_range_start || null,
    dateRangeEnd: groqResult?.date_range_end || null,
    peopleMentioned: [...(groqResult?.people || []), ...(groqResult?.organizations || [])],
    summary: groqResult?.summary || null,
    confidence: groqResult?.confidence || 0
  })
}

function getExtractionMetadata (db, docId) {
  return db.db.prepare('SELECT * FROM extraction_metadata WHERE document_id = ? OR extracted_doc_id = ?').get(docId, docId)
}

module.exports = { storeExtractionMetadata, getExtractionMetadata }
```

**Step 2: Commit**

```bash
git add ingest/lib/extract-metadata.js
git commit -m "feat: add extraction metadata storage module"
```

---

### Task 7: Deep Extraction Pipeline

**Files:**
- Create: `ingest/deep-extract.js`

**Step 1: Create the main pipeline script**

```js
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

function runPython (args, stdin = null) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [PYTHON_SCRIPT, ...args], {
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
  const limit = CONCURRENCY
  const limiter = pLimit(CONCURRENCY)

  let offset = 0
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
```

**Step 2: Commit**

```bash
git add ingest/deep-extract.js
git commit -m "feat: add Phase 2 deep extraction pipeline"
```

---

### Task 8: Integration Test

**Step 1: Run triage on local DB or Docker**

```bash
# In Docker:
docker compose exec archiver node ingest/triage-scan.js --dataset 9 --db-path /app/archiver/data/documents.db
```

**Step 2: Check score distribution**

```bash
docker compose exec archiver node -e "
  const DB = require('./archiver/lib/documents-db');
  const db = new DB('/app/archiver/data/documents.db');
  const rows = db.db.prepare('SELECT score, COUNT(*) as cnt FROM extraction_triage GROUP BY score ORDER BY score DESC LIMIT 20').all();
  console.table(rows);
"
```

**Step 3: Test deep extraction on a single document**

```bash
docker compose exec archiver node ingest/deep-extract.js --min-score 40 --limit 1 --db-path /app/archiver/data/documents.db
```

**Step 4: Verify the extracted document was created**

```bash
docker compose exec archiver node -e "
  const DB = require('./archiver/lib/documents-db');
  const db = new DB('/app/archiver/data/documents.db');
  const meta = db.db.prepare('SELECT * FROM extraction_metadata LIMIT 1').get();
  console.log(meta);
  const links = db.db.prepare('SELECT * FROM document_links ORDER BY created_at DESC LIMIT 5').all();
  console.log(links);
"
```

**Step 5: Commit**

No code changes — integration test is manual verification.

---

### Task 9: Deploy to Docker

**Step 1: Ensure Python dependencies in Dockerfile**

Check that the archiver Dockerfile includes `python3`, `python3-pip`, `pymupdf`, and `fpdf2`. If not, add:

```dockerfile
RUN apt-get update && apt-get install -y python3 python3-pip fonts-dejavu-core && \
    pip3 install --break-system-packages pymupdf fpdf2
```

**Step 2: Copy new files into running container (for hot deploy)**

```bash
docker compose cp ingest/triage-scan.js archiver:/app/ingest/triage-scan.js
docker compose cp ingest/deep-extract.js archiver:/app/ingest/deep-extract.js
docker compose cp ingest/lib/triage-heuristics.js archiver:/app/ingest/lib/triage-heuristics.js
docker compose cp ingest/lib/extract-pdf-gen.py archiver:/app/ingest/lib/extract-pdf-gen.py
docker compose cp ingest/lib/extract-groq.js archiver:/app/ingest/lib/extract-groq.js
docker compose cp ingest/lib/extract-metadata.js archiver:/app/ingest/lib/extract-metadata.js
docker compose cp archiver/lib/documents-db.js archiver:/app/archiver/lib/documents-db.js
```

**Step 3: Install Python deps in container**

```bash
docker compose exec archiver bash -c "apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y python3 python3-pip fonts-dejavu-core && pip3 install --break-system-packages pymupdf fpdf2"
```

**Step 4: Run full triage + extraction**

```bash
docker compose exec archiver node ingest/triage-scan.js --db-path /app/archiver/data/documents.db
docker compose exec archiver node ingest/deep-extract.js --min-score 30 --limit 50 --db-path /app/archiver/data/documents.db
```

**Step 5: Restart archiver to pick up DB changes**

```bash
docker compose restart archiver
```

**Step 6: Commit all changes**

```bash
git add -A
git commit -m "feat: deploy deep document extractor pipeline"
```
