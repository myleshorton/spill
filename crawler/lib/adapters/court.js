const fetch = require('node-fetch')
const fs = require('fs')
const cheerio = require('cheerio')
const { URL } = require('url')

const CL_API = 'https://www.courtlistener.com/api/rest/v4'
const CL_STORAGE = 'https://storage.courtlistener.com'
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
    this.apiToken = process.env.COURTLISTENER_TOKEN || null
  }

  _headers () {
    const h = { 'User-Agent': USER_AGENT }
    if (this.apiToken) {
      h.Authorization = `Token ${this.apiToken}`
    }
    return h
  }

  async discover (seeds) {
    const seedUrls = seeds.filter(s => s.adapter === 'court')
    let added = 0

    // Extract docket IDs from seed URLs and fetch entries via API
    const docketIds = []
    for (const seed of seedUrls) {
      const match = seed.url.match(/courtlistener\.com\/docket\/(\d+)\//)
      if (match) {
        docketIds.push({ id: match[1], url: seed.url, priority: seed.priority || 1.0 })
      } else {
        // Non-CourtListener court URLs — add directly
        added += this.crawlDb.addUrl(seed.url, {
          priority: seed.priority || 1.0,
          source: 'court',
          depth: 0,
        }) ? 1 : 0
      }
    }

    // Fetch RECAP documents for each docket via API
    if (docketIds.length > 0) {
      console.log('[court] Fetching RECAP documents for %d dockets via API...', docketIds.length)
      for (const docket of docketIds) {
        try {
          const docs = await this._fetchDocketDocuments(docket.id)
          console.log('[court] Docket %s: found %d RECAP documents', docket.id, docs.length)
          for (const doc of docs) {
            const result = this.crawlDb.addUrl(doc.url, {
              priority: doc.priority || docket.priority * 0.95,
              source: 'court',
              depth: 0,
            })
            if (result) added++
          }
          await sleep(1000) // Rate limit: be polite to the API
        } catch (err) {
          console.warn('[court] Error fetching docket %s: %s', docket.id, err.message)
        }
      }
    }

    // Also search API for keyword-matching dockets
    try {
      const searches = this.keywords.slice(0, 6)
      for (const query of searches) {
        const dockets = await this._searchDockets(query)
        for (const docket of dockets) {
          if (docket.absolute_url) {
            // Extract docket ID and fetch its documents too
            const match = docket.absolute_url.match(/\/docket\/(\d+)\//)
            if (match && !docketIds.some(d => d.id === match[1])) {
              try {
                const docs = await this._fetchDocketDocuments(match[1])
                for (const doc of docs) {
                  const result = this.crawlDb.addUrl(doc.url, {
                    priority: 0.85,
                    source: 'court',
                    depth: 0,
                  })
                  if (result) added++
                }
                await sleep(1000)
              } catch {}
            }
          }
        }
        await sleep(2000)
      }
    } catch (err) {
      console.warn('[court] API search error: %s', err.message)
    }

    return added
  }

  async extractLinks (fetchResult, urlRow) {
    const url = fetchResult.finalUrl || urlRow.url
    const links = []

    // If this is a CourtListener page (unlikely now with API approach, but keep as fallback)
    if (url.includes('courtlistener.com') && !url.includes('storage.courtlistener.com')) {
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

  // --- API methods ---

  async _fetchDocketDocuments (docketId) {
    // Use search API to find available RECAP documents for this docket.
    // The docket-entries and recap-documents endpoints require premium access,
    // but the search API works with a free token.
    const documents = []
    let cursor = null
    let pages = 0

    while (pages < 20) { // Safety limit
      let url = `${CL_API}/search/?type=r&docket_id=${docketId}&order_by=entry_date_filed+asc&page_size=20`
      if (cursor) url = cursor

      const resp = await fetch(url, {
        headers: this._headers(),
        timeout: 30000,
      })

      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          console.warn('[court] Search API auth failed for docket %s (status %d)', docketId, resp.status)
        }
        break
      }

      const data = await resp.json()

      for (const result of (data.results || [])) {
        // Each search result has recap_documents embedded
        const recapDocs = result.recap_documents || []
        for (const doc of recapDocs) {
          if (doc.filepath_local && doc.is_available) {
            documents.push({
              url: `${CL_STORAGE}/${doc.filepath_local}`,
              priority: 0.95,
              description: doc.short_description || result.caseName || '',
              pageCount: doc.page_count,
            })
          }
        }
      }

      cursor = data.next || null
      pages++
      if (!cursor) break
      await sleep(500) // Rate limit pagination
    }

    return documents
  }

  async _extractCourtListenerLinks (fetchResult, urlRow) {
    if (!fetchResult.filePath || !fs.existsSync(fetchResult.filePath)) return []

    const links = []
    try {
      const html = fs.readFileSync(fetchResult.filePath, 'utf8')
      const $ = cheerio.load(html)
      const baseUrl = fetchResult.finalUrl || urlRow.url

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
        headers: this._headers(),
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
