#!/usr/bin/env node
/**
 * Deep reconstruction of EFTA00143287 email thread using GPT-4o.
 * Processes the 118-page PDF in page windows, extracts each email individually,
 * then consolidates into a final clean thread.
 *
 * Uses execFileSync (not exec) for safe subprocess invocation.
 */
const fs = require('fs')
const path = require('path')
// execFileSync is safe - passes args as array, no shell injection
const { execFileSync, execSync } = require('node:child_process')
const OpenAI = require('openai')
const DocumentsDatabase = require('../archiver/lib/documents-db')

const DB_PATH = process.argv[2] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const PDF_PATH = process.argv[3]

const client = new OpenAI()

function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

async function extractEmailFromPages (pages, pageStart, pageEnd, prevContext) {
  const section = pages.slice(pageStart, pageEnd).join('\n\n')
  if (section.length < 100) return null

  const resp = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are extracting emails from garbled OCR text from behind redaction bars in an Epstein archive PDF. Read through OCR errors aggressively. Common errors: SURMA=STARMER, PAMLY=FAMILY, WITHOW=WITHOUT, IIAD=HAD, ADOOT=ABOUT, COIM=DONE, RACY=BACK, LONDE=LONDON, TORCHED=TORTURED, INE=ONE, VOLTI=YOU, KIST=JUST, PALASEINIANS=PALESTINIANS, OIYERMENT=GOVERNMENT, PUCIIASE=PURCHASE, CONVLISMION=CONVERSATION, SFIIING=SETTING, NETENYAHU=NETANYAHU, ZYLENSKI=ZELENSKYY\n\nRULES:\n- Extract the FULL body text of every unique email in this section\n- Fix OCR errors where meaning is clear from context\n- Mark genuinely redacted/blacked-out content as [Redacted]\n- Strip HTML tags, base64, MIME headers, CSS, image filenames\n- Format: On [Date], [Sender] wrote:\\n[full body]\\n---\n- If the section only contains repeated quoted text from already-extracted emails, return just: DUPLICATE\n- Be thorough - extract every readable sentence, do not summarize or truncate'
      },
      {
        role: 'user',
        content: (prevContext
          ? 'Emails already extracted (do NOT repeat these):\n' + prevContext + '\n\nExtract NEW emails from pages ' + (pageStart + 1) + '-' + pageEnd + ':\n\n'
          : 'Extract emails from pages ' + (pageStart + 1) + '-' + pageEnd + ':\n\n') + section.slice(0, 80000)
      }
    ],
    temperature: 0.1,
    max_tokens: 6000
  })

  return resp.choices[0].message.content
}

async function main () {
  // Find PDF path
  let pdfPath = PDF_PATH
  if (!pdfPath) {
    pdfPath = execSync('find /data/raw -name "EFTA00143287.pdf" 2>/dev/null').toString().trim()
  }
  console.error('PDF:', pdfPath)

  // Extract per-page text
  const result = execFileSync('python3', [path.join(__dirname, 'lib', 'extract-pdf-gen.py'), 'extract', pdfPath], { maxBuffer: 50 * 1024 * 1024 })
  const parsed = JSON.parse(result.toString())
  const pages = parsed.pages
  console.error('Pages:', pages.length)

  // Process in overlapping windows
  const windows = [
    [0, 4], [3, 7], [6, 11], [10, 15], [14, 20],
    [19, 26], [25, 33], [32, 42], [40, 52], [50, 62],
    [60, 74], [72, 86], [84, 98], [96, 110], [108, 118]
  ]

  const allEmails = []
  const prevLines = []

  for (const [start, end] of windows) {
    const actualEnd = Math.min(end, pages.length)
    console.error('Processing pages ' + (start + 1) + '-' + actualEnd + '...')

    const context = prevLines.slice(-15).join('\n')
    const extracted = await extractEmailFromPages(pages, start, actualEnd, context)

    if (extracted && !extracted.includes('DUPLICATE') && extracted.trim().length > 50) {
      allEmails.push(extracted.trim())
      const lines = extracted.split('\n').filter(l => l.length > 30)
      for (const l of lines.slice(0, 5)) {
        prevLines.push(l.slice(0, 100))
      }
      console.error('  Got ' + extracted.length + ' chars')
    } else {
      console.error('  Duplicate or empty')
    }

    await sleep(800)
  }

  console.error('\nExtracted sections: ' + allEmails.length)

  // Final consolidation
  const combined = allEmails.join('\n\n---\n\n')
  console.error('Consolidation pass (' + combined.length + ' chars)...')

  const resp = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'Produce the FINAL definitive reconstruction of the EFTA00143287 email thread. Below are email sections extracted from different parts of the 118-page PDF.\n\nRULES:\n- Deduplicate: each unique email appears EXACTLY once\n- Keep the FULL body text of each email - every sentence, every accusation, every name\n- Fix remaining OCR errors where meaning is clear\n- Reverse chronological order (Jan 6 2025 newest, back through Dec 2024 and earlier)\n- Format: On [Date], [Sender] wrote:\\n[full body]\\n---\n- Mark genuinely redacted content as [Redacted]\n- Key people: Keir Starmer, Cyril Ramaphosa, Putin, Xi, Trump, Elon Musk, David Boies, Alan Dershowitz, Jamie Dimon, Leslie Benzies, Rockstar North, Georgia Meloni, Zelenskyy, Jeff Bezos, Ghislaine Maxwell, Bill Ackman, Larry Fink, Judge Rakoff, Blinken, Sergey Brin\n- Do NOT end with repeated [Redacted] tags\n- Do NOT truncate or summarize - include full email bodies'
      },
      {
        role: 'user',
        content: 'Produce the final thread with FULL email bodies. Include every unique email:\n\n' + combined.slice(0, 120000)
      }
    ],
    temperature: 0.1,
    max_tokens: 16000
  })

  let output = resp.choices[0].message.content

  // Trim any [Redacted] spam at end
  const spamIdx = output.indexOf('[Redacted] [Redacted] [Redacted]')
  if (spamIdx > -1) output = output.slice(0, spamIdx).trim()

  const header = 'Reconstructed & Cleaned Email Thread \u2014 EFTA00143287\nNote: This document contains a deeply nested email chain spanning over 100 pages.\nHTML tags, redundant quote blocks, base64 image strings, and tracking URLs have been stripped.\nThe unique messages are presented below in reverse chronological order (newest to oldest).\nReconstruction performed by GPT-4o from garbled OCR text extracted from behind redaction bars.\n\n---\n\n'

  const final = header + output
  const emailCount = (final.match(/\nOn /g) || []).length
  console.error('Final: ' + final.length + ' chars, ' + emailCount + ' emails')

  // Update DB
  const db = new DocumentsDatabase(DB_PATH)
  const extracted = db.db.prepare("SELECT id, file_path FROM documents WHERE title = ? LIMIT 1").get('Extracted: EFTA00143287.pdf')
  if (extracted) {
    fs.writeFileSync(extracted.file_path, final)
    db.db.prepare('UPDATE documents SET extracted_text = ? WHERE id = ?').run(final, extracted.id)
    console.error('Updated ' + extracted.id)
  }

  console.log(final)
}

main().catch(e => { console.error(e.message); process.exit(1) })
