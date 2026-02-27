/**
 * Express routes for the document archive API.
 * Sits alongside the existing /api/videos routes.
 */
const express = require('express')
const path = require('path')
const fs = require('fs')

const archiveConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'archive-config.json'), 'utf8')
)

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
    hasThumbnail: !!row.thumb_path
  }
}

function createDocumentsRouter (docsDb, searchIndex, archiverRef, torrentManager) {
  const router = express.Router()

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

    const datasets = archiveConfig.dataSets.map((ds) => {
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
    const dsConfig = archiveConfig.dataSets.find(d => d.id === dsId)
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

    const dsConfig = archiveConfig.dataSets.find(d => d.id === dsId)
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

  return router
}

module.exports = createDocumentsRouter
