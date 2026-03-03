const fetch = require('node-fetch')
const cheerio = require('cheerio')

const SEARCH_DELAY_MS = 60000 // 1 query per minute

class SearchDiscoveryAdapter {
  constructor (crawlDb, seeds) {
    this.crawlDb = crawlDb
    this.name = 'search-discovery'
    this.queries = seeds.searchQueries || []
    this.queryIndex = 0
    this.lastQueryAt = 0
    this.braveApiKey = process.env.BRAVE_SEARCH_API_KEY || null
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
      let urls = []
      if (this.braveApiKey) {
        urls = await this._searchBrave(query)
      } else {
        urls = await this._searchDuckDuckGoLite(query)
      }
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
    return []
  }

  async _searchBrave (query) {
    try {
      const params = new URLSearchParams({ q: query, count: '20' })
      const resp = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.braveApiKey,
        },
        timeout: 30000,
      })

      if (!resp.ok) {
        console.warn('[search-discovery] Brave Search returned %d', resp.status)
        return []
      }

      const data = await resp.json()
      const urls = (data.web?.results || [])
        .map(r => r.url)
        .filter(u => u && u.startsWith('http'))

      return [...new Set(urls)].slice(0, 20)
    } catch (err) {
      console.warn('[search-discovery] Brave Search error: %s', err.message)
      return []
    }
  }

  async _searchDuckDuckGoLite (query) {
    try {
      const params = new URLSearchParams({ q: query })
      const resp = await fetch(`https://lite.duckduckgo.com/lite/?${params}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': 'https://lite.duckduckgo.com/',
        },
        timeout: 30000,
        redirect: 'follow',
      })

      if (!resp.ok) {
        console.warn('[search-discovery] DuckDuckGo lite returned %d', resp.status)
        return this._searchDuckDuckGoHtml(query)
      }

      const html = await resp.text()
      const $ = cheerio.load(html)
      const urls = []

      // Lite results use table rows with links
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href')
        if (!href) return

        try {
          // DDG lite wraps results in redirect URLs
          const parsed = new URL(href, 'https://lite.duckduckgo.com')
          const udParam = parsed.searchParams.get('uddg')
          if (udParam) {
            urls.push(udParam)
          } else if (href.startsWith('http') && !href.includes('duckduckgo.com')) {
            urls.push(href)
          }
        } catch {}
      })

      if (urls.length === 0) {
        // Fallback to HTML endpoint if lite returned nothing
        return this._searchDuckDuckGoHtml(query)
      }

      return [...new Set(urls)].slice(0, 20)
    } catch (err) {
      console.warn('[search-discovery] DDG lite error: %s', err.message)
      return this._searchDuckDuckGoHtml(query)
    }
  }

  async _searchDuckDuckGoHtml (query) {
    try {
      const params = new URLSearchParams({ q: query })
      const resp = await fetch(`https://html.duckduckgo.com/html/?${params}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': 'https://duckduckgo.com/',
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
