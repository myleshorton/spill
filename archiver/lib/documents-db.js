/**
 * SQLite database for Epstein archive documents.
 * Separate from the videos table — stores document metadata,
 * extracted text, and references to Meilisearch-indexed content.
 */
const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

class DocumentsDatabase {
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
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        file_name TEXT,
        data_set INTEGER NOT NULL,
        content_type TEXT NOT NULL,
        category TEXT,
        file_size INTEGER DEFAULT 0,
        page_count INTEGER,
        file_path TEXT,
        thumb_path TEXT,
        drive_key TEXT,
        file_key TEXT,
        extracted_text TEXT,
        transcript TEXT,
        source_url TEXT,
        created_at INTEGER,
        indexed_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_docs_dataset ON documents(data_set);
      CREATE INDEX IF NOT EXISTS idx_docs_type ON documents(content_type);
      CREATE INDEX IF NOT EXISTS idx_docs_category ON documents(category);
    `)
  }

  insert (doc) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO documents
        (id, title, file_name, data_set, content_type, category,
         file_size, page_count, file_path, thumb_path,
         drive_key, file_key, extracted_text, transcript,
         source_url, created_at, indexed_at)
      VALUES
        (@id, @title, @file_name, @data_set, @content_type, @category,
         @file_size, @page_count, @file_path, @thumb_path,
         @drive_key, @file_key, @extracted_text, @transcript,
         @source_url, @created_at, @indexed_at)
    `)
    stmt.run({
      id: doc.id,
      title: doc.title || doc.file_name || 'Untitled',
      file_name: doc.fileName || doc.file_name || null,
      data_set: doc.dataSet || doc.data_set,
      content_type: doc.contentType || doc.content_type,
      category: doc.category || null,
      file_size: doc.fileSize || doc.file_size || 0,
      page_count: doc.pageCount || doc.page_count || null,
      file_path: doc.filePath || doc.file_path || null,
      thumb_path: doc.thumbPath || doc.thumb_path || null,
      drive_key: doc.driveKey || doc.drive_key || null,
      file_key: doc.fileKey || doc.file_key || null,
      extracted_text: doc.extractedText || doc.extracted_text || null,
      transcript: doc.transcript || null,
      source_url: doc.sourceUrl || doc.source_url || null,
      created_at: doc.createdAt || doc.created_at || Date.now(),
      indexed_at: doc.indexedAt || doc.indexed_at || null
    })
  }

  insertBatch (docs) {
    const insert = this.db.transaction((items) => {
      for (const doc of items) {
        this.insert(doc)
      }
    })
    insert(docs)
  }

  get (id) {
    return this.db.prepare('SELECT * FROM documents WHERE id = ?').get(id)
  }

  list (options = {}) {
    const { limit = 50, offset = 0, dataSet, contentType, category } = options
    const conditions = []
    const params = []

    if (dataSet) {
      conditions.push('data_set = ?')
      params.push(dataSet)
    }
    if (contentType) {
      conditions.push('content_type = ?')
      params.push(contentType)
    }
    if (category) {
      conditions.push('category = ?')
      params.push(category)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const total = this.db.prepare(`SELECT COUNT(*) as count FROM documents ${where}`).get(...params)
    const rows = this.db.prepare(
      `SELECT * FROM documents ${where} ORDER BY data_set ASC, file_name ASC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset)

    return { documents: rows, total: total.count }
  }

  getText (id) {
    const row = this.db.prepare('SELECT extracted_text, transcript FROM documents WHERE id = ?').get(id)
    return row ? (row.extracted_text || row.transcript || '') : ''
  }

  stats () {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM documents').get()
    const totalSize = this.db.prepare('SELECT COALESCE(SUM(file_size), 0) as size FROM documents').get()

    const byType = this.db.prepare(
      'SELECT content_type, COUNT(*) as count FROM documents GROUP BY content_type'
    ).all()
    const byDataSet = this.db.prepare(
      'SELECT data_set, COUNT(*) as count FROM documents GROUP BY data_set ORDER BY data_set'
    ).all()
    const byCat = this.db.prepare(
      'SELECT category, COUNT(*) as count FROM documents WHERE category IS NOT NULL GROUP BY category'
    ).all()

    return {
      totalDocuments: total.count,
      totalSize: totalSize.size,
      byContentType: Object.fromEntries(byType.map(r => [r.content_type, r.count])),
      byDataSet: Object.fromEntries(byDataSet.map(r => [String(r.data_set), r.count])),
      byCategory: Object.fromEntries(byCat.map(r => [r.category, r.count]))
    }
  }

  updateDriveInfo (id, driveKey, fileKey) {
    this.db.prepare('UPDATE documents SET drive_key = ?, file_key = ? WHERE id = ?')
      .run(driveKey, fileKey, id)
  }

  updateIndexedAt (id) {
    this.db.prepare('UPDATE documents SET indexed_at = ? WHERE id = ?')
      .run(Date.now(), id)
  }

  allForIndexing (batchSize = 1000, offset = 0) {
    return this.db.prepare(`
      SELECT id, title, file_name, data_set, content_type, category,
             file_size, page_count, extracted_text, transcript
      FROM documents
      LIMIT ? OFFSET ?
    `).all(batchSize, offset)
  }

  count () {
    return this.db.prepare('SELECT COUNT(*) as count FROM documents').get().count
  }

  close () {
    this.db.close()
  }
}

module.exports = DocumentsDatabase
