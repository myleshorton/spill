const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const archiveConfigPath = path.join(__dirname, '..', 'archive-config.json')

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
        indexed_at INTEGER,
        collection_id INTEGER DEFAULT 1,
        sha256_hash TEXT
      );

      CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        torrent_hash TEXT,
        magnet_link TEXT,
        torrent_path TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_docs_dataset ON documents(data_set);
      CREATE INDEX IF NOT EXISTS idx_docs_type ON documents(content_type);
      CREATE INDEX IF NOT EXISTS idx_docs_category ON documents(category);
      CREATE INDEX IF NOT EXISTS idx_docs_collection ON documents(collection_id);
      CREATE INDEX IF NOT EXISTS idx_docs_hash ON documents(sha256_hash);
    `)

    this._migrate()
    this._seedCollections()
  }

  _migrate () {
    // Add new columns to existing databases
    const cols = this.db.prepare("PRAGMA table_info('documents')").all()
    const colNames = new Set(cols.map(c => c.name))
    if (!colNames.has('collection_id')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN collection_id INTEGER DEFAULT 1')
    }
    if (!colNames.has('sha256_hash')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN sha256_hash TEXT')
    }
    if (!colNames.has('embedding')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN embedding BLOB')
    }
  }

  _seedCollections () {
    if (!fs.existsSync(archiveConfigPath)) return
    const config = JSON.parse(fs.readFileSync(archiveConfigPath, 'utf8'))
    if (!config.dataSets || config.dataSets.length === 0) return

    const existing = this.db.prepare('SELECT COUNT(*) as count FROM collections').get()
    if (existing.count > 0) return

    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO collections (id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    const now = Date.now()
    const seed = this.db.transaction(() => {
      for (const ds of config.dataSets) {
        insert.run(ds.id, ds.name, ds.description, now, now)
      }
    })
    seed()
    console.log('[docs-db] Seeded %d collections from archive-config.json', config.dataSets.length)
  }

  insert (doc) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO documents
        (id, title, file_name, data_set, content_type, category,
         file_size, page_count, file_path, thumb_path,
         drive_key, file_key, extracted_text, transcript,
         source_url, created_at, indexed_at, collection_id, sha256_hash)
      VALUES
        (@id, @title, @file_name, @data_set, @content_type, @category,
         @file_size, @page_count, @file_path, @thumb_path,
         @drive_key, @file_key, @extracted_text, @transcript,
         @source_url, @created_at, @indexed_at, @collection_id, @sha256_hash)
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
      indexed_at: doc.indexedAt || doc.indexed_at || null,
      collection_id: doc.collectionId || doc.collection_id || 1,
      sha256_hash: doc.sha256Hash || doc.sha256_hash || null
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

  // --- Collection methods ---

  getCollection (id) {
    return this.db.prepare('SELECT * FROM collections WHERE id = ?').get(id)
  }

  listCollections () {
    return this.db.prepare('SELECT * FROM collections ORDER BY id ASC').all()
  }

  updateCollectionTorrent (id, torrentHash, magnetLink, torrentPath) {
    this.db.prepare(`
      UPDATE collections SET torrent_hash = ?, magnet_link = ?, torrent_path = ?, updated_at = ?
      WHERE id = ?
    `).run(torrentHash, magnetLink, torrentPath, Date.now(), id)
  }

  getDatasetFilePaths (datasetId) {
    return this.db.prepare(
      'SELECT id, file_name, file_path, file_size FROM documents WHERE data_set = ? AND file_path IS NOT NULL ORDER BY file_name ASC'
    ).all(datasetId)
  }

  getDatasetTotalSize (datasetId) {
    const row = this.db.prepare(
      'SELECT COALESCE(SUM(file_size), 0) as total FROM documents WHERE data_set = ?'
    ).get(datasetId)
    return row.total
  }

  findByHash (sha256) {
    return this.db.prepare('SELECT * FROM documents WHERE sha256_hash = ?').get(sha256)
  }

  setEmbedding (id, buffer) {
    this.db.prepare('UPDATE documents SET embedding = ? WHERE id = ?').run(buffer, id)
  }

  getEmbedding (id) {
    const row = this.db.prepare('SELECT embedding FROM documents WHERE id = ?').get(id)
    return row ? row.embedding : null
  }

  getAllEmbeddings () {
    return this.db.prepare('SELECT id, embedding FROM documents WHERE embedding IS NOT NULL').all()
  }

  getEmbeddingsForIds (ids) {
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    return this.db.prepare(`SELECT id, embedding FROM documents WHERE id IN (${placeholders}) AND embedding IS NOT NULL`).all(...ids)
  }

  getUnembeddedDocs (limit = 100) {
    return this.db.prepare(`
      SELECT id, title, extracted_text, transcript
      FROM documents
      WHERE embedding IS NULL AND (extracted_text IS NOT NULL OR transcript IS NOT NULL)
      LIMIT ?
    `).all(limit)
  }

  close () {
    this.db.close()
  }
}

module.exports = DocumentsDatabase
