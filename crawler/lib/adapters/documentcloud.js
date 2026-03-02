const fetch = require('node-fetch')
const fs = require('fs')
const cheerio = require('cheerio')
const { URL } = require('url')

const API_BASE = 'https://api.www.documentcloud.org/api'
const USER_AGENT = 'UnredactBot/1.0 (+https://unredact.org/bot)'

class DocumentCloudAdapter {
  constructor (crawlDb, seeds) {
    this.crawlDb = crawlDb
    this.name = 'documentcloud'
    this.keywords = [
      ...(seeds?.keywords?.primary || []),
      ...(seeds?.keywords?.secondary || []),
    ].map(k => k.toLowerCase())
  }

  async discover (seeds) {
    const seedUrls = seeds.filter(s => s.adapter === 'documentcloud')
    let added = 0

    for (const seed of seedUrls) {
      added += this.crawlDb.addUrl(seed.url, {
        priority: seed.priority || 0.9,
        source: 'documentcloud',
        depth: 0,
      }) ? 1 : 0
    }

    // Search DocumentCloud API for documents matching seed keywords
    const queries = this.keywords.slice(0, 6)
    if (queries.length === 0) return added

    for (const query of queries) {
      try {
        const docs = await this._searchDocuments(query)
        for (const doc of docs) {
          if (doc.canonical_url) {
            added += this.crawlDb.addUrl(doc.canonical_url, {
              priority: 0.9,
              source: 'documentcloud',
              depth: 0,
            }) ? 1 : 0
          }
        }
        await sleep(2000)
      } catch (err) {
        console.warn('[documentcloud] Search error for "%s": %s', query, err.message)
      }
    }

    return added
  }

  async extractLinks (fetchResult, urlRow) {
    const url = fetchResult.finalUrl || urlRow.url
    const links = []

    // For DocumentCloud document pages, extract the PDF download link
    const docMatch = url.match(/documentcloud\.org\/documents\/(\d+)-([^/]+)/)
    if (docMatch) {
      const docId = docMatch[1]
      const slug = docMatch[2].replace(/\/$/, '')

      // Direct PDF link
      links.push({
        url: `https://www.documentcloud.org/documents/${docId}-${slug}.pdf`,
        priority: 0.95,
        source: 'documentcloud',
      })

      // Also try the full text
      links.push({
        url: `https://www.documentcloud.org/documents/${docId}-${slug}.txt`,
        priority: 0.8,
        source: 'documentcloud',
      })

      return links
    }

    // For project pages, extract document links
    if (url.includes('/projects/')) {
      return this._extractProjectLinks(fetchResult, urlRow)
    }

    // For HTML pages, find links to other DocumentCloud documents
    if (!(fetchResult.contentType || '').includes('html')) return []
    if (!fetchResult.filePath || !fs.existsSync(fetchResult.filePath)) return []

    try {
      const html = fs.readFileSync(fetchResult.filePath, 'utf8')
      const $ = cheerio.load(html)

      $('a[href*="documentcloud.org/documents/"]').each((_, el) => {
        const href = $(el).attr('href')
        if (!href) return
        try {
          links.push({
            url: new URL(href, url).toString(),
            priority: 0.85,
            source: 'documentcloud',
          })
        } catch {}
      })
    } catch {}

    return links.slice(0, 100)
  }

  async _extractProjectLinks (fetchResult, urlRow) {
    if (!fetchResult.filePath || !fs.existsSync(fetchResult.filePath)) return []

    const links = []
    try {
      const html = fs.readFileSync(fetchResult.filePath, 'utf8')
      const $ = cheerio.load(html)

      $('a[href*="/documents/"]').each((_, el) => {
        const href = $(el).attr('href')
        if (!href || !href.includes('documentcloud.org')) return
        try {
          links.push({
            url: new URL(href, fetchResult.finalUrl || urlRow.url).toString(),
            priority: 0.9,
            source: 'documentcloud',
          })
        } catch {}
      })
    } catch {}

    return links.slice(0, 200)
  }

  async _searchDocuments (query) {
    try {
      const params = new URLSearchParams({
        q: query,
        per_page: '100',
        format: 'json',
      })
      const resp = await fetch(`${API_BASE}/documents/search/?${params}`, {
        headers: { 'User-Agent': USER_AGENT },
        timeout: 30000,
      })
      if (!resp.ok) return []
      const data = await resp.json()
      return data.results || []
    } catch {
      return []
    }
  }
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = DocumentCloudAdapter
