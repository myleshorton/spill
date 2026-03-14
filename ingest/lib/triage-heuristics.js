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
