const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { EventEmitter } = require('events')

let transcriber = null
try {
  transcriber = require('../../ingest/lib/transcriber')
} catch {}

let embedder = null
try {
  embedder = require('../../ingest/lib/embedder')
} catch {}

let imageKeywords = null
try {
  imageKeywords = require('../../ingest/lib/image-keywords')
} catch {}

const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'content', 'uploads')

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif',
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv',
  '.mp3', '.wav', '.flac', '.m4a', '.ogg',
  '.doc', '.docx', '.xls', '.xlsx', '.txt', '.rtf', '.eml', '.msg'
])

const EXTENSION_TO_TYPE = {
  '.pdf': 'pdf',
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image',
  '.webp': 'image', '.bmp': 'image', '.tiff': 'image', '.tif': 'image',
  '.mp4': 'video', '.mov': 'video', '.avi': 'video', '.mkv': 'video',
  '.webm': 'video', '.wmv': 'video',
  '.mp3': 'audio', '.wav': 'audio', '.flac': 'audio', '.m4a': 'audio', '.ogg': 'audio',
  '.doc': 'document', '.docx': 'document', '.xls': 'spreadsheet', '.xlsx': 'spreadsheet',
  '.txt': 'text', '.rtf': 'document', '.eml': 'email', '.msg': 'email'
}

// Community uploads go into a special collection
const UPLOADS_COLLECTION_ID = 1000
const UPLOADS_COLLECTION_NAME = 'Community Uploads'

class UploadProcessor extends EventEmitter {
  constructor (docsDb, searchIndex, archiver, virusScanner, torrentManager) {
    super()
    this.docsDb = docsDb
    this.searchIndex = searchIndex
    this.archiver = archiver
    this.virusScanner = virusScanner
    this.torrentManager = torrentManager
    this.jobs = new Map()
    this._queue = []
    this._processing = false
    this._uploadsSinceLastTorrent = 0

    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true })
    }

    // Ensure the uploads collection exists
    const existing = this.docsDb.getCollection(UPLOADS_COLLECTION_ID)
    if (!existing) {
      this.docsDb.db.prepare(`
        INSERT OR IGNORE INTO collections (id, name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(UPLOADS_COLLECTION_ID, UPLOADS_COLLECTION_NAME, 'User-submitted documents', Date.now(), Date.now())
    }
  }

  enqueue (filePath, originalName) {
    const jobId = crypto.randomUUID()
    const job = {
      jobId,
      filePath,
      originalName,
      status: 'pending',
      documentId: null,
      error: null,
      createdAt: Date.now()
    }

    this.jobs.set(jobId, job)
    this._queue.push(jobId)
    this._processNext()

    return { jobId, status: 'pending' }
  }

  getStatus (jobId) {
    const job = this.jobs.get(jobId)
    if (!job) return null
    return {
      jobId: job.jobId,
      status: job.status,
      documentId: job.documentId,
      error: job.error
    }
  }

  async _processNext () {
    if (this._processing || this._queue.length === 0) return
    this._processing = true

    const jobId = this._queue.shift()
    const job = this.jobs.get(jobId)

    try {
      // 1. Validate extension
      const ext = path.extname(job.originalName).toLowerCase()
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        throw new Error(`File type ${ext} not allowed`)
      }

      // 2. Compute SHA-256
      job.status = 'scanning'
      this.emit('status', job)
      const hash = await this._hashFile(job.filePath)

      // 3. Dedup check
      const duplicate = this.docsDb.findByHash(hash)
      if (duplicate) {
        // Clean up temp file
        fs.unlinkSync(job.filePath)
        throw new Error(`Duplicate file — already exists as document ${duplicate.id}`)
      }

      // 4. Virus scan
      try {
        const scanResult = await this.virusScanner.scan(job.filePath)
        if (!scanResult.clean) {
          fs.unlinkSync(job.filePath)
          throw new Error(`File rejected: virus detected (${scanResult.virus})`)
        }
      } catch (err) {
        if (err.message.includes('virus detected') || err.message.includes('File rejected')) {
          throw err
        }
        // ClamAV unavailable — log warning but continue
        console.warn('[upload] ClamAV scan failed (continuing):', err.message)
      }

      // 5. Generate document ID and move file to permanent location
      job.status = 'extracting'
      this.emit('status', job)

      const docId = `upload-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
      const contentType = EXTENSION_TO_TYPE[ext] || 'unknown'
      const destDir = path.join(UPLOAD_DIR, String(UPLOADS_COLLECTION_ID))
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
      const destPath = path.join(destDir, `${docId}${ext}`)
      fs.renameSync(job.filePath, destPath)

      const stat = fs.statSync(destPath)

      // 6. Insert into database
      job.status = 'indexing'
      this.emit('status', job)

      this.docsDb.insert({
        id: docId,
        title: path.basename(job.originalName, ext),
        file_name: job.originalName,
        data_set: UPLOADS_COLLECTION_ID,
        content_type: contentType,
        file_size: stat.size,
        file_path: destPath,
        collection_id: UPLOADS_COLLECTION_ID,
        sha256_hash: hash,
        created_at: Date.now()
      })

      // 7. Transcribe audio/video
      let transcript = ''
      if (transcriber && (contentType === 'audio' || contentType === 'video')) {
        try {
          job.status = 'transcribing'
          this.emit('status', job)
          transcript = await transcriber.transcribe(destPath, contentType)
          if (transcript) {
            this.docsDb.db.prepare('UPDATE documents SET transcript = ? WHERE id = ?').run(transcript, docId)
          }
        } catch (err) {
          console.warn('[upload] Transcription failed for %s: %s', docId, err.message)
        }
      }

      // 7.5 Extract image keywords
      let keywords = null
      if (imageKeywords && contentType === 'image') {
        try {
          job.status = 'extracting keywords'
          this.emit('status', job)
          keywords = await imageKeywords.extractKeywords(destPath)
          if (keywords) {
            this.docsDb.setImageKeywords(docId, keywords)
          }
        } catch (err) {
          console.warn('[upload] Image keyword extraction failed for %s: %s', docId, err.message)
        }
      }

      // 8. Index in Meilisearch
      try {
        const searchDoc = {
          id: docId,
          title: path.basename(job.originalName, ext),
          file_name: job.originalName,
          data_set: UPLOADS_COLLECTION_ID,
          content_type: contentType,
          file_size: stat.size,
          created_at: Date.now(),
          hasContent: true,
          hasThumbnail: false
        }
        if (transcript) searchDoc.transcript = transcript
        if (keywords) searchDoc.image_keywords = keywords
        await this.searchIndex.addDocuments([searchDoc])
      } catch (err) {
        console.warn('[upload] Meilisearch indexing failed:', err.message)
      }

      // 9. Generate embedding
      if (embedder) {
        try {
          const embText = [path.basename(job.originalName, ext), transcript].filter(Boolean).join('\n\n')
          if (embText.length >= 20) {
            const emb = await embedder.embed(embText)
            if (emb) {
              this.docsDb.setEmbedding(docId, embedder.toBuffer(emb))
            }
          }
        } catch (err) {
          console.warn('[upload] Embedding failed for %s: %s', docId, err.message)
        }
      }

      // 10. Publish to Hyperdrive
      if (this.archiver && this.archiver.localDrive) {
        try {
          const driveKey = this.archiver.localDrive.key.toString('hex')
          const fileKey = `/uploads/${docId}${ext}`
          await this.archiver.localDrive.put(fileKey, fs.readFileSync(destPath))
          this.docsDb.updateDriveInfo(docId, driveKey, fileKey)
        } catch (err) {
          console.warn('[upload] Hyperdrive publish failed:', err.message)
        }
      }

      // 11. Mark complete
      job.status = 'complete'
      job.documentId = docId
      this.emit('status', job)
      console.log('[upload] Processed %s → %s', job.originalName, docId)

      // 12. Periodic torrent regeneration
      this._uploadsSinceLastTorrent++
      if (this._uploadsSinceLastTorrent >= 10 && this.torrentManager) {
        this._uploadsSinceLastTorrent = 0
        this.torrentManager.generateAll(this.docsDb).catch(err => {
          console.warn('[upload] Torrent regen failed:', err.message)
        })
      }
    } catch (err) {
      job.status = 'failed'
      job.error = err.message
      this.emit('status', job)
      console.error('[upload] Job %s failed: %s', jobId, err.message)

      // Clean up temp file if it still exists
      if (fs.existsSync(job.filePath)) {
        try { fs.unlinkSync(job.filePath) } catch {}
      }
    } finally {
      this._processing = false
      this._processNext()
    }
  }

  _hashFile (filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const stream = fs.createReadStream(filePath)
      stream.on('data', chunk => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }
}

module.exports = UploadProcessor
