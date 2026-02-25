const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

class UsersDatabase {
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
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        created_at INTEGER,
        last_seen_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS view_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        viewed_at INTEGER NOT NULL,
        UNIQUE(user_id, document_id)
      );

      CREATE TABLE IF NOT EXISTS magic_links (
        token TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        used INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_views_user ON view_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_views_doc ON view_history(document_id);
      CREATE INDEX IF NOT EXISTS idx_views_time ON view_history(viewed_at);
    `)
  }

  ensureUser (userId) {
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO users (id, created_at, last_seen_at) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET last_seen_at = ?
    `).run(userId, now, now, now)
  }

  recordView (userId, docId) {
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO view_history (user_id, document_id, viewed_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id, document_id) DO UPDATE SET viewed_at = ?
    `).run(userId, docId, now, now)
  }

  getViewedDocIds (userId, limit = 50) {
    return this.db.prepare(`
      SELECT document_id FROM view_history
      WHERE user_id = ?
      ORDER BY viewed_at DESC
      LIMIT ?
    `).all(userId, limit).map(r => r.document_id)
  }

  getUserByEmail (email) {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  }

  linkEmail (userId, email) {
    this.db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, userId)
  }

  createMagicLink (email, userId) {
    const token = crypto.randomBytes(32).toString('hex')
    const now = Date.now()
    const expiresAt = now + 15 * 60 * 1000
    this.db.prepare(`
      INSERT INTO magic_links (token, email, user_id, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(token, email, userId, now, expiresAt)
    return { token, expiresAt }
  }

  consumeMagicLink (token) {
    const link = this.db.prepare('SELECT * FROM magic_links WHERE token = ? AND used = 0').get(token)
    if (!link) return null
    if (Date.now() > link.expires_at) return null
    this.db.prepare('UPDATE magic_links SET used = 1 WHERE token = ?').run(token)
    return link
  }

  close () {
    this.db.close()
  }
}

module.exports = UsersDatabase
