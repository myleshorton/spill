/**
 * P2P archiver: joins the Samizdat swarm, discovers videos, and
 * eagerly downloads all content to local storage.
 *
 * Adapts the patterns from bare/lib/feed-manager.js and
 * bare/lib/video-manager.js for standard Node.js.
 */
const EventEmitter = require('events')
const Hyperswarm = require('hyperswarm')
const Hyperdrive = require('hyperdrive')
const Protomux = require('protomux')
const c = require('compact-encoding')
const crypto = require('hypercore-crypto')
const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')

class Archiver extends EventEmitter {
  constructor (store, contentDir, opts = {}) {
    super()
    this.store = store
    this.contentDir = contentDir
    this._dhtPort = opts.port || null
    this.swarm = null
    this.catalog = null
    this.localDrive = null
    this.drives = new Map()
    this.peerCatalogs = new Map()
    this._seenIds = new Set()
    this._downloadQueue = []
    this._downloading = false
    this._topic = crypto.hash(Buffer.from('samizdat-global-feed'))
  }

  async start () {
    // Create local catalog (we don't publish, but need it for protocol handshake)
    this.catalog = this.store.get({ name: 'samizdat-catalog' })
    await this.catalog.ready()
    console.log('[archiver] Catalog ready, key:', this.catalog.key.toString('hex').slice(0, 16) + '...')

    // Create a single persistent local drive for all publishes
    this.localDrive = new Hyperdrive(this.store, { name: 'samizdat-local' })
    await this.localDrive.ready()
    this.drives.set(this.localDrive.key.toString('hex'), this.localDrive)
    console.log('[archiver] Local drive ready, key:', this.localDrive.key.toString('hex').slice(0, 16) + '...')

    // Ensure content directories exist
    fs.mkdirSync(path.join(this.contentDir, 'videos'), { recursive: true })
    fs.mkdirSync(path.join(this.contentDir, 'thumbs'), { recursive: true })

    // Start the swarm
    const swarmOpts = {}
    if (this._dhtPort) swarmOpts.port = this._dhtPort
    this.swarm = new Hyperswarm(swarmOpts)
    if (this._dhtPort) {
      console.log('[archiver] DHT listening on fixed port', this._dhtPort)
    }
    const discovery = this.swarm.join(this._topic, { server: true, client: true })
    discovery.flushed().then(() => {
      console.log('[archiver] DHT discovery flushed')
    }).catch(err => {
      console.error('[archiver] DHT flush error:', err.message)
    })

    this.swarm.on('connection', (socket, peerInfo) => {
      const peerKeyHex = peerInfo.publicKey.toString('hex')
      console.log('[archiver] Peer connected:', peerKeyHex.slice(0, 8))

      this.store.replicate(socket)

      const mux = Protomux.from(socket)
      const channel = mux.createChannel({
        protocol: 'samizdat/catalog',
        messages: [
          {
            encoding: c.buffer,
            onmessage: (key) => this._handleRemoteCatalogKey(key, peerKeyHex)
          }
        ],
        onopen: () => {
          console.log('[archiver] Catalog channel open with', peerKeyHex.slice(0, 8))
          channel.messages[0].send(this.catalog.key)
        }
      })
      channel.open()

      this.emit('peerConnected', peerKeyHex)
    })

    this.swarm.on('close', () => {
      this.emit('peerDisconnected')
    })

    console.log('[archiver] Joined samizdat topic, listening for peers...')
  }

  _handleRemoteCatalogKey (key, peerKeyHex) {
    const keyHex = key.toString('hex')
    console.log('[archiver] Received catalog key from', peerKeyHex.slice(0, 8) + ':', keyHex.slice(0, 16) + '...')

    if (keyHex === this.catalog.key.toString('hex')) return
    if (this.peerCatalogs.has(keyHex)) return

    const remote = this.store.get({ key })
    this.peerCatalogs.set(keyHex, { core: remote, lastRead: 0 })
    this._watchCatalog(remote, keyHex)
  }

  async _watchCatalog (core, catalogKeyHex) {
    try {
      await core.ready()
      console.log('[archiver] Watching remote catalog', catalogKeyHex.slice(0, 16) + '..., entries:', core.length)

      await this._readNewEntries(core, catalogKeyHex)

      core.on('append', () => {
        this._readNewEntries(core, catalogKeyHex)
      })
    } catch (err) {
      console.error('[archiver] Error watching catalog', catalogKeyHex.slice(0, 16) + ':', err.message)
    }
  }

  async _readNewEntries (core, catalogKeyHex) {
    const state = this.peerCatalogs.get(catalogKeyHex)
    if (!state) return

    const start = state.lastRead
    const end = core.length

    for (let i = start; i < end; i++) {
      try {
        const entry = await core.get(i)
        if (entry) {
          const meta = JSON.parse(entry.toString())
          if (meta.type === 'delete') {
            this._handleDelete(meta.id)
            continue
          }
          this._handleDiscover(meta)
        }
      } catch (err) {
        console.error('[archiver] Error reading catalog entry', i, ':', err.message)
      }
    }

    state.lastRead = end
  }

  _handleDiscover (meta) {
    if (!meta.id || this._seenIds.has(meta.id)) return
    this._seenIds.add(meta.id)
    console.log('[archiver] Discovered video:', meta.title, '(' + meta.id + ')')

    // Open the drive immediately so replication starts
    if (meta.driveKey) {
      this.openDrive(meta.driveKey).catch(err => {
        console.error('[archiver] Failed to open drive:', err.message)
      })
    }

    this.emit('videoDiscovered', meta)
    this._enqueueDownload(meta)
  }

  _handleDelete (id) {
    this._seenIds.delete(id)
    console.log('[archiver] Content deleted:', id)

    // Remove local files — try both old and new paths
    const thumbPath = path.join(this.contentDir, 'thumbs', id + '.jpg')
    try { fs.unlinkSync(thumbPath) } catch (e) { /* may not exist */ }

    // Remove from files/ dir (match any extension)
    const filesDir = path.join(this.contentDir, 'files')
    try {
      const files = fs.readdirSync(filesDir)
      for (const f of files) {
        if (f.startsWith(id + '.')) {
          fs.unlinkSync(path.join(filesDir, f))
        }
      }
    } catch (e) { /* dir may not exist */ }

    // Also try legacy videos/ path
    const legacyPath = path.join(this.contentDir, 'videos', id + '.mp4')
    try { fs.unlinkSync(legacyPath) } catch (e) { /* may not exist */ }

    this.emit('videoDeleted', id)
  }

  _enqueueDownload (meta) {
    this._downloadQueue.push(meta)
    this._processQueue()
  }

  async _processQueue () {
    if (this._downloading || this._downloadQueue.length === 0) return
    this._downloading = true

    while (this._downloadQueue.length > 0) {
      const meta = this._downloadQueue.shift()
      try {
        await this._downloadContent(meta)
      } catch (err) {
        console.error('[archiver] Download failed for', meta.id, ':', err.message)
      }
    }

    this._downloading = false
  }

  async _downloadContent (meta) {
    const drive = await this.openDrive(meta.driveKey)

    // Derive file extension from fileKey/videoKey
    const key = meta.fileKey || meta.videoKey
    const dotIdx = key.lastIndexOf('.')
    const ext = dotIdx >= 0 ? key.substring(dotIdx) : '.mp4'

    // Download content file
    fs.mkdirSync(path.join(this.contentDir, 'files'), { recursive: true })
    const videoPath = path.join(this.contentDir, 'files', meta.id + ext)
    if (!fs.existsSync(videoPath)) {
      console.log('[archiver] Downloading:', meta.title)
      const data = await drive.get(key)
      if (data) {
        fs.writeFileSync(videoPath, data)
        console.log('[archiver] Saved file:', videoPath)
      }
    }

    // Download thumbnail
    let thumbPath = null
    if (meta.thumbKey) {
      thumbPath = path.join(this.contentDir, 'thumbs', meta.id + '.jpg')
      if (!fs.existsSync(thumbPath)) {
        try {
          const thumbData = await drive.get(meta.thumbKey)
          if (thumbData) {
            fs.writeFileSync(thumbPath, thumbData)
            console.log('[archiver] Saved thumbnail:', thumbPath)
          }
        } catch (err) {
          console.error('[archiver] Thumbnail download failed:', err.message)
          thumbPath = null
        }
      }
    }

    this.emit('videoArchived', {
      id: meta.id,
      videoPath,
      thumbPath
    })
  }

  _generateThumbnail (videoPath) {
    return new Promise((resolve) => {
      const thumbPath = videoPath.replace(/\.mp4$/, '_thumb.jpg')
      execFile('ffmpeg', [
        '-i', videoPath,
        '-vframes', '1',
        '-vf', 'scale=640:-1',
        '-y',
        thumbPath
      ], (err) => {
        if (err) {
          console.error('[archiver] ffmpeg not available or failed:', err.message)
          return resolve(null)
        }
        try {
          const data = fs.readFileSync(thumbPath)
          fs.unlinkSync(thumbPath) // clean up temp file
          resolve(data)
        } catch (e) {
          resolve(null)
        }
      })
    })
  }

  async publish ({ videoData, thumbData, title, description, contentType, fileName, category }) {
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

    // Use the single persistent local drive for all publishes
    const drive = this.localDrive
    const driveKey = drive.key.toString('hex')

    // Write file to Hyperdrive
    const fileKey = '/content/' + id + ext
    await drive.put(fileKey, videoData)

    // Write thumbnail if provided
    let thumbKey = null
    if (thumbData) {
      thumbKey = '/thumbs/' + id + '.jpg'
      await drive.put(thumbKey, thumbData)
    }

    // Save file locally
    fs.mkdirSync(path.join(this.contentDir, 'files'), { recursive: true })
    const videoPath = path.join(this.contentDir, 'files', id + ext)
    fs.writeFileSync(videoPath, videoData)

    // Auto-generate thumbnail with ffmpeg for video content (if none provided)
    if (!thumbData && resolvedContentType === 'video') {
      try {
        thumbData = await this._generateThumbnail(videoPath)
        if (thumbData) {
          thumbKey = '/thumbs/' + id + '.jpg'
          await drive.put(thumbKey, thumbData)
        }
      } catch (err) {
        console.error('[archiver] Thumbnail generation failed:', err.message)
      }
    }

    // Save thumbnail locally
    const thumbPath = thumbData ? path.join(this.contentDir, 'thumbs', id + '.jpg') : null
    if (thumbData && thumbPath) {
      fs.writeFileSync(thumbPath, thumbData)
    }

    // Announce to catalog
    const meta = {
      id,
      title: title || 'Untitled',
      description: description || '',
      category: category || null,
      driveKey,
      fileKey,
      videoKey: fileKey, // backward compat
      contentType: resolvedContentType,
      thumbKey,
      timestamp,
      peerCount: 0,
      isLocal: true
    }
    await this.catalog.append(Buffer.from(JSON.stringify(meta)))

    this._seenIds.add(id)
    console.log('[archiver] Published:', title, 'type:', resolvedContentType, '(' + id + ')')

    this.emit('videoPublished', {
      ...meta,
      videoPath,
      thumbPath
    })

    return { ...meta, videoPath, thumbPath }
  }

  async deleteVideo (id) {
    // Append delete marker to catalog
    await this.catalog.append(Buffer.from(JSON.stringify({ type: 'delete', id })))
    this._handleDelete(id)
  }

  get nodeId () {
    if (!this.swarm) return null
    return this.swarm.keyPair?.publicKey?.toString('hex') || null
  }

  get peerCount () {
    if (!this.swarm) return 0
    return this.swarm.connections.size
  }

  async openDrive (driveKeyHex) {
    let drive = this.drives.get(driveKeyHex)
    if (drive) return drive
    drive = new Hyperdrive(this.store, Buffer.from(driveKeyHex, 'hex'))
    await drive.ready()
    this.drives.set(driveKeyHex, drive)
    return drive
  }

  async destroy () {
    if (this.swarm) {
      await this.swarm.destroy()
      this.swarm = null
    }
  }
}

module.exports = Archiver
