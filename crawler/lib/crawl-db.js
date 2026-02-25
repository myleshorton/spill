const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')
const { URL } = require('url')

class CrawlDatabase {
  constructor (dbPath) {
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this._init()
  }

  _init () {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS urls (
        id INTEGER PRIMARY KEY,
        url TEXT UNIQUE NOT NULL,
        normalized_url TEXT NOT NULL,
        domain TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        priority REAL DEFAULT 0.5,
        depth INTEGER DEFAULT 0,
        source TEXT,
        parent_url TEXT,
        content_type TEXT,
        http_status INTEGER,
        relevance_score REAL,
        error TEXT,
        fetched_at INTEGER,
        processed_at INTEGER,
        created_at INTEGER DEFAULT (strftime('%s','now'))
      );

      CREATE TABLE IF NOT EXISTS domains (
        domain TEXT PRIMARY KEY,
        last_fetched_at INTEGER DEFAULT 0,
        min_delay_ms INTEGER DEFAULT 2000,
        robots_txt TEXT,
        robots_fetched_at INTEGER,
        total_fetched INTEGER DEFAULT 0,
        total_relevant INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_urls_status_priority ON urls(status, priority DESC);
      CREATE INDEX IF NOT EXISTS idx_urls_domain ON urls(domain);
      CREATE INDEX IF NOT EXISTS idx_urls_normalized ON urls(normalized_url);
    `)
  }

  static normalizeUrl (urlStr) {
    try {
      const u = new URL(urlStr)
      // Strip fragment, trailing slash, sort query params
      u.hash = ''
      const params = new URLSearchParams(u.searchParams)
      params.sort()
      u.search = params.toString() ? '?' + params.toString() : ''
      let normalized = u.toString()
      if (normalized.endsWith('/') && u.pathname !== '/') {
        normalized = normalized.slice(0, -1)
      }
      return normalized.toLowerCase()
    } catch {
      return urlStr.toLowerCase()
    }
  }

  static extractDomain (urlStr) {
    try {
      return new URL(urlStr).hostname
    } catch {
      return 'unknown'
    }
  }

  addUrl (url, opts = {}) {
    const normalized = CrawlDatabase.normalizeUrl(url)
    const domain = CrawlDatabase.extractDomain(url)

    const existing = this.db.prepare('SELECT id FROM urls WHERE normalized_url = ?').get(normalized)
    if (existing) return existing.id

    const result = this.db.prepare(`
      INSERT INTO urls (url, normalized_url, domain, priority, depth, source, parent_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      url,
      normalized,
      domain,
      opts.priority || 0.5,
      opts.depth || 0,
      opts.source || null,
      opts.parentUrl || null
    )

    // Ensure domain row exists
    this.db.prepare(`
      INSERT OR IGNORE INTO domains (domain) VALUES (?)
    `).run(domain)

    return result.lastInsertRowid
  }

  addUrlBatch (urls) {
    const insert = this.db.transaction((items) => {
      let added = 0
      for (const item of items) {
        const url = typeof item === 'string' ? item : item.url
        const opts = typeof item === 'string' ? {} : item
        const normalized = CrawlDatabase.normalizeUrl(url)
        const existing = this.db.prepare('SELECT id FROM urls WHERE normalized_url = ?').get(normalized)
        if (!existing) {
          const domain = CrawlDatabase.extractDomain(url)
          this.db.prepare(`
            INSERT INTO urls (url, normalized_url, domain, priority, depth, source, parent_url)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(url, normalized, domain, opts.priority || 0.5, opts.depth || 0, opts.source || null, opts.parentUrl || null)
          this.db.prepare('INSERT OR IGNORE INTO domains (domain) VALUES (?)').run(domain)
          added++
        }
      }
      return added
    })
    return insert(urls)
  }

  nextBatch (limit = 10) {
    return this.db.prepare(`
      SELECT u.*, d.last_fetched_at AS domain_last_fetched, d.min_delay_ms
      FROM urls u
      JOIN domains d ON u.domain = d.domain
      WHERE u.status = 'pending'
      ORDER BY u.priority DESC, u.created_at ASC
      LIMIT ?
    `).all(limit)
  }

  markFetching (id) {
    this.db.prepare("UPDATE urls SET status = 'fetching' WHERE id = ?").run(id)
  }

  markFetched (id, meta = {}) {
    this.db.prepare(`
      UPDATE urls SET
        status = ?,
        content_type = ?,
        http_status = ?,
        error = ?,
        fetched_at = ?
      WHERE id = ?
    `).run(
      meta.status || 'fetched',
      meta.contentType || null,
      meta.httpStatus || null,
      meta.error || null,
      Math.floor(Date.now() / 1000),
      id
    )

    if (meta.domain) {
      this.db.prepare(`
        UPDATE domains SET
          last_fetched_at = ?,
          total_fetched = total_fetched + 1
        WHERE domain = ?
      `).run(Math.floor(Date.now() / 1000), meta.domain)
    }
  }

  markProcessed (id, relevanceScore) {
    this.db.prepare(`
      UPDATE urls SET
        status = 'processed',
        relevance_score = ?,
        processed_at = ?
      WHERE id = ?
    `).run(relevanceScore, Math.floor(Date.now() / 1000), id)
  }

  markFailed (id, error) {
    this.db.prepare(`
      UPDATE urls SET status = 'failed', error = ? WHERE id = ?
    `).run(error, id)
  }

  markSkipped (id, reason) {
    this.db.prepare(`
      UPDATE urls SET status = 'skipped', error = ? WHERE id = ?
    `).run(reason, id)
  }

  getDomain (domain) {
    return this.db.prepare('SELECT * FROM domains WHERE domain = ?').get(domain)
  }

  updateDomain (domain, data) {
    const fields = []
    const values = []
    for (const [key, val] of Object.entries(data)) {
      fields.push(`${key} = ?`)
      values.push(val)
    }
    values.push(domain)
    this.db.prepare(`UPDATE domains SET ${fields.join(', ')} WHERE domain = ?`).run(...values)
  }

  bumpDomainRelevance (domain) {
    this.db.prepare('UPDATE domains SET total_relevant = total_relevant + 1 WHERE domain = ?').run(domain)
  }

  stats () {
    const byStatus = this.db.prepare(
      "SELECT status, COUNT(*) as count FROM urls GROUP BY status"
    ).all()

    const bySource = this.db.prepare(
      "SELECT source, COUNT(*) as count FROM urls WHERE source IS NOT NULL GROUP BY source"
    ).all()

    const topDomains = this.db.prepare(`
      SELECT domain, total_fetched, total_relevant
      FROM domains
      WHERE total_fetched > 0
      ORDER BY total_relevant DESC
      LIMIT 20
    `).all()

    const total = this.db.prepare('SELECT COUNT(*) as count FROM urls').get()
    const avgRelevance = this.db.prepare(
      'SELECT AVG(relevance_score) as avg FROM urls WHERE relevance_score IS NOT NULL'
    ).get()

    return {
      totalUrls: total.count,
      byStatus: Object.fromEntries(byStatus.map(r => [r.status, r.count])),
      bySource: Object.fromEntries(bySource.map(r => [r.source, r.count])),
      topDomains,
      averageRelevance: avgRelevance.avg ? avgRelevance.avg.toFixed(3) : 'N/A'
    }
  }

  reset () {
    this.db.exec("DELETE FROM urls")
    this.db.exec("UPDATE domains SET total_fetched = 0, total_relevant = 0, last_fetched_at = 0")
  }

  close () {
    this.db.close()
  }
}

module.exports = CrawlDatabase
