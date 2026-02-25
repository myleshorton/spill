const fetch = require('node-fetch')
const cheerio = require('cheerio')

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const SEARCH_DELAY_MS = 60000 // 1 query per minute

class SearchDiscoveryAdapter {
  constructor (crawlDb, seeds) {
    this.crawlDb = crawlDb
    this.name = 'search-discovery'
    this.queries = seeds.searchQueries || []
    this.queryIndex = 0
    this.lastQueryAt = 0
  }

  async discover () {
    if (this.queries.length === 0) return 0

    const now = Date.now()
    if (now - this.lastQueryAt < SEARCH_DELAY_MS) return 0

    const query = this.queries[this.queryIndex % this.queries.length]
    this.queryIndex++
    this.lastQueryAt = now

    console.log('[search-discovery] Searching: "%s"', query)

    let added = 0
    try {
      const urls = await this._searchDuckDuckGo(query)
      for (const url of urls) {
        const id = this.crawlDb.addUrl(url, {
          priority: 0.5,
          source: 'search-discovery',
          depth: 0,
        })
        if (id) added++
      }
      console.log('[search-discovery] Found %d new URLs for "%s"', added, query)
    } catch (err) {
      console.warn('[search-discovery] Search error: %s', err.message)
    }

    return added
  }

  async extractLinks () {
    // Search results are already processed during discover()
    return []
  }

  async _searchDuckDuckGo (query) {
    try {
      const params = new URLSearchParams({ q: query })
      const resp = await fetch(`https://html.duckduckgo.com/html/?${params}`, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html',
        },
        timeout: 30000,
        redirect: 'follow',
      })

      if (!resp.ok) return []

      const html = await resp.text()
      const $ = cheerio.load(html)
      const urls = []

      $('a.result__a[href]').each((_, el) => {
        const href = $(el).attr('href')
        if (!href) return

        // DuckDuckGo HTML results have redirect URLs
        try {
          const parsed = new URL(href, 'https://duckduckgo.com')
          const udParam = parsed.searchParams.get('uddg')
          if (udParam) {
            urls.push(udParam)
          } else if (href.startsWith('http')) {
            urls.push(href)
          }
        } catch {}
      })

      // Also check for direct links
      $('a.result__url[href]').each((_, el) => {
        const href = $(el).attr('href')
        if (href && href.startsWith('http')) {
          urls.push(href)
        }
      })

      return [...new Set(urls)].slice(0, 20)
    } catch {
      return []
    }
  }
}

module.exports = SearchDiscoveryAdapter
