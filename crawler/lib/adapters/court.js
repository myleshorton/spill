const fetch = require('node-fetch')
const fs = require('fs')
const cheerio = require('cheerio')
const { URL } = require('url')

const CL_API = 'https://www.courtlistener.com/api/rest/v4'
const USER_AGENT = 'UnredactBot/1.0 (+https://unredact.org/bot)'

class CourtAdapter {
  constructor (crawlDb, seeds) {
    this.crawlDb = crawlDb
    this.name = 'court'
    this.keywords = [
      ...(seeds?.keywords?.primary || []),
      ...(seeds?.keywords?.secondary || []),
    ].map(k => k.toLowerCase())
    this.entities = (seeds?.entities || []).map(e => e.toLowerCase())
  }

  async discover (seeds) {
    const seedUrls = seeds.filter(s => s.adapter === 'court')
    let added = 0

    for (const seed of seedUrls) {
      added += this.crawlDb.addUrl(seed.url, {
        priority: seed.priority || 1.0,
        source: 'court',
        depth: 0,
      }) ? 1 : 0
    }

    // Search CourtListener API for dockets matching seed keywords
    try {
      const searches = this.keywords.slice(0, 6)
      if (searches.length === 0) return added

      for (const query of searches) {
        const dockets = await this._searchDockets(query)
        for (const docket of dockets) {
          if (docket.absolute_url) {
            const url = `https://www.courtlistener.com${docket.absolute_url}`
            added += this.crawlDb.addUrl(url, {
              priority: 0.9,
              source: 'court',
              depth: 0,
            }) ? 1 : 0
          }
        }
        await sleep(2000) // Rate limit API calls
      }
    } catch (err) {
      console.warn('[court] API search error: %s', err.message)
    }

    return added
  }

  async extractLinks (fetchResult, urlRow) {
    const url = fetchResult.finalUrl || urlRow.url
    const links = []

    // If this is a CourtListener docket page, extract document links
    if (url.includes('courtlistener.com')) {
      return this._extractCourtListenerLinks(fetchResult, urlRow)
    }

    // For other court sites, use generic HTML link extraction
    if (!(fetchResult.contentType || '').includes('html')) return []
    if (!fetchResult.filePath || !fs.existsSync(fetchResult.filePath)) return []

    try {
      const html = fs.readFileSync(fetchResult.filePath, 'utf8')
      const $ = cheerio.load(html)
      const baseUrl = url

      $('a[href]').each((_, el) => {
        const href = $(el).attr('href')
        if (!href) return

        let absoluteUrl
        try {
          absoluteUrl = new URL(href, baseUrl).toString()
        } catch {
          return
        }

        if (!absoluteUrl.startsWith('http')) return

        // Look for PDF links and court document patterns
        const isPdf = absoluteUrl.endsWith('.pdf') || href.includes('/pdf/')
        const isCourtDoc = /docket|opinion|order|motion|filing|exhibit/i.test(href + ' ' + $(el).text())

        if (isPdf || isCourtDoc) {
          links.push({
            url: absoluteUrl,
            priority: isPdf ? 0.9 : 0.7,
            source: 'court',
          })
        }
      })
    } catch {}

    return links.slice(0, 100)
  }

  async _extractCourtListenerLinks (fetchResult, urlRow) {
    if (!fetchResult.filePath || !fs.existsSync(fetchResult.filePath)) return []

    const links = []
    try {
      const html = fs.readFileSync(fetchResult.filePath, 'utf8')
      const $ = cheerio.load(html)
      const baseUrl = fetchResult.finalUrl || urlRow.url

      // Docket entry links (PDFs from RECAP)
      $('a[href*="/recap/"], a[href*="/pdf/"], a[href$=".pdf"]').each((_, el) => {
        const href = $(el).attr('href')
        if (!href) return
        try {
          links.push({
            url: new URL(href, baseUrl).toString(),
            priority: 0.95,
            source: 'court',
          })
        } catch {}
      })

      // Opinion links
      $('a[href*="/opinion/"]').each((_, el) => {
        const href = $(el).attr('href')
        if (!href) return
        try {
          links.push({
            url: new URL(href, baseUrl).toString(),
            priority: 0.9,
            source: 'court',
          })
        } catch {}
      })

      // Related docket links
      $('a[href*="/docket/"]').each((_, el) => {
        const href = $(el).attr('href')
        if (!href) return
        const text = $(el).text().toLowerCase()
        if (this.keywords.some(kw => text.includes(kw)) || this.entities.some(e => text.includes(e))) {
          try {
            links.push({
              url: new URL(href, baseUrl).toString(),
              priority: 0.85,
              source: 'court',
            })
          } catch {}
        }
      })
    } catch {}

    return links.slice(0, 200)
  }

  async _searchDockets (query) {
    try {
      const params = new URLSearchParams({ q: query, type: 'r', order_by: 'score desc' })
      const resp = await fetch(`${CL_API}/search/?${params}`, {
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

module.exports = CourtAdapter
