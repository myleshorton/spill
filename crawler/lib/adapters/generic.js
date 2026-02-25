const fs = require('fs')
const cheerio = require('cheerio')
const { URL } = require('url')

class GenericAdapter {
  constructor (crawlDb, scorer) {
    this.crawlDb = crawlDb
    this.scorer = scorer
    this.name = 'generic'
  }

  async extractLinks (fetchResult, urlRow) {
    if (!(fetchResult.contentType || '').includes('html')) return []
    if (!fetchResult.filePath || !fs.existsSync(fetchResult.filePath)) return []

    try {
      const html = fs.readFileSync(fetchResult.filePath, 'utf8')
      const $ = cheerio.load(html)
      const baseUrl = fetchResult.finalUrl || urlRow.url
      const links = []

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

      return links.slice(0, 50) // Cap discovered links per page
    } catch {
      return []
    }
  }

  _quickRelevanceCheck (anchorText, surrounding) {
    const combined = anchorText + ' ' + surrounding
    const keywords = ['epstein', 'maxwell', 'giuffre', 'trafficking', 'court', 'filing', 'document', 'deposition', 'indictment']
    let score = 0
    for (const kw of keywords) {
      if (combined.includes(kw)) score += 0.15
    }
    return Math.min(1.0, score)
  }
}

module.exports = GenericAdapter
