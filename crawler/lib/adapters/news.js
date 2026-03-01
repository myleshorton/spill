const fs = require('fs')
const cheerio = require('cheerio')
const { URL } = require('url')

const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|avi|mkv|wmv|mpg|mpeg|m4v|flv)$/i

class NewsAdapter {
  constructor (crawlDb, seeds) {
    this.crawlDb = crawlDb
    this.name = 'news'
    // Build keyword list from seeds, falling back to empty
    this.keywords = [
      ...(seeds?.keywords?.primary || []),
      ...(seeds?.keywords?.secondary || []),
      ...(seeds?.entities || []),
    ].map(k => k.toLowerCase())
  }

  async discover (seeds) {
    const seedUrls = seeds.filter(s => s.adapter === 'news')
    let added = 0

    for (const seed of seedUrls) {
      added += this.crawlDb.addUrl(seed.url, {
        priority: seed.priority || 0.8,
        source: 'news',
        depth: 0,
      }) ? 1 : 0
    }

    return added
  }

  async extractLinks (fetchResult, urlRow) {
    if (!(fetchResult.contentType || '').includes('html')) return []
    if (!fetchResult.filePath || !fs.existsSync(fetchResult.filePath)) return []

    const links = []
    try {
      const html = fs.readFileSync(fetchResult.filePath, 'utf8')
      const $ = cheerio.load(html)
      const baseUrl = fetchResult.finalUrl || urlRow.url

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

        // Always queue direct video file links
        if (VIDEO_EXTENSIONS.test(absoluteUrl)) {
          links.push({
            url: absoluteUrl,
            priority: 0.8,
            source: 'news',
          })
          return
        }

        const anchorText = $(el).text().trim().toLowerCase()
        const isRelevant = this._isRelevantLink(anchorText, absoluteUrl)

        if (isRelevant) {
          links.push({
            url: absoluteUrl,
            priority: 0.6,
            source: 'news',
          })
        }
      })

      // Extract video source URLs from <video> and <source> elements
      $('video source[src], video[src]').each((_, el) => {
        const src = $(el).attr('src')
        if (!src) return
        try {
          const absoluteUrl = new URL(src, baseUrl).toString()
          if (absoluteUrl.startsWith('http')) {
            links.push({
              url: absoluteUrl,
              priority: 0.9,
              source: 'news',
            })
          }
        } catch {}
      })
    } catch {}

    return links.slice(0, 30)
  }

  extractArticle (filePath) {
    try {
      const html = fs.readFileSync(filePath, 'utf8')
      const $ = cheerio.load(html)

      // Remove noise
      $('script, style, nav, header, footer, aside, .ad, .advertisement, .sidebar, .related-articles, .comments, .social-share').remove()

      // Extract structured metadata
      const title = $('meta[property="og:title"]').attr('content') ||
                    $('h1.headline, h1.article-title, h1').first().text().trim() ||
                    $('title').text().trim()

      const author = $('meta[name="author"]').attr('content') ||
                     $('[rel="author"]').first().text().trim() ||
                     $('meta[property="article:author"]').attr('content') || ''

      const publishedDate = $('meta[property="article:published_time"]').attr('content') ||
                           $('time[datetime]').first().attr('datetime') || ''

      // JSON-LD metadata
      let jsonLd = {}
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const data = JSON.parse($(el).html())
          if (data['@type'] === 'NewsArticle' || data['@type'] === 'Article') {
            jsonLd = data
          }
        } catch {}
      })

      // Extract article body
      const selectors = [
        'article .article-body',
        'article .story-body',
        '.article-content',
        '.story-content',
        '.entry-content',
        '.post-content',
        'article',
        '[role="main"]',
        'main',
      ]

      let body = ''
      for (const sel of selectors) {
        const el = $(sel)
        if (el.length && el.text().trim().length > 200) {
          body = el.text().replace(/\s+/g, ' ').trim()
          break
        }
      }

      if (!body) {
        body = $('body').text().replace(/\s+/g, ' ').trim()
      }

      return {
        title: title || jsonLd.headline || '',
        author: author || jsonLd.author?.name || '',
        publishedDate: publishedDate || jsonLd.datePublished || '',
        body,
        description: $('meta[name="description"]').attr('content') || jsonLd.description || '',
      }
    } catch {
      return { title: '', author: '', publishedDate: '', body: '', description: '' }
    }
  }

  _isRelevantLink (anchorText, url) {
    const combined = (anchorText + ' ' + url).toLowerCase()
    return this.keywords.some(kw => combined.includes(kw))
  }
}

module.exports = NewsAdapter
