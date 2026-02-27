/**
 * Express HTTP API for the archiver.
 */
const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } })

const MIME_TYPES = {
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac',
  '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.pdf': 'application/pdf', '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain', '.rtf': 'application/rtf',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

function getMimeType (filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_TYPES[ext] || 'application/octet-stream'
}

function createRouter (db, archiverRef) {
  const router = express.Router()

  // List all videos (optional category filter)
  router.get('/videos', (req, res) => {
    const limit = parseInt(req.query.limit) || 50
    const offset = parseInt(req.query.offset) || 0
    const category = req.query.category || null
    const videos = db.listAll(limit, offset, category)
    res.json(videos.map(rowToMeta))
  })

  // Full-text search
  router.get('/videos/search', (req, res) => {
    const q = req.query.q
    if (!q || q.trim().length === 0) {
      return res.json([])
    }
    const limit = parseInt(req.query.limit) || 50
    const offset = parseInt(req.query.offset) || 0
    try {
      const videos = db.search(q, limit, offset)
      res.json(videos.map(rowToMeta))
    } catch (err) {
      res.status(400).json({ error: 'Invalid search query' })
    }
  })

  // Single video metadata
  router.get('/videos/:id', (req, res) => {
    const video = db.get(req.params.id)
    if (!video) {
      return res.status(404).json({ error: 'Video not found' })
    }
    res.json(rowToMeta(video))
  })

  // Stream content file (local disk fast-path, Hyperdrive fallback)
  router.get('/stream/:id', async (req, res) => {
    const video = db.get(req.params.id)
    if (!video) {
      return res.status(404).json({ error: 'Content not found' })
    }

    const contentType = getMimeType(video.video_path || video.video_key || '.mp4')

    // Fast path: serve from local disk
    if (video.video_path && fs.existsSync(video.video_path)) {
      const stat = fs.statSync(video.video_path)
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
        fs.createReadStream(video.video_path, { start, end }).pipe(res)
      } else {
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': contentType
        })
        fs.createReadStream(video.video_path).pipe(res)
      }
      return
    }

    // Fallback: stream on-demand from Hyperdrive
    if (!video.drive_key || !video.video_key) {
      return res.status(404).json({ error: 'Content not yet archived and no drive info available' })
    }

    try {
      if (!archiverRef.current) return res.status(503).json({ error: 'P2P network starting up' })
      const drive = await archiverRef.current.openDrive(video.drive_key)
      const node = await drive.entry(video.video_key)
      if (!node) {
        return res.status(404).json({ error: 'Content not found in Hyperdrive' })
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
        drive.createReadStream(video.video_key, { start, end }).pipe(res)
      } else {
        res.writeHead(200, {
          'Content-Length': totalSize,
          'Content-Type': contentType
        })
        drive.createReadStream(video.video_key).pipe(res)
      }
    } catch (err) {
      console.error('[api] Hyperdrive stream error:', err)
      res.status(500).json({ error: 'Failed to stream from Hyperdrive' })
    }
  })

  // Serve thumbnail (local disk fast-path, Hyperdrive fallback)
  router.get('/thumb/:id', async (req, res) => {
    const video = db.get(req.params.id)
    if (!video) {
      return res.status(404).json({ error: 'Thumbnail not found' })
    }

    // Fast path: serve from local disk
    if (video.thumb_path && fs.existsSync(video.thumb_path)) {
      res.setHeader('Content-Type', 'image/jpeg')
      fs.createReadStream(video.thumb_path).pipe(res)
      return
    }

    // Fallback: stream on-demand from Hyperdrive
    if (!video.drive_key || !video.thumb_key) {
      return res.status(404).json({ error: 'Thumbnail not yet archived and no drive info available' })
    }

    try {
      if (!archiverRef.current) return res.status(503).json({ error: 'P2P network starting up' })
      const drive = await archiverRef.current.openDrive(video.drive_key)
      const node = await drive.entry(video.thumb_key)
      if (!node) {
        return res.status(404).json({ error: 'Thumbnail not found in Hyperdrive' })
      }

      res.setHeader('Content-Type', 'image/jpeg')
      drive.createReadStream(video.thumb_key).pipe(res)
    } catch (err) {
      console.error('[api] Hyperdrive thumb stream error:', err)
      res.status(500).json({ error: 'Failed to stream thumbnail from Hyperdrive' })
    }
  })

  // List locally-published videos
  router.get('/my-videos', (req, res) => {
    const limit = parseInt(req.query.limit) || 50
    const offset = parseInt(req.query.offset) || 0
    const videos = db.listLocal(limit, offset)
    res.json(videos.map(rowToMeta))
  })

  // Publish a new video (multipart upload)
  router.post('/videos', upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
  ]), async (req, res) => {
    try {
      const videoFile = req.files && req.files.video && req.files.video[0]
      if (!videoFile) {
        return res.status(400).json({ error: 'Video file is required' })
      }
      const title = req.body.title
      if (!title || title.trim().length === 0) {
        return res.status(400).json({ error: 'Title is required' })
      }
      const thumbFile = req.files.thumbnail && req.files.thumbnail[0]
      if (!archiverRef.current) return res.status(503).json({ error: 'P2P network starting up' })
      const result = await archiverRef.current.publish({
        videoData: videoFile.buffer,
        thumbData: thumbFile ? thumbFile.buffer : null,
        title: title.trim(),
        description: (req.body.description || '').trim(),
        contentType: req.body.contentType || null,
        fileName: req.body.fileName || videoFile.originalname || null,
        category: req.body.category || null
      })
      res.status(201).json(rowToMeta({
        id: result.id,
        title: result.title,
        description: result.description,
        drive_key: result.driveKey,
        video_key: result.fileKey || result.videoKey,
        thumb_key: result.thumbKey,
        timestamp: result.timestamp,
        peer_count: result.peerCount || 0,
        content_type: result.contentType || 'video',
        category: result.category || null,
        archived_at: Date.now(),
        video_path: result.videoPath,
        thumb_path: result.thumbPath
      }))
    } catch (err) {
      console.error('[api] Publish error:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // Delete a video
  router.delete('/videos/:id', async (req, res) => {
    try {
      const video = db.get(req.params.id)
      if (!video) {
        return res.status(404).json({ error: 'Video not found' })
      }
      if (!archiverRef.current) return res.status(503).json({ error: 'P2P network starting up' })
      await archiverRef.current.deleteVideo(req.params.id)
      res.json({ ok: true })
    } catch (err) {
      console.error('[api] Delete error:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // Stats
  router.get('/stats', (req, res) => {
    const stats = db.stats()
    const archiver = archiverRef.current
    stats.peerCount = archiver ? archiver.peerCount : 0
    stats.connected = archiver ? archiver.swarm !== null : false
    stats.nodeId = archiver ? archiver.nodeId : null
    res.json(stats)
  })

  return router
}

// Convert a database row (snake_case) to API response (camelCase)
function rowToMeta (row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    driveKey: row.drive_key,
    fileKey: row.video_key,
    videoKey: row.video_key, // backward compat
    thumbKey: row.thumb_key,
    timestamp: row.timestamp,
    peerCount: row.peer_count,
    contentType: row.content_type || 'video',
    category: row.category || null,
    archivedAt: row.archived_at,
    videoPath: row.video_path ? true : false,
    thumbPath: row.thumb_path ? true : false
  }
}

module.exports = createRouter
