/**
 * Text extraction from various document types.
 * Uses pdf-parse for PDF text layers, with Tesseract OCR fallback for scans.
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

let pdfParse
try {
  pdfParse = require('pdf-parse')
} catch {
  pdfParse = null
}

async function extractText (filePath) {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.pdf') return extractPdfText(filePath)
  if (ext === '.txt' || ext === '.rtf') return extractPlainText(filePath)
  if (ext === '.eml') return extractPlainText(filePath)
  if (ext === '.csv') return extractPlainText(filePath)

  return ''
}

async function extractPdfText (filePath) {
  if (!pdfParse) {
    console.warn('[text] pdf-parse not available, trying OCR directly')
    return ocrPdf(filePath)
  }

  try {
    const buffer = fs.readFileSync(filePath)
    const data = await pdfParse(buffer, { max: 500 })

    // If text layer has very little content, it's likely a scanned document
    const charCount = (data.text || '').replace(/\s/g, '').length
    const pagesWithText = charCount / Math.max(data.numpages, 1)

    if (pagesWithText < 50) {
      console.log('[text] Sparse text layer (%d chars/%d pages), trying OCR: %s',
        charCount, data.numpages, path.basename(filePath))
      const ocrText = ocrPdf(filePath)
      if (ocrText.length > charCount) return ocrText
    }

    return data.text || ''
  } catch (err) {
    console.error('[text] PDF parse failed for %s: %s', path.basename(filePath), err.message)
    return ocrPdf(filePath)
  }
}

function ocrPdf (filePath) {
  try {
    execFileSync('which', ['tesseract'], { stdio: 'pipe' })
  } catch {
    console.warn('[text] Tesseract not installed, skipping OCR for', path.basename(filePath))
    return ''
  }

  try {
    // 200 DPI grayscale rendering + parallel Tesseract across pages
    const result = execFileSync('bash', ['-c', `
      tmpdir=$(mktemp -d)
      trap "rm -rf $tmpdir" EXIT
      pdftoppm -r 200 -l 20 "${filePath}" "$tmpdir/page" -gray 2>/dev/null
      ls "$tmpdir"/page-*.pgm 2>/dev/null | sort | \
        xargs -P 4 -I {} sh -c 'tesseract "$1" "\${1%.pgm}" --oem 1 --psm 6 -l eng 2>/dev/null' _ {}
      for f in $(ls "$tmpdir"/page-*.txt 2>/dev/null | sort); do cat "$f"; done
    `], {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 120000
    })
    return result.toString().trim()
  } catch (err) {
    console.error('[text] OCR failed for %s: %s', path.basename(filePath), err.message)
    return ''
  }
}

function extractPlainText (filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8')
    return text.slice(0, 500000)
  } catch {
    return ''
  }
}

function getPageCount (filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext !== '.pdf') return null

  if (pdfParse) {
    try {
      const buffer = fs.readFileSync(filePath)
      // Quick page count from PDF header without full parse
      const str = buffer.toString('latin1', 0, Math.min(buffer.length, 1024 * 1024))
      const match = str.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/)
      if (match) return parseInt(match[1])
    } catch {
      // fallback
    }
  }

  try {
    const result = execFileSync('pdfinfo', [filePath], { timeout: 10000, stdio: 'pipe' })
    const match = result.toString().match(/Pages:\s+(\d+)/)
    if (match) return parseInt(match[1])
  } catch {
    // pdfinfo not available
  }

  return null
}

module.exports = { extractText, getPageCount }
