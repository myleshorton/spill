const fs = require('fs')
const cheerio = require('cheerio')
const { URL } = require('url')

class GovernmentAdapter {
  constructor (crawlDb, seeds) {
    this.crawlDb = crawlDb
    this.name = 'government'
    this.keywords = (seeds?.keywords?.primary || []).map(k => k.toLowerCase())
  }

  async discover (seeds) {
    const seedUrls = seeds.filter(s => s.adapter === 'government')
    let added = 0

    for (const seed of seedUrls) {
      added += this.crawlDb.addUrl(seed.url, {
        priority: seed.priority || 1.0,
        source: 'government',
        depth: 0,
      }) ? 1 : 0
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

      if (url.includes('vault.fbi.gov')) {
        return this._extractFbiVaultLinks($, url)
      }

      if (url.includes('justice.gov/epstein')) {
        return this._extractDojEpsteinLibrary($, url)
      }

      if (url.includes('justice.gov')) {
        return this._extractDojLinks($, url)
      }

      if (url.includes('oversight.house.gov')) {
        return this._extractOversightLinks($, url)
      }

      if (url.includes('muckrock.com')) {
        return this._extractMuckrockLinks($, url)
      }

      if (url.includes('sec.gov')) {
        return this._extractSecLinks($, url)
      }

      // Generic government page link extraction
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href')
        if (!href) return

        let absoluteUrl
        try {
          absoluteUrl = new URL(href, url).toString()
        } catch {
          return
        }

        if (!absoluteUrl.startsWith('http')) return

        // Prioritize PDF downloads from .gov sites
        const isPdf = absoluteUrl.endsWith('.pdf') || href.includes('.pdf')
        const text = $(el).text().toLowerCase()
        const relevanceKeywords = this.keywords.length > 0
          ? [...this.keywords, 'foia', 'release', 'document', 'report']
          : ['foia', 'release', 'document', 'report']
        const isRelevant = relevanceKeywords.some(kw => text.includes(kw))

        if (isPdf || isRelevant) {
          links.push({
            url: absoluteUrl,
            priority: isPdf ? 0.9 : 0.7,
            source: 'government',
          })
        }
      })
    } catch {}

    return links.slice(0, 100)
  }

  _extractFbiVaultLinks ($, baseUrl) {
    const links = []

    // FBI Vault uses a specific structure for FOIA releases
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href')
      if (!href) return

      try {
        const absoluteUrl = new URL(href, baseUrl).toString()

        // PDF documents from the vault
        if (absoluteUrl.endsWith('.pdf')) {
          links.push({
            url: absoluteUrl,
            priority: 0.95,
            source: 'government',
          })
        }

        // Sub-pages within the vault entry
        if (absoluteUrl.includes('vault.fbi.gov') && !absoluteUrl.includes('#')) {
          const text = $(el).text().toLowerCase()
          if (text.includes('part') || text.includes('page') || text.includes('document')) {
            links.push({
              url: absoluteUrl,
              priority: 0.9,
              source: 'government',
            })
          }
        }
      } catch {}
    })

    return links.slice(0, 100)
  }

  _extractDojLinks ($, baseUrl) {
    const links = []

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href')
      if (!href) return

      try {
        const absoluteUrl = new URL(href, baseUrl).toString()

        if (absoluteUrl.endsWith('.pdf')) {
          links.push({
            url: absoluteUrl,
            priority: 0.95,
            source: 'government',
          })
        }

        // Press releases, court documents
        const text = $(el).text().toLowerCase()
        if (absoluteUrl.includes('justice.gov') &&
            (text.includes('press release') || text.includes('court') || text.includes('filing') || text.includes('indictment'))) {
          links.push({
            url: absoluteUrl,
            priority: 0.85,
            source: 'government',
          })
        }
      } catch {}
    })

    return links.slice(0, 100)
  }

  _extractDojEpsteinLibrary ($, baseUrl) {
    const links = []

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href')
      if (!href) return

      try {
        const absoluteUrl = new URL(href, baseUrl).toString()

        // Direct PDF files from the Epstein library
        if (absoluteUrl.endsWith('.pdf')) {
          links.push({
            url: absoluteUrl,
            priority: 0.95,
            source: 'government',
          })
        }

        // Data set index pages
        if (absoluteUrl.includes('/epstein/') && (absoluteUrl.includes('data-set') || absoluteUrl.includes('court-records'))) {
          links.push({
            url: absoluteUrl,
            priority: 0.9,
            source: 'government',
          })
        }

        // Individual file links (EFTA pattern)
        if (absoluteUrl.includes('/epstein/files/')) {
          links.push({
            url: absoluteUrl,
            priority: 0.95,
            source: 'government',
          })
        }
      } catch {}
    })

    return links.slice(0, 500)
  }

  _extractOversightLinks ($, baseUrl) {
    const links = []

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href')
      if (!href) return

      try {
        const absoluteUrl = new URL(href, baseUrl).toString()

        // PDF links
        if (absoluteUrl.endsWith('.pdf')) {
          links.push({
            url: absoluteUrl,
            priority: 0.95,
            source: 'government',
          })
        }

        // Related release pages
        const text = $(el).text().toLowerCase()
        if (absoluteUrl.includes('oversight.house.gov') && (text.includes('epstein') || text.includes('release'))) {
          links.push({
            url: absoluteUrl,
            priority: 0.85,
            source: 'government',
          })
        }
      } catch {}
    })

    return links.slice(0, 100)
  }

  _extractMuckrockLinks ($, baseUrl) {
    const links = []

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href')
      if (!href) return

      try {
        const absoluteUrl = new URL(href, baseUrl).toString()

        // Direct file downloads from MuckRock/DocumentCloud
        if (absoluteUrl.endsWith('.pdf') || absoluteUrl.includes('documentcloud.org')) {
          links.push({
            url: absoluteUrl,
            priority: 0.9,
            source: 'government',
          })
        }

        // Individual FOIA request pages
        if (absoluteUrl.includes('muckrock.com/foi/') && !absoluteUrl.includes('/list/')) {
          links.push({
            url: absoluteUrl,
            priority: 0.85,
            source: 'government',
          })
        }
      } catch {}
    })

    return links.slice(0, 100)
  }

  _extractSecLinks ($, baseUrl) {
    const links = []

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href')
      if (!href) return

      try {
        const absoluteUrl = new URL(href, baseUrl).toString()

        // SEC EDGAR filings
        if (absoluteUrl.includes('sec.gov/Archives') || absoluteUrl.endsWith('.htm') || absoluteUrl.endsWith('.txt')) {
          links.push({
            url: absoluteUrl,
            priority: 0.7,
            source: 'government',
          })
        }
      } catch {}
    })

    return links.slice(0, 50)
  }
}

module.exports = GovernmentAdapter
