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
    if (!colNames.has('image_keywords')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN image_keywords TEXT')
    }
    if (!colNames.has('location_latitude')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN location_latitude REAL')
    }
    if (!colNames.has('location_longitude')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN location_longitude REAL')
    }
    if (!colNames.has('media_date')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN media_date TEXT')
    }
    if (!colNames.has('location_scanned')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN location_scanned INTEGER DEFAULT 0')
    }
    if (!colNames.has('image_scan_attempted')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN image_scan_attempted INTEGER DEFAULT 0')
    }
    if (!colNames.has('document_date')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN document_date TEXT')
    }
    if (!colNames.has('date_source')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN date_source TEXT')
    }
    if (!colNames.has('entity_scan_attempted')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN entity_scan_attempted INTEGER DEFAULT 0')
    }
    if (!colNames.has('financial_scan_attempted')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN financial_scan_attempted INTEGER DEFAULT 0')
    }

    // Entity tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        UNIQUE(normalized_name, type)
      );
      CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
      CREATE INDEX IF NOT EXISTS idx_entities_norm ON entities(normalized_name);

      CREATE TABLE IF NOT EXISTS document_entities (
        document_id TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        mention_count INTEGER DEFAULT 1,
        PRIMARY KEY (document_id, entity_id),
        FOREIGN KEY (document_id) REFERENCES documents(id),
        FOREIGN KEY (entity_id) REFERENCES entities(id)
      );
      CREATE INDEX IF NOT EXISTS idx_doc_entities_doc ON document_entities(document_id);
      CREATE INDEX IF NOT EXISTS idx_doc_entities_ent ON document_entities(entity_id);
    `)

    // Financial records table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS financial_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL,
        record_type TEXT,
        amount REAL,
        currency TEXT DEFAULT 'USD',
        date TEXT,
        from_entity TEXT,
        to_entity TEXT,
        description TEXT,
        raw_json TEXT,
        FOREIGN KEY (document_id) REFERENCES documents(id)
      );
      CREATE INDEX IF NOT EXISTS idx_fin_doc ON financial_records(document_id);
      CREATE INDEX IF NOT EXISTS idx_fin_date ON financial_records(date);
      CREATE INDEX IF NOT EXISTS idx_fin_amount ON financial_records(amount);
      CREATE INDEX IF NOT EXISTS idx_fin_from ON financial_records(from_entity);
      CREATE INDEX IF NOT EXISTS idx_fin_to ON financial_records(to_entity);
    `)
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
      if (Array.isArray(contentType)) {
        conditions.push(`content_type IN (${contentType.map(() => '?').join(',')})`)
        params.push(...contentType)
      } else {
        conditions.push('content_type = ?')
        params.push(contentType)
      }
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
             file_size, page_count, extracted_text, transcript,
             location_latitude, location_longitude, file_path, thumb_path, image_keywords,
             document_date
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

  updateContentType (id, contentType, category, filePath, fileSize) {
    this.db.prepare(`
      UPDATE documents
      SET content_type = ?, category = ?, file_path = ?, file_size = ?, thumb_path = NULL
      WHERE id = ?
    `).run(contentType, category, filePath, fileSize, id)
  }

  setImageKeywords (id, keywords) {
    this.db.prepare('UPDATE documents SET image_keywords = ? WHERE id = ?').run(keywords, id)
  }

  getUnkeywordedImages (dataSet, limit = 100) {
    return this.db.prepare(`
      SELECT id, file_name, file_path
      FROM documents
      WHERE data_set = ? AND content_type = 'image' AND image_keywords IS NULL AND file_path IS NOT NULL
      LIMIT ?
    `).all(dataSet, limit)
  }

  getUnkeywordedPdfs (dataSet, limit = 100) {
    return this.db.prepare(`
      SELECT id, file_name, file_path
      FROM documents
      WHERE data_set = ? AND content_type = 'pdf' AND image_keywords IS NULL AND file_path IS NOT NULL
      LIMIT ?
    `).all(dataSet, limit)
  }

  setGeoLocation (id, lat, lng) {
    this.db.prepare('UPDATE documents SET location_latitude = ?, location_longitude = ? WHERE id = ?')
      .run(lat, lng, id)
  }

  setMediaDate (id, dateStr) {
    this.db.prepare('UPDATE documents SET media_date = ? WHERE id = ?')
      .run(dateStr, id)
  }

  markGeoScanned (id) {
    this.db.prepare('UPDATE documents SET location_scanned = 1 WHERE id = ?')
      .run(id)
  }

  getUngeolocatedDocs (dataSet, contentTypes, limit = 200) {
    const placeholders = contentTypes.map(() => '?').join(',')
    return this.db.prepare(`
      SELECT id, title, file_name, file_path, content_type, image_keywords
      FROM documents
      WHERE data_set = ? AND content_type IN (${placeholders}) AND location_scanned = 0 AND file_path IS NOT NULL
      LIMIT ?
    `).all(dataSet, ...contentTypes, limit)
  }

  // --- Transcription methods (Feature 1) ---

  getUntranscribedMedia (dataSet, limit = 100) {
    return this.db.prepare(`
      SELECT id, file_path, content_type FROM documents
      WHERE content_type IN ('audio','video')
      AND (transcript IS NULL OR transcript = '')
      AND data_set = ?
      LIMIT ?
    `).all(dataSet, limit)
  }

  // --- Date extraction methods (Feature 2) ---

  setDocumentDate (id, dateStr, source) {
    this.db.prepare('UPDATE documents SET document_date = ?, date_source = ? WHERE id = ?')
      .run(dateStr, source, id)
  }

  getUndatedDocs (dataSet, limit = 500) {
    return this.db.prepare(`
      SELECT id, file_name, media_date, created_at FROM documents
      WHERE document_date IS NULL AND data_set = ?
      LIMIT ?
    `).all(dataSet, limit)
  }

  // --- Entity methods (Feature 3) ---

  upsertEntity (name, type) {
    const normalized = name.toLowerCase().trim()
    this.db.prepare(`
      INSERT OR IGNORE INTO entities (name, type, normalized_name) VALUES (?, ?, ?)
    `).run(name.trim(), type, normalized)
    const row = this.db.prepare('SELECT id FROM entities WHERE normalized_name = ? AND type = ?').get(normalized, type)
    return row ? row.id : null
  }

  linkDocumentEntity (docId, entityId, count) {
    this.db.prepare(`
      INSERT OR REPLACE INTO document_entities (document_id, entity_id, mention_count) VALUES (?, ?, ?)
    `).run(docId, entityId, count || 1)
  }

  getDocumentEntities (docId) {
    return this.db.prepare(`
      SELECT e.id, e.name, e.type, de.mention_count
      FROM document_entities de
      JOIN entities e ON e.id = de.entity_id
      WHERE de.document_id = ?
      ORDER BY de.mention_count DESC
    `).all(docId)
  }

  getEntityDocuments (entityId, limit = 50, offset = 0) {
    const rows = this.db.prepare(`
      SELECT d.id, d.title, d.file_name, d.data_set, d.content_type, d.category, de.mention_count
      FROM document_entities de
      JOIN documents d ON d.id = de.document_id
      WHERE de.entity_id = ?
      ORDER BY de.mention_count DESC
      LIMIT ? OFFSET ?
    `).all(entityId, limit, offset)
    const total = this.db.prepare('SELECT COUNT(*) as count FROM document_entities WHERE entity_id = ?').get(entityId)
    return { documents: rows, total: total.count }
  }

  getEntityCooccurrences (minShared = 2) {
    return this.db.prepare(`
      SELECT a.entity_id as source, b.entity_id as target, COUNT(*) as shared_docs
      FROM document_entities a
      JOIN document_entities b ON a.document_id = b.document_id AND a.entity_id < b.entity_id
      GROUP BY a.entity_id, b.entity_id
      HAVING shared_docs >= ?
      ORDER BY shared_docs DESC
    `).all(minShared)
  }

  getTopEntities (type, limit = 50) {
    let sql = `
      SELECT e.id, e.name, e.type, COUNT(de.document_id) as document_count
      FROM entities e
      JOIN document_entities de ON de.entity_id = e.id
    `
    const params = []
    if (type) {
      sql += ' WHERE e.type = ?'
      params.push(type)
    }
    sql += ' GROUP BY e.id ORDER BY document_count DESC LIMIT ?'
    params.push(limit)
    return this.db.prepare(sql).all(...params)
  }

  markEntityScanned (id) {
    this.db.prepare('UPDATE documents SET entity_scan_attempted = 1 WHERE id = ?').run(id)
  }

  getUnscannedForEntities (dataSet, limit = 50) {
    return this.db.prepare(`
      SELECT id, title, extracted_text, transcript FROM documents
      WHERE entity_scan_attempted = 0 AND data_set = ?
      AND (extracted_text IS NOT NULL OR transcript IS NOT NULL)
      LIMIT ?
    `).all(dataSet, limit)
  }

  // --- Financial methods (Feature 4) ---

  insertFinancialRecord (record) {
    return this.db.prepare(`
      INSERT INTO financial_records (document_id, record_type, amount, currency, date, from_entity, to_entity, description, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.documentId, record.type || null, record.amount || null,
      record.currency || 'USD', record.date || null,
      record.from || null, record.to || null,
      record.description || null, record.rawJson || null
    )
  }

  getDocumentFinancials (docId) {
    return this.db.prepare('SELECT * FROM financial_records WHERE document_id = ? ORDER BY date ASC').all(docId)
  }

  getFinancialSummary () {
    const totalRecords = this.db.prepare('SELECT COUNT(*) as count FROM financial_records').get().count
    const totalAmount = this.db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM financial_records WHERE amount IS NOT NULL').get().total
    const topFrom = this.db.prepare(`
      SELECT from_entity as name, SUM(amount) as total FROM financial_records
      WHERE from_entity IS NOT NULL AND amount IS NOT NULL
      GROUP BY from_entity ORDER BY total DESC LIMIT 10
    `).all()
    const topTo = this.db.prepare(`
      SELECT to_entity as name, SUM(amount) as total FROM financial_records
      WHERE to_entity IS NOT NULL AND amount IS NOT NULL
      GROUP BY to_entity ORDER BY total DESC LIMIT 10
    `).all()
    const dateRange = this.db.prepare(`
      SELECT MIN(date) as min, MAX(date) as max FROM financial_records WHERE date IS NOT NULL
    `).get()
    return { totalRecords, totalAmount, topFromEntities: topFrom, topToEntities: topTo, dateRange: dateRange || { min: null, max: null } }
  }

  getFinancialsByEntity (entity, limit = 50) {
    return this.db.prepare(`
      SELECT * FROM financial_records
      WHERE from_entity = ? OR to_entity = ?
      ORDER BY date ASC LIMIT ?
    `).all(entity, entity, limit)
  }

  getFinancialsByDateRange (start, end, limit = 50, offset = 0) {
    let sql = 'SELECT * FROM financial_records WHERE 1=1'
    const params = []
    if (start) { sql += ' AND date >= ?'; params.push(start) }
    if (end) { sql += ' AND date <= ?'; params.push(end) }
    sql += ' ORDER BY date ASC LIMIT ? OFFSET ?'
    params.push(limit, offset)
    const rows = this.db.prepare(sql).all(...params)
    let countSql = 'SELECT COUNT(*) as count FROM financial_records WHERE 1=1'
    const countParams = []
    if (start) { countSql += ' AND date >= ?'; countParams.push(start) }
    if (end) { countSql += ' AND date <= ?'; countParams.push(end) }
    const total = this.db.prepare(countSql).get(...countParams).count
    return { records: rows, total }
  }

  markFinancialScanned (id) {
    this.db.prepare('UPDATE documents SET financial_scan_attempted = 1 WHERE id = ?').run(id)
  }

  getUnscannedFinancials (dataSet, limit = 50) {
    return this.db.prepare(`
      SELECT id, title, extracted_text, transcript FROM documents
      WHERE financial_scan_attempted = 0 AND data_set = ?
      AND category = 'Financial'
      AND (extracted_text IS NOT NULL OR transcript IS NOT NULL)
      LIMIT ?
    `).all(dataSet, limit)
  }

  listFeaturedVideos (options = {}) {
    const { limit = 12, offset = 0 } = options
    const where = "WHERE content_type = 'video' AND thumb_path IS NOT NULL AND transcript IS NOT NULL AND LENGTH(transcript) > 100"

    const total = this.db.prepare(`SELECT COUNT(*) as count FROM documents ${where}`).get()
    const rows = this.db.prepare(
      `SELECT * FROM documents ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(limit, offset)

    return { documents: rows, total: total.count }
  }

  activitySnapshot () {
    const now = Date.now()
    const fiveMinAgo = now - 5 * 60 * 1000

    const documents = this.db.prepare('SELECT COUNT(*) as c FROM documents').get().c
    const transcripts = this.db.prepare("SELECT COUNT(*) as c FROM documents WHERE transcript IS NOT NULL AND transcript != ''").get().c
    const geoLocated = this.db.prepare('SELECT COUNT(*) as c FROM documents WHERE location_latitude IS NOT NULL').get().c
    const withKeywords = this.db.prepare('SELECT COUNT(*) as c FROM documents WHERE image_keywords IS NOT NULL').get().c
    const indexed = this.db.prepare('SELECT COUNT(*) as c FROM documents WHERE indexed_at IS NOT NULL').get().c

    // These tables are created lazily — guard against missing
    const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
    const entities = tables.includes('entities') ? this.db.prepare('SELECT COUNT(*) as c FROM entities').get().c : 0
    const financials = tables.includes('financial_records') ? this.db.prepare('SELECT COUNT(*) as c FROM financial_records').get().c : 0

    // Text extraction progress
    const textExtracted = this.db.prepare("SELECT COUNT(*) as c FROM documents WHERE extracted_text IS NOT NULL AND extracted_text != ''").get().c
    const textPending = this.db.prepare('SELECT COUNT(*) as c FROM documents WHERE extracted_text IS NULL').get().c

    // Transcription progress (audio/video only)
    const avTotal = this.db.prepare("SELECT COUNT(*) as c FROM documents WHERE content_type IN ('audio', 'video')").get().c
    const avTranscribed = this.db.prepare("SELECT COUNT(*) as c FROM documents WHERE content_type IN ('audio', 'video') AND transcript IS NOT NULL AND transcript != ''").get().c

    const recentDocs = this.db.prepare(
      'SELECT COUNT(*) as c FROM documents WHERE created_at >= ?'
    ).get(fiveMinAgo).c

    const recentByType = this.db.prepare(
      'SELECT content_type, COUNT(*) as c FROM documents WHERE created_at >= ? GROUP BY content_type'
    ).all(fiveMinAgo)

    const latestDoc = this.db.prepare(
      'SELECT title, content_type FROM documents ORDER BY created_at DESC LIMIT 1'
    ).get()

    // Collection / torrent stats
    const collections = this.db.prepare('SELECT COUNT(*) as c FROM collections').get().c
    const torrents = this.db.prepare("SELECT COUNT(*) as c FROM collections WHERE torrent_hash IS NOT NULL AND torrent_hash != ''").get().c
    const totalBytes = this.db.prepare('SELECT COALESCE(SUM(file_size), 0) as s FROM documents').get().s

    return {
      ts: now,
      totals: { documents, transcripts, entities, financials, geoLocated, withKeywords, indexed, totalBytes, collections, torrents },
      pending: {
        textExtracted,
        textPending,
        textTotal: textExtracted + textPending,
        avTotal,
        avTranscribed,
        avPending: avTotal - avTranscribed
      },
      recent: { count: recentDocs, byType: Object.fromEntries(recentByType.map(r => [r.content_type, r.c])) },
      latestDoc: latestDoc ? { title: latestDoc.title, contentType: latestDoc.content_type } : null
    }
  }

  close () {
    this.db.close()
  }
}

module.exports = DocumentsDatabase
