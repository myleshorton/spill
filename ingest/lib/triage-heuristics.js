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

/**
 * Detect hidden content: PDF text layer contains substantial HTML source code
 * that isn't visible when viewing the PDF normally.
 * Returns { isHidden, htmlPct, textLen } or null if not hidden.
 */
function detectHiddenContent (doc) {
  const text = doc.extracted_text || ''
  if (text.length < 20000) return null

  const htmlMatches = text.match(/<[^>]+>/g) || []
  const htmlChars = htmlMatches.reduce((sum, t) => sum + t.length, 0)
  const htmlPct = (htmlChars / text.length) * 100

  if (htmlPct < 30) return null

  return {
    isHidden: true,
    htmlPct: Math.round(htmlPct),
    textLen: text.length
  }
}

module.exports = { triageScore, detectHiddenContent, SIGNALS }
