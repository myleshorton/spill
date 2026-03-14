/**
 * Express routes for the document archive API.
 * Sits alongside the existing /api/videos routes.
 */
const express = require('express')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

// Archive config is loaded from docsDb.config (which merges base + override)

const MIME_TYPES = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.tiff': 'image/tiff', '.tif': 'image/tiff',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.wmv': 'video/x-ms-wmv',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac',
  '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.html': 'text/html', '.htm': 'text/html',
  '.txt': 'text/plain', '.rtf': 'application/rtf',
  '.eml': 'message/rfc822', '.msg': 'application/vnd.ms-outlook'
}

function getMimeType (filePath) {
  const ext = path.extname(filePath || '').toLowerCase()
  return MIME_TYPES[ext] || 'application/octet-stream'
}

function rowToDoc (row) {
  return {
    id: row.id,
    title: row.title,
    fileName: row.file_name,
    dataSet: row.data_set,
    contentType: row.content_type,
    category: row.category,
    fileSize: row.file_size,
    pageCount: row.page_count,
    driveKey: row.drive_key,
    fileKey: row.file_key,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
    indexedAt: row.indexed_at,
    hasContent: !!row.file_path,
    hasThumbnail: !!row.thumb_path,
    locationLatitude: row.location_latitude || null,
    locationLongitude: row.location_longitude || null,
    mediaDate: row.media_date || null,
    documentDate: row.document_date || null
  }
}

let prevSnapshot = null
const startTime = Date.now()

function createDocumentsRouter (docsDb, searchIndex, archiverRef, torrentManager) {
  const router = express.Router()

  // Live activity feed
  router.get('/activity', (req, res) => {
    try {
      const snap = docsDb.activitySnapshot()
      let deltas = null

      if (prevSnapshot) {
        const prev = prevSnapshot.totals
        const curr = snap.totals
        deltas = {
          documentsAdded: curr.documents - prev.documents,
          transcriptsAdded: curr.transcripts - prev.transcripts,
          entitiesExtracted: curr.entities - prev.entities,
          financialsScanned: curr.financials - prev.financials,
          geoLocated: curr.geoLocated - prev.geoLocated,
          keywordsAdded: curr.withKeywords - prev.withKeywords
        }
      }

      prevSnapshot = snap

      const archiver = archiverRef.current
      res.json({
        ts: snap.ts,
        totals: snap.totals,
        pending: snap.pending,
        recent: snap.recent,
        deltas,
        latestDoc: snap.latestDoc,
        status: {
          peerCount: archiver ? archiver.peerCount : 0,
          connected: archiver ? archiver.swarm !== null : false,
          uptime: Math.floor((Date.now() - startTime) / 1000)
        }
      })
    } catch (err) {
      console.error('[docs-api] Activity error:', err.message)
      res.status(500).json({ error: 'Activity feed unavailable' })
    }
  })

  // Paginated document list with filtering
  router.get('/documents', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const offset = parseInt(req.query.offset) || 0
    const dataSet = req.query.data_set ? parseInt(req.query.data_set) : undefined
    const rawType = req.query.content_type || undefined
    const contentType = rawType && rawType.includes(',') ? rawType.split(',') : rawType
    const category = req.query.category || undefined

    const result = docsDb.list({ limit, offset, dataSet, contentType, category })
    res.json({
      documents: result.documents.map(rowToDoc),
      total: result.total
    })
  })

  // Featured videos — interesting videos with thumbnails and real transcripts
  router.get('/featured-videos', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 12, 50)
    const offset = parseInt(req.query.offset) || 0

    const result = docsDb.listFeaturedVideos({ limit, offset })
    res.json({
      documents: result.documents.map(rowToDoc),
      total: result.total
    })
  })

  // Featured photos — images tagged with nudity-related keywords
  router.get('/featured-photos', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 12, 50)
    const offset = parseInt(req.query.offset) || 0

    const result = docsDb.listFeaturedPhotos({ limit, offset })
    res.json({
      documents: result.documents.map(rowToDoc),
      total: result.total
    })
  })

  // Full-text search via Meilisearch
  router.get('/documents/search', async (req, res) => {
    const q = req.query.q
    if (!q || q.trim().length === 0) {
      return res.json({ hits: [], query: '', processingTimeMs: 0, estimatedTotalHits: 0 })
    }

    try {
      const limit = Math.min(parseInt(req.query.limit) || 40, 100)
      const offset = parseInt(req.query.offset) || 0
      const filter = req.query.filter || undefined

      const result = await searchIndex.search(q, { limit, offset, filter })
      res.json(result)
    } catch (err) {
      console.error('[docs-api] Search error:', err.message)
      res.status(500).json({ error: 'Search temporarily unavailable' })
    }
  })

  // Single document metadata
  router.get('/documents/:id', (req, res) => {
    const doc = docsDb.get(req.params.id)
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' })
    }
    res.json(rowToDoc(doc))
  })

  // Stream document content
  router.get('/documents/:id/content', async (req, res) => {
    const doc = docsDb.get(req.params.id)
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' })
    }

    const contentType = getMimeType(doc.file_path || doc.file_name || '')

    // Serve from local disk
    if (doc.file_path && fs.existsSync(doc.file_path)) {
      const stat = fs.statSync(doc.file_path)
      const range = req.headers.range

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
        const chunkSize = end - start + 1

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType
        })
        fs.createReadStream(doc.file_path, { start, end }).pipe(res)
      } else {
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': contentType,
          'Content-Disposition': `inline; filename="${encodeURIComponent(doc.file_name || 'document')}"`,
          'Cache-Control': 'public, max-age=86400'
        })
        fs.createReadStream(doc.file_path).pipe(res)
      }
      return
    }

    // Fallback: stream from Hyperdrive
    if (doc.drive_key && doc.file_key && archiverRef.current) {
      try {
        const drive = await archiverRef.current.openDrive(doc.drive_key)
        const node = await drive.entry(doc.file_key)
        if (!node) {
          return res.status(404).json({ error: 'File not found in P2P network' })
        }

        const totalSize = node.value.blob.byteLength
        const range = req.headers.range

        if (range) {
          const parts = range.replace(/bytes=/, '').split('-')
          const start = parseInt(parts[0], 10)
          const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1
          const chunkSize = end - start + 1

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': contentType
          })
          drive.createReadStream(doc.file_key, { start, end }).pipe(res)
        } else {
          res.writeHead(200, {
            'Content-Length': totalSize,
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400'
          })
          drive.createReadStream(doc.file_key).pipe(res)
        }
      } catch (err) {
        console.error('[docs-api] Hyperdrive stream error:', err.message)
        res.status(500).json({ error: 'Failed to stream from P2P' })
      }
      return
    }

    res.status(404).json({ error: 'File not available locally or via P2P' })
  })

  // Transcode non-browser-playable video formats (AVI, WMV, MKV) to MP4 on the fly
  const BROWSER_PLAYABLE = new Set(['.mp4', '.webm', '.ogg'])

  router.get('/documents/:id/stream', (req, res) => {
    const doc = docsDb.get(req.params.id)
    if (!doc || doc.content_type !== 'video') {
      return res.status(404).json({ error: 'Video not found' })
    }

    if (!doc.file_path || !fs.existsSync(doc.file_path)) {
      return res.status(404).json({ error: 'Video file not available' })
    }

    const ext = path.extname(doc.file_path).toLowerCase()
    if (BROWSER_PLAYABLE.has(ext)) {
      // No transcoding needed, redirect to content endpoint
      return res.redirect(`/api/documents/${doc.id}/content`)
    }

    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Cache-Control', 'no-store')

    const ffmpeg = spawn('ffmpeg', [
      '-i', doc.file_path,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '28',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', 'frag_keyframe+empty_moov+faststart',
      '-f', 'mp4',
      '-'
    ])

    ffmpeg.stdout.pipe(res)

    ffmpeg.stderr.on('data', () => {}) // suppress ffmpeg logs
    ffmpeg.on('error', () => {
      if (!res.headersSent) res.status(500).json({ error: 'Transcoding failed' })
    })
    req.on('close', () => ffmpeg.kill('SIGKILL'))
  })

  // Serve thumbnail
  router.get('/documents/:id/thumbnail', (req, res) => {
    const doc = docsDb.get(req.params.id)
    if (!doc || !doc.thumb_path || !fs.existsSync(doc.thumb_path)) {
      return res.status(404).json({ error: 'Thumbnail not available' })
    }

    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=604800')
    fs.createReadStream(doc.thumb_path).pipe(res)
  })

  // Serve sanitized HTML preview (strips scripts/iframes/event handlers)
  router.get('/documents/:id/preview', (req, res) => {
    const doc = docsDb.get(req.params.id)
    if (!doc || doc.content_type !== 'html') {
      return res.status(404).json({ error: 'HTML preview not available' })
    }
    if (!doc.file_path || !fs.existsSync(doc.file_path)) {
      return res.status(404).json({ error: 'File not available' })
    }

    let html = fs.readFileSync(doc.file_path, 'utf8')

    // Strip dangerous elements
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '')
    html = html.replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    html = html.replace(/<iframe[^>]*\/>/gi, '')
    html = html.replace(/<object[\s\S]*?<\/object>/gi, '')
    html = html.replace(/<embed[^>]*\/?>/gi, '')
    html = html.replace(/<noscript[\s\S]*?<\/noscript>/gi, '')

    // Strip event handlers from all tags
    html = html.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '')

    // Strip javascript: URLs
    html = html.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')

    // Inject base tag for relative asset resolution and basic styling override
    const baseUrl = doc.source_url || ''
    const baseTag = baseUrl ? `<base href="${baseUrl.replace(/"/g, '&quot;')}" target="_blank">` : ''
    const styleOverride = `<style>
      body { background: #fff !important; color: #1a1a1a !important; max-width: 100% !important;
             overflow-x: hidden !important; font-family: system-ui, sans-serif !important; }
      img { max-width: 100% !important; height: auto !important; }
      .noscript, .js-required { display: none !important; }
    </style>`

    if (html.includes('<head')) {
      html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}${styleOverride}`)
    } else if (html.includes('<html')) {
      html = html.replace(/<html([^>]*)>/i, `<html$1><head>${baseTag}${styleOverride}</head>`)
    } else {
      html = `${baseTag}${styleOverride}${html}`
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.setHeader('Content-Security-Policy', "script-src 'none'; object-src 'none';")
    res.send(html)
  })

  // Return extracted text
  router.get('/documents/:id/text', (req, res) => {
    const text = docsDb.getText(req.params.id)
    if (!text) {
      return res.status(404).json({ error: 'No extracted text available' })
    }
    res.json({ text })
  })

  // Archive stats
  router.get('/stats', (req, res) => {
    const stats = docsDb.stats()
    const archiver = archiverRef.current
    stats.peerCount = archiver ? archiver.peerCount : 0
    stats.connected = archiver ? archiver.swarm !== null : false
    res.json(stats)
  })

  // Data set listing — enriched with torrent info
  router.get('/datasets', (req, res) => {
    const stats = docsDb.stats()
    const collections = docsDb.listCollections()
    const collectionMap = Object.fromEntries(collections.map(c => [c.id, c]))

    const datasets = (docsDb.config.dataSets || []).map((ds) => {
      const col = collectionMap[ds.id]
      return {
        id: ds.id,
        name: ds.name,
        description: ds.description,
        fileCount: stats.byDataSet[String(ds.id)] || 0,
        totalSize: docsDb.getDatasetTotalSize(ds.id),
        magnetLink: col ? col.magnet_link : null,
        hasTorrent: col ? !!col.torrent_path : false
      }
    })
    res.json(datasets)
  })

  // Single dataset detail
  router.get('/datasets/:id', (req, res) => {
    const dsId = parseInt(req.params.id, 10)
    const dsConfig = docsDb.config.dataSets.find(d => d.id === dsId)
    if (!dsConfig) {
      return res.status(404).json({ error: 'Dataset not found' })
    }

    const col = docsDb.getCollection(dsId)
    const stats = docsDb.stats()

    res.json({
      id: dsConfig.id,
      name: dsConfig.name,
      description: dsConfig.description,
      fileCount: stats.byDataSet[String(dsId)] || 0,
      totalSize: docsDb.getDatasetTotalSize(dsId),
      magnetLink: col ? col.magnet_link : null,
      hasTorrent: col ? !!col.torrent_path : false
    })
  })

  // Serve .torrent file for dataset
  router.get('/datasets/:id/torrent', (req, res) => {
    if (!torrentManager) {
      return res.status(503).json({ error: 'Torrent manager not available' })
    }

    const dsId = parseInt(req.params.id, 10)
    const torrentPath = torrentManager.getTorrentPath(dsId)
    if (!torrentPath) {
      return res.status(404).json({ error: 'Torrent not available for this dataset' })
    }

    const dsConfig = docsDb.config.dataSets.find(d => d.id === dsId)
    const fileName = dsConfig
      ? `${dsConfig.name.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')}.torrent`
      : `dataset_${dsId}.torrent`

    res.setHeader('Content-Type', 'application/x-bittorrent')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    fs.createReadStream(torrentPath).pipe(res)
  })

  // Collections listing (datasets + upload collections)
  router.get('/collections', (req, res) => {
    const collections = docsDb.listCollections()
    res.json(collections.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      hasTorrent: !!c.torrent_path,
      magnetLink: c.magnet_link
    })))
  })

  // --- Feature 1: Transcript endpoint ---
  router.get('/documents/:id/transcript', (req, res) => {
    const doc = docsDb.get(req.params.id)
    if (!doc || !doc.transcript) return res.status(404).json({ error: 'No transcript available' })
    res.json({ transcript: doc.transcript })
  })

  // --- Feature 3: Entity endpoints ---
  router.get('/documents/:id/entities', (req, res) => {
    try {
      const entities = docsDb.getDocumentEntities(req.params.id)
      res.json({ entities })
    } catch (err) {
      console.error('[docs-api] Entity fetch error:', err.message)
      res.status(500).json({ error: 'Failed to fetch entities' })
    }
  })

  router.get('/entities', (req, res) => {
    try {
      const type = req.query.type || undefined
      const limit = Math.min(parseInt(req.query.limit) || 50, 200)
      const entities = docsDb.getTopEntities(type, limit).map(e => ({
        id: e.id, name: e.name, type: e.type, documentCount: e.document_count
      }))
      res.json({ entities })
    } catch (err) {
      console.error('[docs-api] Top entities error:', err.message)
      res.status(500).json({ error: 'Failed to fetch entities' })
    }
  })

  router.get('/entities/graph', (req, res) => {
    try {
      const minShared = parseInt(req.query.minShared) || 5
      const limit = Math.min(parseInt(req.query.limit) || 2000, 5000)
      const edges = docsDb.getEntityCooccurrences(minShared, limit)
      // Collect unique entity IDs from edges
      const entityIds = new Set()
      const limitedEdges = edges
      for (const e of limitedEdges) {
        entityIds.add(e.source)
        entityIds.add(e.target)
      }
      // Fetch entity details
      const nodes = []
      for (const eid of entityIds) {
        const entity = docsDb.db.prepare(`
          SELECT e.id, e.name, e.type, COUNT(de.document_id) as document_count
          FROM entities e LEFT JOIN document_entities de ON de.entity_id = e.id
          WHERE e.id = ? GROUP BY e.id
        `).get(eid)
        if (entity) nodes.push(entity)
      }
      res.json({
        nodes: nodes.map(n => ({ id: n.id, name: n.name, type: n.type, documentCount: n.document_count })),
        edges: limitedEdges.map(e => ({ source: e.source, target: e.target, sharedDocs: e.shared_docs }))
      })
    } catch (err) {
      console.error('[docs-api] Entity graph error:', err.message)
      res.status(500).json({ error: 'Failed to build entity graph' })
    }
  })

  router.get('/entities/search', (req, res) => {
    try {
      const q = req.query.q || ''
      const type = req.query.type || undefined
      const limit = Math.min(parseInt(req.query.limit) || 50, 200)
      const offset = parseInt(req.query.offset) || 0
      const result = docsDb.searchEntities(q, type, limit, offset)
      res.json({
        entities: result.entities.map(e => ({
          id: e.id, name: e.name, type: e.type, normalizedName: e.normalized_name,
          documentCount: e.document_count, description: e.description || null
        })),
        total: result.total
      })
    } catch (err) {
      console.error('[docs-api] Entity search error:', err.message)
      res.status(500).json({ error: 'Failed to search entities' })
    }
  })

  router.get('/entities/relationship-types', (req, res) => {
    try {
      const types = docsDb.getRelationshipTypes()
      res.json({ types: types.map(t => ({ type: t.relationship_type, count: t.count })) })
    } catch (err) {
      console.error('[docs-api] Relationship types error:', err.message)
      res.status(500).json({ error: 'Failed to fetch relationship types' })
    }
  })

  router.get('/entities/:id', (req, res) => {
    try {
      const entity = docsDb.getEntity(parseInt(req.params.id))
      if (!entity) return res.status(404).json({ error: 'Entity not found' })
      let aliases = []
      let externalUrls = {}
      try { aliases = JSON.parse(entity.aliases || '[]') } catch {}
      try { externalUrls = JSON.parse(entity.external_urls || '{}') } catch {}
      res.json({
        id: entity.id, name: entity.name, type: entity.type,
        normalizedName: entity.normalized_name, documentCount: entity.document_count,
        description: entity.description || null,
        aliases,
        photoUrl: entity.photo_url || null,
        externalUrls
      })
    } catch (err) {
      console.error('[docs-api] Entity detail error:', err.message)
      res.status(500).json({ error: 'Failed to fetch entity' })
    }
  })

  router.get('/entities/:id/relationships', (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 200)
      const rows = docsDb.getEntityRelationships(parseInt(req.params.id), limit)
      res.json({
        relationships: rows.map(r => ({
          id: r.id,
          relationshipType: r.relationship_type,
          description: r.description || null,
          sourceDocumentId: r.source_document_id || null,
          direction: r.direction,
          otherEntity: { id: r.other_id, name: r.other_name, type: r.other_type }
        }))
      })
    } catch (err) {
      console.error('[docs-api] Entity relationships error:', err.message)
      res.status(500).json({ error: 'Failed to fetch relationships' })
    }
  })

  router.get('/entities/:id/related', (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 100)
      const related = docsDb.getRelatedEntities(parseInt(req.params.id), limit)
      res.json({
        entities: related.map(e => ({
          id: e.id, name: e.name, type: e.type, sharedDocuments: e.shared_documents
        }))
      })
    } catch (err) {
      console.error('[docs-api] Related entities error:', err.message)
      res.status(500).json({ error: 'Failed to fetch related entities' })
    }
  })

  router.get('/entities/:id/documents', (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 200)
      const offset = parseInt(req.query.offset) || 0
      const result = docsDb.getEntityDocuments(parseInt(req.params.id), limit, offset)
      res.json({
        documents: result.documents.map(r => ({
          ...rowToDoc(r),
          mentionCount: r.mention_count
        })),
        total: result.total
      })
    } catch (err) {
      console.error('[docs-api] Entity documents error:', err.message)
      res.status(500).json({ error: 'Failed to fetch entity documents' })
    }
  })

  // --- Entity question generation ---
  router.get('/entities/:id/questions', async (req, res) => {
    try {
      const id = parseInt(req.params.id)
      const entity = docsDb.getEntity(id)
      if (!entity) return res.status(404).json({ error: 'Entity not found' })

      // Check cache
      const cached = docsDb.getEntityQuestions(id)
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
      if (cached && (Date.now() - cached.generated_at) < SEVEN_DAYS) {
        return res.json({ questions: JSON.parse(cached.questions), generatedAt: cached.generated_at })
      }

      // Gather context — include document excerpts for more specific questions
      const relationships = docsDb.getEntityRelationships(id)
      const related = docsDb.getRelatedEntities(id)
      const docs = docsDb.getEntityDocuments(id, 10, 0)
      const docTitles = docs.documents.map(d => d.title).filter(Boolean)

      const contextLines = [
        `Entity: ${entity.name}`,
        `Type: ${entity.type}`,
        `Appears in ${entity.document_count} documents.`
      ]
      if (relationships.length > 0) {
        contextLines.push('Known relationships:')
        for (const r of relationships.slice(0, 15)) {
          const dir = r.direction === 'outgoing' ? `→ ${r.other_name}` : `${r.other_name} →`
          contextLines.push(`  ${dir} (${r.relationship_type}${r.description ? ': ' + r.description : ''})`)
        }
      }
      if (related.length > 0) {
        contextLines.push('Frequently co-occurring entities:')
        contextLines.push('  ' + related.slice(0, 10).map(e => `${e.name} (${e.shared_documents} shared docs)`).join(', '))
      }
      if (docTitles.length > 0) {
        contextLines.push('Sample document titles:')
        for (const t of docTitles) {
          contextLines.push(`  - ${t}`)
        }
      }

      // Include short excerpts from top documents for specificity
      const excerpts = []
      for (const doc of docs.documents.slice(0, 5)) {
        try {
          const text = docsDb.getText(doc.id)
          if (!text) continue
          // Find paragraph mentioning the entity name
          const nameLower = entity.name.toLowerCase()
          const paragraphs = text.split(/\n\s*\n/)
          const relevant = paragraphs.find(p => p.toLowerCase().includes(nameLower) && p.length > 50 && p.length < 500)
          if (relevant) excerpts.push(`[${doc.title}]: ${relevant.trim().slice(0, 300)}`)
        } catch {}
      }
      if (excerpts.length > 0) {
        contextLines.push('Excerpts from key documents:')
        for (const e of excerpts) contextLines.push(`  ${e}`)
      }

      const GROQ_API_KEY = process.env.GROQ_API_KEY
      if (!GROQ_API_KEY) {
        const fallback = [
          `What role did ${entity.name} play in the events documented in this archive?`,
          `What financial connections exist between ${entity.name} and other entities in these documents?`,
          `What timeline of events can be constructed around ${entity.name} from the available records?`,
          `Are there undisclosed meetings or communications involving ${entity.name}?`,
          `What patterns emerge from ${entity.name}'s appearances across different document sets?`,
          `Who are the key associates of ${entity.name} based on document co-occurrences?`
        ]
        return res.json({ questions: fallback, generatedAt: Date.now() })
      }

      const systemPrompt = `You generate investigative questions for a searchable document archive containing 1.4 million DOJ Epstein documents (court filings, FBI reports, depositions, financial records, flight logs, emails). Given context about an entity, generate 6-8 specific, pointed questions that reference concrete names, dates, or events from the provided context.

RULES:
- Each question MUST reference at least one specific name, document, relationship, or detail from the context — never generic questions like "What role did X play?"
- Questions should be answerable by searching the archive — include specific terms a search engine could match
- Focus on unexplained connections, financial flows, timeline gaps, and contradictions
- Reference specific related entities by name when possible
- Vary question types: financial, timeline, relationship, evidentiary

Return JSON only: {"questions": ["question 1", "question 2", ...]}
/no_think`

      const userPrompt = contextLines.join('\n')

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'qwen/qwen3-32b',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 1000,
          response_format: { type: 'json_object' }
        })
      })

      if (!groqRes.ok) {
        console.error('[docs-api] Groq API error:', groqRes.status, await groqRes.text())
        return res.status(502).json({ error: 'Question generation failed' })
      }

      const groqData = await groqRes.json()
      let content = groqData.choices?.[0]?.message?.content || '{}'
      // Strip any <think> tags that may appear
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      const parsed = JSON.parse(content)
      const questions = Array.isArray(parsed.questions) ? parsed.questions : []

      docsDb.setEntityQuestions(id, questions)
      const now = Date.now()
      res.json({ questions, generatedAt: now })
    } catch (err) {
      console.error('[docs-api] Entity questions error:', err.message)
      res.status(500).json({ error: 'Failed to generate entity questions' })
    }
  })

  // --- Feature 4: Financial endpoints ---
  router.get('/documents/:id/financials', (req, res) => {
    try {
      const records = docsDb.getDocumentFinancials(req.params.id)
      res.json({
        records: records.map(r => ({
          id: r.id, documentId: r.document_id, type: r.record_type,
          amount: r.amount, currency: r.currency, date: r.date,
          from: r.from_entity, to: r.to_entity, description: r.description
        }))
      })
    } catch (err) {
      console.error('[docs-api] Financial records error:', err.message)
      res.status(500).json({ error: 'Failed to fetch financial records' })
    }
  })

  router.get('/analysis/financial/summary', (req, res) => {
    try {
      const summary = docsDb.getFinancialSummary()
      res.json(summary)
    } catch (err) {
      console.error('[docs-api] Financial summary error:', err.message)
      res.status(500).json({ error: 'Failed to build financial summary' })
    }
  })

  router.get('/analysis/financial/records', (req, res) => {
    try {
      const entity = req.query.entity
      const from = req.query.from || null
      const to = req.query.to || null
      const limit = Math.min(parseInt(req.query.limit) || 50, 200)
      const offset = parseInt(req.query.offset) || 0

      if (entity) {
        const records = docsDb.getFinancialsByEntity(entity, limit)
        return res.json({
          records: records.map(r => ({
            id: r.id, documentId: r.document_id, type: r.record_type,
            amount: r.amount, currency: r.currency, date: r.date,
            from: r.from_entity, to: r.to_entity, description: r.description
          })),
          total: records.length
        })
      }

      const result = docsDb.getFinancialsByDateRange(from, to, limit, offset)
      res.json({
        records: result.records.map(r => ({
          id: r.id, documentId: r.document_id, type: r.record_type,
          amount: r.amount, currency: r.currency, date: r.date,
          from: r.from_entity, to: r.to_entity, description: r.description
        })),
        total: result.total
      })
    } catch (err) {
      console.error('[docs-api] Financial records error:', err.message)
      res.status(500).json({ error: 'Failed to fetch financial records' })
    }
  })

  // Linked documents (parent/child, extractions, etc.)
  router.get('/documents/:id/linked', (req, res) => {
    try {
      const rows = docsDb.getLinkedDocuments(req.params.id)
      res.json(rows.map(r => ({
        id: r.id,
        title: r.title,
        fileName: r.file_name,
        dataSet: r.data_set,
        contentType: r.content_type,
        category: r.category,
        fileSize: r.file_size,
        pageCount: r.page_count,
        hasThumbnail: !!r.thumb_path,
        hasContent: !!r.file_path,
        linkType: r.link_type,
        linkDescription: r.link_description,
        direction: r.direction
      })))
    } catch (err) {
      console.error('[docs-api] Linked documents error:', err.message)
      res.status(500).json({ error: 'Failed to fetch linked documents' })
    }
  })

  return router
}

module.exports = createDocumentsRouter
