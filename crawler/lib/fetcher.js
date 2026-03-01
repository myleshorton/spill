const nodeFetch = require('node-fetch')
const robotsParser = require('robots-parser')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { URL } = require('url')

const USER_AGENT = 'UnredactBot/1.0 (+https://unredact.org/bot)'

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

    const allowed = await this.checkRobots(url)
    if (!allowed) {
      return { url, error: 'robots.txt disallowed', skipped: true }
    }

    const isLikelyFile = /\.(pdf|doc|docx|xls|xlsx|csv|txt|eml|msg|zip|tar|tar\.gz|tgz|mp4|webm|mov|avi|mkv|wmv|mpg|mpeg|m4v|flv)$/i.test(url)
    const timeout = isLikelyFile ? this.timeoutFile : this.timeoutHtml

    try {
      const resp = await nodeFetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/pdf,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
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

      // Save to cache
      const domain = new URL(finalUrl).hostname
      const hash = crypto.createHash('sha256').update(finalUrl).digest('hex').slice(0, 16)
      const ext = this._guessExtension(contentType, finalUrl)
      const domainDir = path.join(this.cacheDir, domain)
      if (!fs.existsSync(domainDir)) fs.mkdirSync(domainDir, { recursive: true })

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
      return {
        url,
        error: err.message,
        skipped: false,
      }
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
