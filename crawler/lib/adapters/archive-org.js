const fetch = require('node-fetch')
const fs = require('fs')
const cheerio = require('cheerio')
const { URL } = require('url')

const SEARCH_API = 'https://archive.org/advancedsearch.php'
const CDX_API = 'https://web.archive.org/cdx/search/cdx'
const USER_AGENT = 'UnredactBot/1.0 (+https://unredact.org/bot)'

class ArchiveOrgAdapter {
  constructor (crawlDb, seeds) {
    this.crawlDb = crawlDb
    this.name = 'archive-org'
    this.searchQueries = seeds?.searchQueries || []
    this.keywords = [
      ...(seeds?.keywords?.primary || []),
      ...(seeds?.keywords?.secondary || []),
    ]
  }

  async discover (seeds) {
    const seedUrls = seeds.filter(s => s.adapter === 'archive-org')
    let added = 0

    for (const seed of seedUrls) {
      added += this.crawlDb.addUrl(seed.url, {
        priority: seed.priority || 0.9,
        source: 'archive-org',
        depth: 0,
      }) ? 1 : 0
    }

    // Search archive.org using seeds-provided search queries, or keywords
    const queries = this.searchQueries.length > 0
      ? this.searchQueries.slice(0, 6)
      : this.keywords.slice(0, 4).map(k => k + ' documents')

    for (const query of queries) {
      try {
        const items = await this._searchItems(query)
        for (const item of items) {
          const url = `https://archive.org/details/${item.identifier}`
          added += this.crawlDb.addUrl(url, {
            priority: 0.8,
            source: 'archive-org',
            depth: 0,
          }) ? 1 : 0
        }
        await sleep(3000) // Be polite to archive.org
      } catch (err) {
        console.warn('[archive-org] Search error for "%s": %s', query, err.message)
      }
    }

    // Use Wayback CDX API to find archived versions of key pages
    // (Only for seeds that specify importantUrls — other sites skip this)
    const importantUrls = []

    for (const targetUrl of importantUrls) {
      try {
        const snapshots = await this._cdxSearch(targetUrl)
        for (const snap of snapshots.slice(0, 10)) {
          const waybackUrl = `https://web.archive.org/web/${snap.timestamp}/${snap.original}`
          added += this.crawlDb.addUrl(waybackUrl, {
            priority: 0.7,
            source: 'archive-org',
            depth: 0,
          }) ? 1 : 0
        }
        await sleep(2000)
      } catch (err) {
        console.warn('[archive-org] CDX error for %s: %s', targetUrl, err.message)
      }
    }

    return added
  }

  async extractLinks (fetchResult, urlRow) {
    if (!(fetchResult.contentType || '').includes('html')) return []
    if (!fetchResult.filePath || !fs.existsSync(fetchResult.filePath)) return []

    const url = fetchResult.finalUrl || urlRow.url
    const links = []

    try {
      const html = fs.readFileSync(fetchResult.filePath, 'utf8')
      const $ = cheerio.load(html)

      // On archive.org detail pages, try metadata API first, fall back to HTML scraping
      if (url.includes('archive.org/details/')) {
        const identifier = url.match(/archive\.org\/details\/([^/?#]+)/)?.[1]
        let usedApi = false

        if (identifier) {
          try {
            const metaFiles = await this._fetchMetadata(identifier)
            if (metaFiles.length > 0) {
              usedApi = true
              for (const file of metaFiles) {
                links.push({
                  url: `https://archive.org/download/${identifier}/${encodeURIComponent(file.name)}`,
                  priority: 0.85,
                  source: 'archive-org',
                })
              }
            }
          } catch (err) {
            console.warn('[archive-org] Metadata API failed for %s, falling back to HTML: %s', identifier, err.message)
          }
        }

        if (!usedApi) {
          $('a[href*="/download/"]').each((_, el) => {
            const href = $(el).attr('href')
            if (!href) return
            if (/\.(pdf|txt|doc|docx|csv|xls|xlsx|zip|tar|tar\.gz|tgz|mp4|webm|mov|avi|mkv|wmv|mpg|mpeg)$/i.test(href)) {
              try {
                links.push({
                  url: new URL(href, url).toString(),
                  priority: 0.85,
                  source: 'archive-org',
                })
              } catch {}
            }
          })
        }
      }

      // On search result pages, find item links
      if (url.includes('archive.org/search') || url.includes('archive.org/advancedsearch')) {
        $('a[href*="/details/"]').each((_, el) => {
          const href = $(el).attr('href')
          if (!href) return
          try {
            links.push({
              url: new URL(href, url).toString(),
              priority: 0.7,
              source: 'archive-org',
            })
          } catch {}
        })
      }

      // Wayback Machine pages — extract original content links
      if (url.includes('web.archive.org/web/')) {
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href')
          if (!href) return
          const text = $(el).text().toLowerCase()
          const waybackKeywords = this.keywords.length > 0
            ? [...this.keywords.map(k => k.toLowerCase()), 'document', 'report', 'filing']
            : ['document', 'report', 'filing']
          const isRelevant = waybackKeywords.some(kw => text.includes(kw) || href.toLowerCase().includes(kw))
          const isFile = /\.(pdf|mp4|webm|mov|avi|doc|docx|txt)$/i.test(href)
          if (isRelevant && isFile) {
            try {
              links.push({
                url: new URL(href, url).toString(),
                priority: 0.8,
                source: 'archive-org',
              })
            } catch {}
          }
        })
      }
    } catch {}

    return links.slice(0, 100)
  }

  async _fetchMetadata (identifier) {
    const DOCUMENT_PATTERN = /\.(pdf|txt|doc|docx|csv|xls|xlsx)$/i
    const VIDEO_PATTERN = /\.(mp4|webm|mov|avi|mkv|wmv|mpg|mpeg|m4v)$/i
    const ARCHIVE_PATTERN = /\.(zip|tar\.gz|tgz|tar)$/i
    const MAX_ARCHIVE_SIZE = 2 * 1024 * 1024 * 1024 // 2GB
    const MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024 // 2GB

    const resp = await fetch(`https://archive.org/metadata/${identifier}`, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 30000,
    })
    if (!resp.ok) return []
    const data = await resp.json()
    const files = data.files || []

    const results = []
    for (const file of files) {
      const name = file.name || ''
      const size = parseInt(file.size || '0', 10)
      if (DOCUMENT_PATTERN.test(name)) {
        results.push({ name, size })
      } else if (VIDEO_PATTERN.test(name) && size <= MAX_VIDEO_SIZE) {
        results.push({ name, size })
      } else if (ARCHIVE_PATTERN.test(name) && size <= MAX_ARCHIVE_SIZE) {
        results.push({ name, size })
      }
    }
    return results
  }

  async _searchItems (query) {
    try {
      const params = new URLSearchParams({
        q: query,
        fl: 'identifier,title,mediatype',
        rows: '50',
        output: 'json',
      })
      const resp = await fetch(`${SEARCH_API}?${params}`, {
        headers: { 'User-Agent': USER_AGENT },
        timeout: 30000,
      })
      if (!resp.ok) return []
      const data = await resp.json()
      return data.response?.docs || []
    } catch {
      return []
    }
  }

  async _cdxSearch (url) {
    try {
      const params = new URLSearchParams({
        url,
        output: 'json',
        limit: '20',
        fl: 'timestamp,original,statuscode,mimetype',
        filter: 'statuscode:200',
      })
      const resp = await fetch(`${CDX_API}?${params}`, {
        headers: { 'User-Agent': USER_AGENT },
        timeout: 30000,
      })
      if (!resp.ok) return []
      const rows = await resp.json()
      // First row is header
      if (rows.length < 2) return []
      const headers = rows[0]
      return rows.slice(1).map(row => {
        const obj = {}
        headers.forEach((h, i) => { obj[h] = row[i] })
        return obj
      })
    } catch {
      return []
    }
  }
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = ArchiveOrgAdapter
