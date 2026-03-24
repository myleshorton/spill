const nodeFetch = require('node-fetch')
const robotsParser = require('robots-parser')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { URL } = require('url')

const USER_AGENT = 'UnredactBot/1.0 (+https://unredact.org/bot)'
const WICK_PROXY = process.env.WICK_PROXY_URL || 'http://172.19.0.1:9876'

const ARCHIVE_FILE_PATTERN = /\.(zip|tar|tar\.gz|tgz|gz)$/i
const ARCHIVE_ORG_DOMAINS = /^(.*\.)?archive\.org$/i

const EXCLUDE_PATTERNS = [
  /\/login/i, /\/signup/i, /\/register/i, /\/account/i,
  /\/cart/i, /\/checkout/i, /\/subscribe/i,
  /\/ads\//i, /\/tracking\//i, /\/analytics\//i,
  /\.css$/i, /\.js$/i, /\.woff/i, /\.svg$/i,
  /\/wp-admin/i, /\/wp-login/i,
  /\.(rar|exe|dmg|iso|apk)$/i,
  /facebook\.com\/sharer/i, /twitter\.com\/intent/i,
  /mailto:/i, /javascript:/i, /tel:/i,
]

class Fetcher {
  constructor (crawlDb, options = {}) {
    this.crawlDb = crawlDb
    this.cacheDir = options.cacheDir || path.join(process.cwd(), 'data', 'crawl-cache')
    this.maxRedirects = options.maxRedirects || 5
    this.timeoutHtml = options.timeoutHtml || 30000
    this.timeoutFile = options.timeoutFile || 120000
    this.robotsCache = new Map()
  }

  shouldExclude (url) {
    if (EXCLUDE_PATTERNS.some(pattern => pattern.test(url))) return true
    // Block archive files except from archive.org
    if (ARCHIVE_FILE_PATTERN.test(url)) {
      try {
        const hostname = new URL(url).hostname
        return !ARCHIVE_ORG_DOMAINS.test(hostname)
      } catch {
        return true
      }
    }
    return false
  }

  async checkRobots (url) {
    const parsed = new URL(url)
    const domain = parsed.hostname
    const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`

    // Check in-memory cache
    if (this.robotsCache.has(domain)) {
      const cached = this.robotsCache.get(domain)
      if (Date.now() - cached.fetchedAt < 24 * 60 * 60 * 1000) {
        return cached.parser ? cached.parser.isAllowed(url, USER_AGENT) : true
      }
    }

    // Check DB cache
    const domainRow = this.crawlDb.getDomain(domain)
    if (domainRow && domainRow.robots_txt && domainRow.robots_fetched_at) {
      const age = Math.floor(Date.now() / 1000) - domainRow.robots_fetched_at
      if (age < 86400) {
        const parser = robotsParser(robotsUrl, domainRow.robots_txt)
        this.robotsCache.set(domain, { parser, fetchedAt: Date.now() })
        return parser.isAllowed(url, USER_AGENT)
      }
    }

    // Fetch fresh robots.txt
    try {
      const resp = await nodeFetch(robotsUrl, {
        headers: { 'User-Agent': USER_AGENT },
        timeout: 10000,
        redirect: 'follow',
      })

      let robotsTxt = ''
      if (resp.ok) {
        robotsTxt = await resp.text()
      }

      const parser = robotsParser(robotsUrl, robotsTxt)
      this.robotsCache.set(domain, { parser, fetchedAt: Date.now() })

      // Update DB
      this.crawlDb.db.prepare(`
        INSERT INTO domains (domain, robots_txt, robots_fetched_at)
        VALUES (?, ?, ?)
        ON CONFLICT(domain) DO UPDATE SET robots_txt = ?, robots_fetched_at = ?
      `).run(domain, robotsTxt, Math.floor(Date.now() / 1000), robotsTxt, Math.floor(Date.now() / 1000))

      const crawlDelay = parser.getCrawlDelay(USER_AGENT)
      if (crawlDelay) {
        const delayMs = Math.max(crawlDelay * 1000, 2000)
        this.crawlDb.updateDomain(domain, { min_delay_ms: delayMs })
      }

      return parser.isAllowed(url, USER_AGENT)
    } catch (err) {
      // If robots.txt is unreachable, assume allowed
      this.robotsCache.set(domain, { parser: null, fetchedAt: Date.now() })
      return true
    }
  }

  async fetch (url) {
    if (this.shouldExclude(url)) {
      return { url, error: 'excluded', skipped: true }
    }

    // Skip robots.txt check — wick uses --no-robots
    const decodedUrl = decodeURIComponent(url)
    const isLikelyFile = /\.(pdf|doc|docx|xls|xlsx|csv|txt|eml|msg|zip|tar|tar\.gz|tgz|mp4|webm|mov|avi|mkv|wmv|mpg|mpeg|m4v|flv)(\?|$)/i.test(decodedUrl)

    // Sites that require browser-like access even for files (age gates, bot detection)
    const WICK_REQUIRED_DOMAINS = /justice\.gov|reddit\.com|nytimes\.com|washingtonpost\.com/i
    const domain = new URL(url).hostname
    const needsWick = WICK_REQUIRED_DOMAINS.test(domain)

    // Save to cache
    const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 16)
    const domainDir = path.join(this.cacheDir, domain)
    if (!fs.existsSync(domainDir)) fs.mkdirSync(domainDir, { recursive: true })

    // For binary files on sites that don't need wick, use node-fetch directly
    if (isLikelyFile && !needsWick) {
      return this._fetchBinary(url, domain, hash, domainDir)
    }

    // Use wick proxy for HTML pages
    try {
      const wickUrl = `${WICK_PROXY}/fetch?url=${encodeURIComponent(url)}&format=html`
      const resp = await nodeFetch(wickUrl, { timeout: 60000 })

      if (!resp.ok) {
        const body = await resp.text()
        let errMsg = `wick proxy error: ${resp.status}`
        try { errMsg = JSON.parse(body).error || errMsg } catch {}
        return { url, error: errMsg, skipped: false }
      }

      const html = await resp.text()
      const filePath = path.join(domainDir, `${hash}.html`)
      fs.writeFileSync(filePath, html)

      return {
        url,
        finalUrl: url,
        status: 200,
        contentType: 'text/html',
        filePath,
        headers: {},
        size: Buffer.byteLength(html),
      }
    } catch (err) {
      return { url, error: `wick: ${err.message}`, skipped: false }
    }
  }

  async _fetchBinary (url, domain, hash, domainDir) {
    const timeout = this.timeoutFile
    try {
      const headers = {
        'User-Agent': USER_AGENT,
        'Accept': '*/*',
      }

      try {
        const hostname = new URL(url).hostname
        if (hostname === 'www.courtlistener.com' && process.env.COURTLISTENER_TOKEN) {
          headers.Authorization = `Token ${process.env.COURTLISTENER_TOKEN}`
        }
      } catch {}

      const resp = await nodeFetch(url, {
        headers,
        timeout,
        redirect: 'follow',
        follow: this.maxRedirects,
      })

      const contentType = resp.headers.get('content-type') || ''
      const finalUrl = resp.url

      if (!resp.ok) {
        return {
          url,
          finalUrl,
          status: resp.status,
          contentType,
          error: `HTTP ${resp.status}`,
          skipped: resp.status === 404 || resp.status === 410,
        }
      }

      const ext = this._guessExtension(contentType, finalUrl)
      const filePath = path.join(domainDir, `${hash}${ext}`)
      const buffer = await resp.buffer()
      fs.writeFileSync(filePath, buffer)

      return {
        url,
        finalUrl,
        status: resp.status,
        contentType,
        filePath,
        headers: {
          contentLength: resp.headers.get('content-length'),
          lastModified: resp.headers.get('last-modified'),
        },
        size: buffer.length,
      }
    } catch (err) {
      return { url, error: err.message, skipped: false }
    }
  }

  _guessExtension (contentType, url) {
    if (contentType.includes('pdf')) return '.pdf'
    if (contentType.includes('html')) return '.html'
    if (contentType.includes('json')) return '.json'
    if (contentType.includes('plain')) return '.txt'
    if (contentType.includes('image/jpeg')) return '.jpg'
    if (contentType.includes('image/png')) return '.png'
    if (contentType.includes('application/zip')) return '.zip'
    if (contentType.includes('application/gzip') || contentType.includes('application/x-gzip')) return '.gz'
    if (contentType.includes('application/x-tar')) return '.tar'
    if (contentType.includes('video/mp4')) return '.mp4'
    if (contentType.includes('video/webm')) return '.webm'
    if (contentType.includes('video/quicktime')) return '.mov'
    if (contentType.includes('video/x-msvideo') || contentType.includes('video/avi')) return '.avi'
    if (contentType.includes('video/x-matroska')) return '.mkv'
    if (contentType.includes('video/x-ms-wmv')) return '.wmv'
    if (contentType.includes('video/mpeg')) return '.mpg'
    if (contentType.includes('video/x-flv')) return '.flv'
    if (contentType.includes('video/')) return '.mp4'

    // Fallback to URL extension
    try {
      const pathname = new URL(url).pathname
      const ext = path.extname(pathname)
      if (ext && ext.length <= 5) return ext
    } catch {}

    return '.html'
  }
}

module.exports = Fetcher
