const WEIGHTS = {
  keywordDensity: 0.30,
  entityCooccurrence: 0.25,
  sourceAuthority: 0.20,
  documentType: 0.15,
  linkContext: 0.10,
}

const HIGH_AUTHORITY_DOMAINS = new Set([
  'justice.gov', 'www.justice.gov',
  'fbi.gov', 'vault.fbi.gov',
  'uscourts.gov',
  'courtlistener.com', 'www.courtlistener.com',
  'sec.gov', 'www.sec.gov',
  'archive.org', 'web.archive.org',
  'congress.gov', 'www.congress.gov',
  'gao.gov', 'www.gao.gov',
  'pacer.gov', 'ecf.pacer.gov',
])

const MEDIUM_AUTHORITY_DOMAINS = new Set([
  'nytimes.com', 'www.nytimes.com',
  'washingtonpost.com', 'www.washingtonpost.com',
  'theguardian.com', 'www.theguardian.com',
  'miamiherald.com', 'www.miamiherald.com',
  'bbc.com', 'www.bbc.com', 'bbc.co.uk', 'www.bbc.co.uk',
  'reuters.com', 'www.reuters.com',
  'apnews.com', 'www.apnews.com',
  'thedailybeast.com', 'www.thedailybeast.com',
  'propublica.org', 'www.propublica.org',
  'documentcloud.org', 'www.documentcloud.org',
])

const DOCUMENT_TYPE_SCORES = {
  court_filing: 0.95,
  opinion: 0.90,
  indictment: 0.95,
  order: 0.85,
  motion: 0.80,
  government_report: 0.90,
  foia_release: 0.95,
  news_article: 0.60,
  web_page: 0.30,
  social_media: 0.20,
}

class RelevanceScorer {
  constructor (seeds) {
    this.primaryKeywords = (seeds.keywords?.primary || []).map(k => k.toLowerCase())
    this.secondaryKeywords = (seeds.keywords?.secondary || []).map(k => k.toLowerCase())
    this.contextualKeywords = (seeds.keywords?.contextual || []).map(k => k.toLowerCase())
    this.entities = (seeds.entities || []).map(e => e.toLowerCase())
  }

  score (text, url, meta = {}) {
    const lowerText = (text || '').toLowerCase()
    const textLen = lowerText.length || 1

    const kw = this._scoreKeywords(lowerText, textLen)
    const ent = this._scoreEntities(lowerText)
    const auth = this._scoreAuthority(url)
    const docType = this._scoreDocumentType(meta.documentType || meta.contentType)
    const link = this._scoreLinkContext(meta.anchorText, meta.surroundingText)

    const weighted =
      kw * WEIGHTS.keywordDensity +
      ent * WEIGHTS.entityCooccurrence +
      auth * WEIGHTS.sourceAuthority +
      docType * WEIGHTS.documentType +
      link * WEIGHTS.linkContext

    return Math.min(1.0, Math.max(0.0, weighted))
  }

  _scoreKeywords (text, textLen) {
    let score = 0
    const window = Math.min(textLen, 50000)
    const sample = text.slice(0, window)

    // Primary keywords carry the most weight
    for (const kw of this.primaryKeywords) {
      const count = this._countOccurrences(sample, kw)
      if (count > 0) score += Math.min(count * 0.15, 0.6)
    }

    // Secondary keywords
    for (const kw of this.secondaryKeywords) {
      const count = this._countOccurrences(sample, kw)
      if (count > 0) score += Math.min(count * 0.08, 0.3)
    }

    // Contextual keywords (lower weight, need co-occurrence with primary)
    let hasContext = false
    for (const kw of this.contextualKeywords) {
      if (sample.includes(kw)) {
        hasContext = true
        break
      }
    }
    if (hasContext && score > 0) score += 0.1

    return Math.min(1.0, score)
  }

  _scoreEntities (text) {
    let found = 0
    for (const entity of this.entities) {
      if (text.includes(entity)) found++
    }
    if (found === 0) return 0
    if (found === 1) return 0.3
    if (found === 2) return 0.5
    if (found <= 4) return 0.7
    return Math.min(1.0, 0.7 + found * 0.03)
  }

  _scoreAuthority (url) {
    try {
      const hostname = new URL(url).hostname
      if (HIGH_AUTHORITY_DOMAINS.has(hostname)) return 1.0
      // Check parent domain
      const parts = hostname.split('.')
      if (parts.length > 2) {
        const parent = parts.slice(-2).join('.')
        if (HIGH_AUTHORITY_DOMAINS.has(parent)) return 1.0
      }
      if (MEDIUM_AUTHORITY_DOMAINS.has(hostname)) return 0.7
      if (parts.length > 2) {
        const parent = parts.slice(-2).join('.')
        if (MEDIUM_AUTHORITY_DOMAINS.has(parent)) return 0.7
      }
      // .gov and .edu domains get a baseline bump
      if (hostname.endsWith('.gov') || hostname.endsWith('.edu')) return 0.6
      return 0.2
    } catch {
      return 0.1
    }
  }

  _scoreDocumentType (docType) {
    if (!docType) return 0.3
    return DOCUMENT_TYPE_SCORES[docType] || 0.3
  }

  _scoreLinkContext (anchorText, surroundingText) {
    if (!anchorText && !surroundingText) return 0.5

    const combined = ((anchorText || '') + ' ' + (surroundingText || '')).toLowerCase()
    let score = 0

    for (const kw of this.primaryKeywords) {
      if (combined.includes(kw)) { score += 0.3; break }
    }
    for (const kw of this.secondaryKeywords) {
      if (combined.includes(kw)) { score += 0.2; break }
    }
    for (const entity of this.entities) {
      if (combined.includes(entity)) { score += 0.2; break }
    }

    return Math.min(1.0, score || 0.1)
  }

  _countOccurrences (text, term) {
    let count = 0
    let pos = 0
    while ((pos = text.indexOf(term, pos)) !== -1) {
      count++
      pos += term.length
    }
    return count
  }
}

module.exports = RelevanceScorer
