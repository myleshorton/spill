const fs = require('fs')
const cheerio = require('cheerio')
const { URL } = require('url')

const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|avi|mkv|wmv|mpg|mpeg|m4v|flv)$/i

// Wikimedia Commons serves the original at /commons/X/XX/File.webm and then
// 5-6 transcoded lower-res copies at /commons/transcoded/X/XX/File.webm/File.webm.RESp.codec.
// We only want the original.
const WIKIMEDIA_TRANSCODED_RE = /upload\.wikimedia\.org\/wikipedia\/commons\/transcoded\//

class GenericAdapter {
  constructor (crawlDb, scorer, seeds) {
    this.crawlDb = crawlDb
    this.scorer = scorer
    this.name = 'generic'
    // Build keyword list from seeds (primary + secondary), falling back to empty
    this.keywords = [
      ...(seeds?.keywords?.primary || []),
      ...(seeds?.keywords?.secondary || []),
    ].map(k => k.toLowerCase())
  }

  async extractLinks (fetchResult, urlRow) {
    if (!(fetchResult.contentType || '').includes('html')) return []
    if (!fetchResult.filePath || !fs.existsSync(fetchResult.filePath)) return []

    try {
      const html = fs.readFileSync(fetchResult.filePath, 'utf8')
      const $ = cheerio.load(html)
      const baseUrl = fetchResult.finalUrl || urlRow.url
      const links = []

      // Extract <a href> links with relevance check
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href')
        if (!href) return

        let absoluteUrl
        try {
          absoluteUrl = new URL(href, baseUrl).toString()
        } catch {
          return
        }

        // Only follow http(s) links
        if (!absoluteUrl.startsWith('http')) return

        // Always queue direct video file links (skip Wikimedia transcoded variants)
        if (VIDEO_EXTENSIONS.test(absoluteUrl)) {
          if (!WIKIMEDIA_TRANSCODED_RE.test(absoluteUrl)) {
            links.push({
              url: absoluteUrl,
              priority: 0.8,
              source: 'generic',
              anchorText: $(el).text().trim(),
            })
          }
          return
        }

        // Quick relevance check on anchor text
        const anchorText = $(el).text().trim().toLowerCase()
        const surrounding = $(el).parent().text().trim().toLowerCase().slice(0, 200)

        const quickScore = this._quickRelevanceCheck(anchorText, surrounding)
        if (quickScore > 0) {
          links.push({
            url: absoluteUrl,
            priority: Math.min(0.7, quickScore),
            source: 'generic',
            anchorText,
          })
        }
      })

      // Extract video source URLs from <video> and <source> elements
      $('video source[src], video[src]').each((_, el) => {
        const src = $(el).attr('src')
        if (!src) return
        try {
          const absoluteUrl = new URL(src, baseUrl).toString()
          if (absoluteUrl.startsWith('http') && !WIKIMEDIA_TRANSCODED_RE.test(absoluteUrl)) {
            links.push({
              url: absoluteUrl,
              priority: 0.9,
              source: 'generic',
              anchorText: 'video-source',
            })
          }
        } catch {}
      })

      return links.slice(0, 50) // Cap discovered links per page
    } catch {
      return []
    }
  }

  _quickRelevanceCheck (anchorText, surrounding) {
    const combined = anchorText + ' ' + surrounding
    let score = 0
    for (const kw of this.keywords) {
      if (combined.includes(kw)) score += 0.15
    }
    return Math.min(1.0, score)
  }
}

module.exports = GenericAdapter
