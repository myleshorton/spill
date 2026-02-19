/**
 * Manages video publishing and fetching via Hyperdrive.
 *
 * Videos are stored in a Hyperdrive (distributed filesystem).
 * Each node has its own drive for publishing; remote drives are
 * opened by key for fetching.
 */
const EventEmitter = require('bare-events')
const Hyperdrive = require('hyperdrive')
const fs = require('bare-fs')
const path = require('bare-path')
const crypto = require('hypercore-crypto')

class VideoManager extends EventEmitter {
  constructor (store, dataDir) {
    super()
    this.store = store
    this.drive = null
    this.drives = new Map()
    this._seededDrives = new Set()
    this._seedListPath = dataDir ? path.join(dataDir, 'seeded-drives.json') : null
  }

  async _ensureDrive () {
    if (this.drive) return
    this.drive = new Hyperdrive(this.store, { name: 'spill-local' })
    await this.drive.ready()
    this.drives.set(this.drive.key.toString('hex'), this.drive)
    console.log('[video] Local drive ready, key:', this.drive.key.toString('hex'))
  }

  async _emitProgress (progress, stage) {
    this.emit('publishProgress', { progress, stage })
    // Yield to the event loop so the IPC write flushes before we continue
    // (especially before synchronous blocking calls like readFileSync)
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  async startSeeding () {
    if (!this._seedListPath) return
    try {
      const data = fs.readFileSync(this._seedListPath, 'utf8')
      const keys = JSON.parse(data)
      for (const key of keys) {
        this._seededDrives.add(key)
        this.openDrive(key).catch(err => {
          console.error('[video] Failed to re-open seeded drive', key.slice(0, 8) + ':', err.message)
        })
      }
      console.log('[video] Re-seeding', keys.length, 'drives from previous sessions')
    } catch (e) {
      // File doesn't exist yet — nothing to seed
    }
  }

  _trackDrive (driveKeyHex) {
    if (this._seededDrives.has(driveKeyHex)) return
    // Don't track our own local drive
    if (this.drive && driveKeyHex === this.drive.key.toString('hex')) return
    this._seededDrives.add(driveKeyHex)
    if (!this._seedListPath) return
    try {
      fs.writeFileSync(this._seedListPath, JSON.stringify([...this._seededDrives]))
    } catch (e) {
      console.error('[video] Failed to save seed list:', e.message)
    }
  }

  async publish ({ videoPath, title, description, thumbnailPath, category, contentType, fileName }) {
    await this._emitProgress(0.0, 'Preparing...')
    await this._ensureDrive()

    const id = crypto.randomBytes(16).toString('hex')
    const timestamp = Date.now()

    // Derive extension from fileName, falling back to contentType defaults
    let ext = '.mp4'
    if (fileName) {
      const dotIdx = fileName.lastIndexOf('.')
      if (dotIdx >= 0) ext = fileName.substring(dotIdx).toLowerCase()
    } else if (contentType === 'audio') {
      ext = '.mp3'
    } else if (contentType === 'image') {
      ext = '.jpg'
    } else if (contentType === 'document') {
      ext = '.pdf'
    }

    const resolvedContentType = contentType || 'video'
    const fileKey = '/content/' + id + ext

    // Read and store file in the drive
    await this._emitProgress(0.1, 'Reading file...')
    const fileData = fs.readFileSync(videoPath)
    await this._emitProgress(0.4, 'Writing to drive...')
    await this.drive.put(fileKey, fileData)

    // Store thumbnail if provided
    let thumbKey = null
    if (thumbnailPath) {
      await this._emitProgress(0.7, 'Processing thumbnail...')
      thumbKey = '/thumbnails/' + id + '.jpg'
      const thumbData = fs.readFileSync(thumbnailPath)
      await this.drive.put(thumbKey, thumbData)
    }

    await this._emitProgress(0.85, 'Saving metadata...')

    const meta = {
      id,
      title: title || 'Untitled',
      description: description || '',
      category: category || null,
      fileKey,
      videoKey: fileKey, // backward compat
      contentType: resolvedContentType,
      thumbKey,
      driveKey: this.drive.key.toString('hex'),
      timestamp,
      peerCount: 0
    }

    // Store metadata as JSON in the drive
    const metaKey = '/meta/' + id + '.json'
    await this.drive.put(metaKey, Buffer.from(JSON.stringify(meta)))

    console.log('[video] Published:', title, 'type:', resolvedContentType, 'key:', id)
    return meta
  }

  async openDrive (driveKeyHex) {
    let drive = this.drives.get(driveKeyHex)
    if (drive) return drive
    drive = new Hyperdrive(this.store, Buffer.from(driveKeyHex, 'hex'))
    await drive.ready()
    this.drives.set(driveKeyHex, drive)
    return drive
  }

  async fetch ({ driveKey, videoKey, destPath }) {
    await this._ensureDrive()

    const drive = await this.openDrive(driveKey)

    // Download the video file
    const data = await drive.get(videoKey)
    if (!data) throw new Error('Video not found on drive')

    // Ensure destination directory exists
    const dir = path.dirname(destPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(destPath, data)
    this._trackDrive(driveKey)
    console.log('[video] Fetched to:', destPath)
    return destPath
  }

  async getVideoEntry ({ driveKey, videoKey }) {
    const drive = await this.openDrive(driveKey)
    const entry = await drive.entry(videoKey)
    if (!entry) return null
    return { totalSize: entry.value.blob.byteLength }
  }

  async readVideoRange ({ driveKey, videoKey, start, end }) {
    const drive = await this.openDrive(driveKey)
    const chunks = []
    const stream = drive.createReadStream(videoKey, { start, end })
    for await (const chunk of stream) {
      chunks.push(chunk)
    }
    this._trackDrive(driveKey)
    return Buffer.concat(chunks).toString('base64')
  }

  async delete ({ id }) {
    await this._ensureDrive()

    const metaKey = '/meta/' + id + '.json'

    // Read metadata to find the actual file path
    let fileKey = '/videos/' + id + '.mp4' // fallback for old data
    let thumbKey = '/thumbnails/' + id + '.jpg'
    try {
      const metaData = await this.drive.get(metaKey)
      if (metaData) {
        const meta = JSON.parse(metaData.toString())
        fileKey = meta.fileKey || meta.videoKey || fileKey
        if (meta.thumbKey) thumbKey = meta.thumbKey
      }
    } catch (e) { /* use defaults */ }

    try { await this.drive.del(fileKey) } catch (e) { /* may not exist */ }
    try { await this.drive.del(thumbKey) } catch (e) { /* may not exist */ }
    try { await this.drive.del(metaKey) } catch (e) { /* may not exist */ }

    console.log('[video] Deleted:', id)
  }

  async listLocalVideos () {
    await this._ensureDrive()
    const entries = []

    // List all metadata files
    for await (const entry of this.drive.list('/meta/')) {
      const data = await this.drive.get(entry.key)
      if (data) {
        entries.push(JSON.parse(data.toString()))
      }
    }

    return entries
  }
}

module.exports = VideoManager
