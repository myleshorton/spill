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
    this.config = this._loadConfig()
    this._init()
  }

  _loadConfig () {
    try {
      const base = JSON.parse(fs.readFileSync(archiveConfigPath, 'utf8'))
      const overridePath = archiveConfigPath.replace('.json', '.override.json')
      if (fs.existsSync(overridePath)) {
        const raw = fs.readFileSync(overridePath, 'utf8').trim()
        if (raw.length > 0) {
          Object.assign(base, JSON.parse(raw))
        }
      }
      return base
    } catch {
      return {}
    }
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
    if (!colNames.has('deep_extract_attempted')) {
      this.db.exec('ALTER TABLE documents ADD COLUMN deep_extract_attempted INTEGER DEFAULT 0')
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

    // Entity metadata columns
    const entityCols = this.db.prepare("PRAGMA table_info('entities')").all()
    const entityColNames = new Set(entityCols.map(c => c.name))
    if (!entityColNames.has('description')) {
      this.db.exec('ALTER TABLE entities ADD COLUMN description TEXT')
    }
    if (!entityColNames.has('aliases')) {
      this.db.exec("ALTER TABLE entities ADD COLUMN aliases TEXT DEFAULT '[]'")
    }
    if (!entityColNames.has('photo_url')) {
      this.db.exec('ALTER TABLE entities ADD COLUMN photo_url TEXT')
    }
    if (!entityColNames.has('external_urls')) {
      this.db.exec("ALTER TABLE entities ADD COLUMN external_urls TEXT DEFAULT '{}'")
    }
    if (!entityColNames.has('enrichment_attempted')) {
      this.db.exec('ALTER TABLE entities ADD COLUMN enrichment_attempted INTEGER DEFAULT 0')
    }

    // Typed relationships between entities
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entity_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_entity_id INTEGER NOT NULL,
        target_entity_id INTEGER NOT NULL,
        relationship_type TEXT NOT NULL,
        description TEXT,
        source_document_id TEXT,
        created_at INTEGER,
        FOREIGN KEY (source_entity_id) REFERENCES entities(id),
        FOREIGN KEY (target_entity_id) REFERENCES entities(id),
        FOREIGN KEY (source_document_id) REFERENCES documents(id),
        UNIQUE(source_entity_id, target_entity_id, relationship_type)
      );
      CREATE INDEX IF NOT EXISTS idx_er_source ON entity_relationships(source_entity_id);
      CREATE INDEX IF NOT EXISTS idx_er_target ON entity_relationships(target_entity_id);
      CREATE INDEX IF NOT EXISTS idx_er_type ON entity_relationships(relationship_type);
      CREATE INDEX IF NOT EXISTS idx_er_doc ON entity_relationships(source_document_id);
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

    // Entity questions cache
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entity_questions (
        entity_id INTEGER PRIMARY KEY,
        questions TEXT NOT NULL,
        generated_at INTEGER NOT NULL,
        FOREIGN KEY (entity_id) REFERENCES entities(id)
      );
    `)

    // Document links (parent/child, extracted, related, etc.)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS document_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        link_type TEXT NOT NULL,
        description TEXT,
        created_at INTEGER,
        FOREIGN KEY (source_id) REFERENCES documents(id),
        FOREIGN KEY (target_id) REFERENCES documents(id),
        UNIQUE(source_id, target_id, link_type)
      );
      CREATE INDEX IF NOT EXISTS idx_doclinks_source ON document_links(source_id);
      CREATE INDEX IF NOT EXISTS idx_doclinks_target ON document_links(target_id);
    `)

    // Extraction triage table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS extraction_triage (
        document_id TEXT PRIMARY KEY,
        score INTEGER,
        flags TEXT,
        triaged_at INTEGER,
        FOREIGN KEY (document_id) REFERENCES documents(id)
      );
      CREATE INDEX IF NOT EXISTS idx_triage_score ON extraction_triage(score);
    `)

    // Extraction metadata table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS extraction_metadata (
        document_id TEXT PRIMARY KEY,
        extracted_doc_id TEXT,
        extraction_type TEXT,
        email_count INTEGER,
        senders TEXT,
        recipients TEXT,
        date_range_start TEXT,
        date_range_end TEXT,
        people_mentioned TEXT,
        summary TEXT,
        confidence REAL,
        extracted_at INTEGER,
        FOREIGN KEY (document_id) REFERENCES documents(id),
        FOREIGN KEY (extracted_doc_id) REFERENCES documents(id)
      );
    `)
  }

  _seedCollections () {
    const config = this.config
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

  getAllUntranscribedMedia (limit = 10) {
    return this.db.prepare(`
      SELECT id, file_path, content_type, data_set FROM documents
      WHERE content_type IN ('audio','video')
      AND (transcript IS NULL OR transcript = '')
      LIMIT ?
    `).all(limit)
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
      SELECT d.*, de.mention_count
      FROM document_entities de
      JOIN documents d ON d.id = de.document_id
      WHERE de.entity_id = ?
      ORDER BY de.mention_count DESC
      LIMIT ? OFFSET ?
    `).all(entityId, limit, offset)
    const total = this.db.prepare('SELECT COUNT(*) as count FROM document_entities WHERE entity_id = ?').get(entityId)
    return { documents: rows, total: total.count }
  }

  getEntityCooccurrences (minShared = 5, limit = 2000) {
    return this.db.prepare(`
      SELECT a.entity_id as source, b.entity_id as target, COUNT(*) as shared_docs
      FROM document_entities a
      JOIN document_entities b ON a.document_id = b.document_id AND a.entity_id < b.entity_id
      GROUP BY a.entity_id, b.entity_id
      HAVING shared_docs >= ?
      ORDER BY shared_docs DESC
      LIMIT ?
    `).all(minShared, limit)
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

  getEntity (id) {
    return this.db.prepare(`
      SELECT e.id, e.name, e.type, e.normalized_name,
             e.description, e.aliases, e.photo_url, e.external_urls,
             COUNT(de.document_id) as document_count
      FROM entities e LEFT JOIN document_entities de ON de.entity_id = e.id
      WHERE e.id = ? GROUP BY e.id
    `).get(id)
  }

  getRelatedEntities (entityId, limit = 20) {
    return this.db.prepare(`
      SELECT e.id, e.name, e.type, COUNT(DISTINCT de2.document_id) as shared_documents
      FROM document_entities de1
      JOIN document_entities de2 ON de1.document_id = de2.document_id AND de2.entity_id != de1.entity_id
      JOIN entities e ON e.id = de2.entity_id
      WHERE de1.entity_id = ?
      GROUP BY e.id ORDER BY shared_documents DESC LIMIT ?
    `).all(entityId, limit)
  }

  searchEntities (query, type, limit = 50, offset = 0) {
    const conditions = []
    const params = []

    if (query) {
      conditions.push('e.name LIKE ?')
      params.push(`%${query}%`)
    }
    if (type) {
      conditions.push('e.type = ?')
      params.push(type)
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

    const total = this.db.prepare(`
      SELECT COUNT(DISTINCT e.id) as count FROM entities e
      JOIN document_entities de ON de.entity_id = e.id
      ${where}
    `).get(...params).count

    const rows = this.db.prepare(`
      SELECT e.id, e.name, e.type, e.normalized_name, e.description,
             COUNT(de.document_id) as document_count
      FROM entities e
      JOIN document_entities de ON de.entity_id = e.id
      ${where}
      GROUP BY e.id ORDER BY document_count DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset)

    return { entities: rows, total }
  }

  // --- Entity enrichment methods ---

  updateEntityMetadata (id, { description, aliases, photoUrl, externalUrls }) {
    this.db.prepare(`
      UPDATE entities SET description = ?, aliases = ?, photo_url = ?, external_urls = ?
      WHERE id = ?
    `).run(
      description || null,
      JSON.stringify(aliases || []),
      photoUrl || null,
      JSON.stringify(externalUrls || {}),
      id
    )
  }

  markEntityEnriched (id) {
    this.db.prepare('UPDATE entities SET enrichment_attempted = 1 WHERE id = ?').run(id)
  }

  getUnenrichedEntities (limit = 50) {
    return this.db.prepare(`
      SELECT e.id, e.name, e.type, e.normalized_name, COUNT(de.document_id) as document_count
      FROM entities e
      JOIN document_entities de ON de.entity_id = e.id
      WHERE e.enrichment_attempted = 0
      GROUP BY e.id ORDER BY document_count DESC LIMIT ?
    `).all(limit)
  }

  upsertEntityRelationship (sourceId, targetId, type, description, docId) {
    this.db.prepare(`
      INSERT INTO entity_relationships (source_entity_id, target_entity_id, relationship_type, description, source_document_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_entity_id, target_entity_id, relationship_type) DO UPDATE SET
        description = excluded.description,
        source_document_id = excluded.source_document_id
    `).run(sourceId, targetId, type, description || null, docId || null, Date.now())
  }

  getEntityRelationships (entityId, limit = 50) {
    return this.db.prepare(`
      SELECT r.id, r.relationship_type, r.description, r.source_document_id,
             r.source_entity_id, r.target_entity_id,
             CASE WHEN r.source_entity_id = ? THEN 'outgoing' ELSE 'incoming' END as direction,
             CASE WHEN r.source_entity_id = ? THEN t.id ELSE s.id END as other_id,
             CASE WHEN r.source_entity_id = ? THEN t.name ELSE s.name END as other_name,
             CASE WHEN r.source_entity_id = ? THEN t.type ELSE s.type END as other_type
      FROM entity_relationships r
      JOIN entities s ON s.id = r.source_entity_id
      JOIN entities t ON t.id = r.target_entity_id
      WHERE r.source_entity_id = ? OR r.target_entity_id = ?
      ORDER BY r.relationship_type ASC
      LIMIT ?
    `).all(entityId, entityId, entityId, entityId, entityId, entityId, limit)
  }

  getEntityQuestions (entityId) {
    return this.db.prepare('SELECT questions, generated_at FROM entity_questions WHERE entity_id = ?').get(entityId)
  }

  setEntityQuestions (entityId, questions) {
    this.db.prepare(`
      INSERT OR REPLACE INTO entity_questions (entity_id, questions, generated_at)
      VALUES (?, ?, ?)
    `).run(entityId, JSON.stringify(questions), Date.now())
  }

  getRelationshipTypes () {
    return this.db.prepare(`
      SELECT relationship_type, COUNT(*) as count
      FROM entity_relationships
      GROUP BY relationship_type ORDER BY count DESC
    `).all()
  }

  getEntityDocumentTexts (entityId, limit = 5, maxChars = 3000) {
    const rows = this.db.prepare(`
      SELECT d.id, d.title, d.extracted_text, d.transcript
      FROM document_entities de
      JOIN documents d ON d.id = de.document_id
      WHERE de.entity_id = ?
      AND (d.extracted_text IS NOT NULL OR d.transcript IS NOT NULL)
      ORDER BY de.mention_count DESC
      LIMIT ?
    `).all(entityId, limit)
    return rows.map(r => ({
      id: r.id,
      title: r.title,
      text: (r.extracted_text || r.transcript || '').slice(0, maxChars)
    }))
  }

  getCooccurringEntities (entityId, limit = 10) {
    return this.db.prepare(`
      SELECT e.id, e.name, e.type,
             COUNT(DISTINCT de2.document_id) as shared_documents,
             GROUP_CONCAT(DISTINCT de2.document_id) as shared_doc_ids
      FROM document_entities de1
      JOIN document_entities de2 ON de1.document_id = de2.document_id AND de2.entity_id != de1.entity_id
      JOIN entities e ON e.id = de2.entity_id
      WHERE de1.entity_id = ?
      GROUP BY e.id ORDER BY shared_documents DESC LIMIT ?
    `).all(entityId, limit)
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
      AND LOWER(category) = 'financial'
      AND (extracted_text IS NOT NULL OR transcript IS NOT NULL)
      LIMIT ?
    `).all(dataSet, limit)
  }

  listFeaturedVideos (options = {}) {
    const { limit = 12, offset = 0 } = options
    const videoCfg = this.config?.featuredContent?.videos
    const conditions = ["content_type = 'video'", 'thumb_path IS NOT NULL']

    if (videoCfg?.requireTranscript !== false) {
      conditions.push('transcript IS NOT NULL')
      const minLen = videoCfg?.minTranscriptLength || 100
      conditions.push(`LENGTH(transcript) > ${Number(minLen)}`)
    }

    const where = 'WHERE ' + conditions.join(' AND ')
    const total = this.db.prepare(`SELECT COUNT(*) as count FROM documents ${where}`).get()
    const rows = this.db.prepare(
      `SELECT * FROM documents ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(limit, offset)

    return { documents: rows, total: total.count }
  }

  listFeaturedPhotos (options = {}) {
    const { limit = 12, offset = 0 } = options
    const photoCfg = this.config?.featuredContent?.photos
    const conditions = ["content_type = 'image'", 'thumb_path IS NOT NULL']

    const includeKw = photoCfg?.includeKeywords || []
    if (includeKw.length > 0) {
      const likes = includeKw.map(kw => `image_keywords LIKE '%${kw.replace(/'/g, "''")}%'`)
      conditions.push('(' + likes.join(' OR ') + ')')
    }

    const excludeKw = photoCfg?.excludeKeywords || []
    for (const kw of excludeKw) {
      conditions.push(`image_keywords NOT LIKE '%${kw.replace(/'/g, "''")}%'`)
    }

    const excludeTitleKw = photoCfg?.excludeTitleKeywords || []
    for (const kw of excludeTitleKw) {
      conditions.push(`title NOT LIKE '%${kw.replace(/'/g, "''")}%'`)
    }

    const excludeIds = photoCfg?.excludeIds || []
    if (excludeIds.length > 0) {
      const placeholders = excludeIds.map(() => '?').join(', ')
      conditions.push(`id NOT IN (${placeholders})`)
    }

    const where = 'WHERE ' + conditions.join(' AND ')
    const total = this.db.prepare(`SELECT COUNT(*) as count FROM documents ${where}`).get(...excludeIds)
    const rows = this.db.prepare(
      `SELECT * FROM documents ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...excludeIds, limit, offset)

    return { documents: rows, total: total.count }
  }

  activitySnapshot () {
    // Cache for 30 seconds — this method runs ~16 full-table COUNT(*) queries
    // on 1.4M+ rows and was being polled every 8s, pegging the CPU at 100%.
    if (this._activityCache && Date.now() - this._activityCache.ts < 30000) {
      return this._activityCache.data
    }

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

    const result = {
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

    this._activityCache = { ts: now, data: result }
    return result
  }

  // --- Document Links ---

  linkDocuments (sourceId, targetId, linkType, description = null) {
    this.db.prepare(`
      INSERT OR IGNORE INTO document_links (source_id, target_id, link_type, description, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(sourceId, targetId, linkType, description, Date.now())
  }

  getLinkedDocuments (docId) {
    // Get documents linked in either direction, deduplicated by target doc
    const rows = this.db.prepare(`
      SELECT d.*, dl.link_type, dl.description AS link_description,
             CASE WHEN dl.source_id = ? THEN 'outgoing' ELSE 'incoming' END AS direction
      FROM document_links dl
      JOIN documents d ON d.id = CASE WHEN dl.source_id = ? THEN dl.target_id ELSE dl.source_id END
      WHERE dl.source_id = ? OR dl.target_id = ?
      GROUP BY d.id
      ORDER BY dl.created_at DESC
    `).all(docId, docId, docId, docId)
    return rows
  }

  upsertTriage (documentId, score, flags) {
    this.db.prepare(`
      INSERT OR REPLACE INTO extraction_triage (document_id, score, flags, triaged_at)
      VALUES (?, ?, ?, ?)
    `).run(documentId, score, JSON.stringify(flags), Date.now())
  }

  getTriagedDocs (minScore = 20, limit = 1000, offset = 0, { hiddenOnly = false } = {}) {
    const hiddenFilter = hiddenOnly ? "AND et.flags LIKE '%hidden_content%'" : ''
    return this.db.prepare(`
      SELECT et.*, d.file_name, d.file_path, d.extracted_text, d.file_size, d.page_count, d.content_type
      FROM extraction_triage et
      JOIN documents d ON d.id = et.document_id
      WHERE et.score >= ? AND (d.deep_extract_attempted = 0 OR d.deep_extract_attempted IS NULL)
      ${hiddenFilter}
      ORDER BY et.score DESC
      LIMIT ? OFFSET ?
    `).all(minScore, limit, offset)
  }

  insertExtractionMetadata (meta) {
    this.db.prepare(`
      INSERT OR REPLACE INTO extraction_metadata
      (document_id, extracted_doc_id, extraction_type, email_count, senders, recipients,
       date_range_start, date_range_end, people_mentioned, summary, confidence, extracted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      meta.documentId, meta.extractedDocId, meta.extractionType, meta.emailCount || 0,
      JSON.stringify(meta.senders || []), JSON.stringify(meta.recipients || []),
      meta.dateRangeStart || null, meta.dateRangeEnd || null,
      JSON.stringify(meta.peopleMentioned || []), meta.summary || null,
      meta.confidence || 0, Date.now()
    )
  }

  markDeepExtractScanned (docId) {
    this.db.prepare('UPDATE documents SET deep_extract_attempted = 1 WHERE id = ?').run(docId)
  }

  close () {
    this.db.close()
  }
}

module.exports = DocumentsDatabase
