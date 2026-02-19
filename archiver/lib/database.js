/**
 * SQLite database with FTS5 full-text search for archived videos.
 */
const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

class ArchiveDatabase {
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
      CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        drive_key TEXT NOT NULL,
        video_key TEXT NOT NULL,
        thumb_key TEXT,
        timestamp INTEGER NOT NULL,
        peer_count INTEGER DEFAULT 0,
        archived_at INTEGER NOT NULL,
        video_path TEXT,
        thumb_path TEXT,
        is_local INTEGER DEFAULT 0,
        content_type TEXT DEFAULT 'video',
        category TEXT
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS videos_fts USING fts5(
        title, description, content=videos, content_rowid=rowid
      );

      CREATE TRIGGER IF NOT EXISTS videos_ai AFTER INSERT ON videos BEGIN
        INSERT INTO videos_fts(rowid, title, description)
        VALUES (new.rowid, new.title, new.description);
      END;

      CREATE TRIGGER IF NOT EXISTS videos_ad AFTER DELETE ON videos BEGIN
        INSERT INTO videos_fts(videos_fts, rowid, title, description)
        VALUES ('delete', old.rowid, old.title, old.description);
      END;

      CREATE TRIGGER IF NOT EXISTS videos_au AFTER UPDATE ON videos BEGIN
        INSERT INTO videos_fts(videos_fts, rowid, title, description)
        VALUES ('delete', old.rowid, old.title, old.description);
        INSERT INTO videos_fts(rowid, title, description)
        VALUES (new.rowid, new.title, new.description);
      END;
    `)

    // Add columns to existing databases
    try {
      this.db.exec('ALTER TABLE videos ADD COLUMN is_local INTEGER DEFAULT 0')
    } catch (e) {
      // Column already exists
    }
    try {
      this.db.exec("ALTER TABLE videos ADD COLUMN content_type TEXT DEFAULT 'video'")
    } catch (e) {
      // Column already exists
    }
    try {
      this.db.exec('ALTER TABLE videos ADD COLUMN category TEXT')
    } catch (e) {
      // Column already exists
    }
  }

  upsert (meta) {
    const stmt = this.db.prepare(`
      INSERT INTO videos (id, title, description, drive_key, video_key, thumb_key, timestamp, peer_count, archived_at, video_path, thumb_path, is_local, content_type, category)
      VALUES (@id, @title, @description, @drive_key, @video_key, @thumb_key, @timestamp, @peer_count, @archived_at, @video_path, @thumb_path, @is_local, @content_type, @category)
      ON CONFLICT(id) DO UPDATE SET
        title = @title,
        description = @description,
        peer_count = @peer_count,
        video_path = @video_path,
        thumb_path = @thumb_path,
        content_type = @content_type,
        category = @category
    `)
    stmt.run({
      id: meta.id,
      title: meta.title || 'Untitled',
      description: meta.description || '',
      drive_key: meta.driveKey,
      video_key: meta.fileKey || meta.videoKey,
      thumb_key: meta.thumbKey || null,
      timestamp: meta.timestamp,
      peer_count: meta.peerCount || 0,
      archived_at: Date.now(),
      video_path: meta.videoPath || null,
      thumb_path: meta.thumbPath || null,
      is_local: meta.isLocal ? 1 : 0,
      content_type: meta.contentType || 'video',
      category: meta.category || null
    })
  }

  updatePaths (id, videoPath, thumbPath) {
    this.db.prepare(`
      UPDATE videos SET video_path = ?, thumb_path = ? WHERE id = ?
    `).run(videoPath, thumbPath, id)
  }

  remove (id) {
    this.db.prepare('DELETE FROM videos WHERE id = ?').run(id)
  }

  search (query, limit = 50, offset = 0) {
    return this.db.prepare(`
      SELECT v.* FROM videos v
      JOIN videos_fts f ON v.rowid = f.rowid
      WHERE videos_fts MATCH ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `).all(query, limit, offset)
  }

  listAll (limit = 50, offset = 0, category = null) {
    if (category) {
      return this.db.prepare(`
        SELECT * FROM videos WHERE category = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?
      `).all(category, limit, offset)
    }
    return this.db.prepare(`
      SELECT * FROM videos ORDER BY timestamp DESC LIMIT ? OFFSET ?
    `).all(limit, offset)
  }

  listLocal (limit = 50, offset = 0) {
    return this.db.prepare(`
      SELECT * FROM videos WHERE is_local = 1 ORDER BY timestamp DESC LIMIT ? OFFSET ?
    `).all(limit, offset)
  }

  get (id) {
    return this.db.prepare('SELECT * FROM videos WHERE id = ?').get(id)
  }

  stats () {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM videos').get()
    const archived = this.db.prepare('SELECT COUNT(*) as count FROM videos WHERE video_path IS NOT NULL').get()
    return {
      videoCount: total.count,
      archivedCount: archived.count
    }
  }

  close () {
    this.db.close()
  }
}

module.exports = ArchiveDatabase
