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
        used INTEGER DEFAULT 0,
        return_to TEXT
      );

      CREATE TABLE IF NOT EXISTS favorites (
        user_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        created_at INTEGER,
        PRIMARY KEY (user_id, document_id)
      );

      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER,
        updated_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_views_user ON view_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_views_doc ON view_history(document_id);
      CREATE INDEX IF NOT EXISTS idx_views_time ON view_history(viewed_at);
      CREATE INDEX IF NOT EXISTS idx_fav_doc ON favorites(document_id);
      CREATE INDEX IF NOT EXISTS idx_comments_doc ON comments(document_id);
      CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);

      CREATE TABLE IF NOT EXISTS votes (
        user_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        value INTEGER NOT NULL,
        created_at INTEGER,
        PRIMARY KEY (user_id, document_id)
      );
      CREATE INDEX IF NOT EXISTS idx_votes_doc ON votes(document_id);
    `)

    // Migrate: add return_to column to magic_links if missing
    const mlCols = this.db.prepare('PRAGMA table_info(magic_links)').all().map(c => c.name)
    if (!mlCols.includes('return_to')) {
      this.db.prepare('ALTER TABLE magic_links ADD COLUMN return_to TEXT').run()
    }
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

  createMagicLink (email, userId, returnTo) {
    const token = crypto.randomBytes(32).toString('hex')
    const now = Date.now()
    const expiresAt = now + 15 * 60 * 1000
    this.db.prepare(`
      INSERT INTO magic_links (token, email, user_id, created_at, expires_at, return_to)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(token, email, userId, now, expiresAt, returnTo || null)
    return { token, expiresAt }
  }

  consumeMagicLink (token) {
    const link = this.db.prepare('SELECT * FROM magic_links WHERE token = ? AND used = 0').get(token)
    if (!link) return null
    if (Date.now() > link.expires_at) return null
    this.db.prepare('UPDATE magic_links SET used = 1 WHERE token = ?').run(token)
    return link
  }

  toggleFavorite (userId, docId) {
    const existing = this.db.prepare(
      'SELECT 1 FROM favorites WHERE user_id = ? AND document_id = ?'
    ).get(userId, docId)
    if (existing) {
      this.db.prepare('DELETE FROM favorites WHERE user_id = ? AND document_id = ?').run(userId, docId)
    } else {
      this.db.prepare(
        'INSERT INTO favorites (user_id, document_id, created_at) VALUES (?, ?, ?)'
      ).run(userId, docId, Date.now())
    }
    const starred = !existing
    const count = this.getFavoriteCount(docId)
    return { starred, count }
  }

  isFavorited (userId, docId) {
    return !!this.db.prepare(
      'SELECT 1 FROM favorites WHERE user_id = ? AND document_id = ?'
    ).get(userId, docId)
  }

  getFavoriteCount (docId) {
    const row = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM favorites WHERE document_id = ?'
    ).get(docId)
    return row.cnt
  }

  getUserFavorites (userId, limit = 50, offset = 0) {
    return this.db.prepare(
      'SELECT document_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(userId, limit, offset).map(r => r.document_id)
  }

  addComment (docId, userId, displayName, body) {
    const now = Date.now()
    const info = this.db.prepare(
      'INSERT INTO comments (document_id, user_id, display_name, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(docId, userId, displayName, body, now, null)
    return this.db.prepare('SELECT * FROM comments WHERE id = ?').get(info.lastInsertRowid)
  }

  getComments (docId, limit = 50, offset = 0) {
    const comments = this.db.prepare(
      'SELECT * FROM comments WHERE document_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(docId, limit, offset)
    const total = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM comments WHERE document_id = ?'
    ).get(docId).cnt
    return { comments, total }
  }

  updateComment (commentId, userId, body) {
    const comment = this.db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId)
    if (!comment) return null
    if (comment.user_id !== userId) return null
    this.db.prepare('UPDATE comments SET body = ?, updated_at = ? WHERE id = ?').run(body, Date.now(), commentId)
    return this.db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId)
  }

  deleteComment (commentId, userId) {
    const comment = this.db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId)
    if (!comment) return false
    if (comment.user_id !== userId) return false
    this.db.prepare('DELETE FROM comments WHERE id = ?').run(commentId)
    return true
  }

  getCommentCount (docId) {
    const row = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM comments WHERE document_id = ?'
    ).get(docId)
    return row.cnt
  }

  vote (userId, docId, value) {
    // value: 1 (upvote), -1 (downvote), 0 (remove vote)
    if (value === 0) {
      this.db.prepare('DELETE FROM votes WHERE user_id = ? AND document_id = ?').run(userId, docId)
    } else {
      this.db.prepare(`
        INSERT INTO votes (user_id, document_id, value, created_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, document_id) DO UPDATE SET value = ?, created_at = ?
      `).run(userId, docId, value, Date.now(), value, Date.now())
    }
    return this.getVoteStatus(userId, docId)
  }

  getVoteStatus (userId, docId) {
    const row = this.db.prepare('SELECT value FROM votes WHERE user_id = ? AND document_id = ?').get(userId, docId)
    const ups = this.db.prepare('SELECT COUNT(*) as cnt FROM votes WHERE document_id = ? AND value = 1').get(docId).cnt
    const downs = this.db.prepare('SELECT COUNT(*) as cnt FROM votes WHERE document_id = ? AND value = -1').get(docId).cnt
    return {
      userVote: row ? row.value : 0,
      upvotes: ups,
      downvotes: downs,
      score: ups - downs,
    }
  }

  close () {
    this.db.close()
  }
}

module.exports = UsersDatabase
