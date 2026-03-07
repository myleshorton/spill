const express = require('express')
const multer = require('multer')
const path = require('path')
const rateLimit = require('express-rate-limit')

const UPLOAD_TEMP = path.join(__dirname, '..', 'data', 'uploads_tmp')
const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif',
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv',
  '.mp3', '.wav', '.flac', '.m4a', '.ogg',
  '.doc', '.docx', '.xls', '.xlsx', '.txt', '.rtf', '.eml', '.msg'
])

function createUploadRouter (docsDb, uploadProcessor) {
  const router = express.Router()

  // Rate limit: 50 uploads per hour per IP
  const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 50,
    keyGenerator: (req) => req.headers['x-real-ip'] || req.ip,
    message: { error: 'Upload rate limit exceeded. Try again later.' }
  })

  // Disk storage — never buffer 500MB files in memory
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const fs = require('fs')
      if (!fs.existsSync(UPLOAD_TEMP)) fs.mkdirSync(UPLOAD_TEMP, { recursive: true })
      cb(null, UPLOAD_TEMP)
    },
    filename: (req, file, cb) => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const ext = path.extname(file.originalname).toLowerCase()
      cb(null, `${unique}${ext}`)
    }
  })

  const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase()
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return cb(new Error(`File type ${ext} not allowed`))
      }
      cb(null, true)
    }
  })

  // POST /api/upload — submit a file
  router.post('/upload', uploadLimiter, (req, res) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.` })
          }
          return res.status(400).json({ error: err.message })
        }
        return res.status(400).json({ error: err.message })
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' })
      }

      const result = uploadProcessor.enqueue(req.file.path, req.file.originalname)
      res.json(result)
    })
  })

  // GET /api/upload/:jobId/status — check processing status
  router.get('/upload/:jobId/status', (req, res) => {
    const status = uploadProcessor.getStatus(req.params.jobId)
    if (!status) {
      return res.status(404).json({ error: 'Job not found' })
    }
    res.json(status)
  })

  // GET /api/collections — list all collections
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

module.exports = createUploadRouter
