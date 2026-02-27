const createTorrent = require('create-torrent')
const parseTorrent = require('parse-torrent')
const fs = require('fs')
const path = require('path')
const http = require('http')
const { Worker } = require('worker_threads')

const TORRENT_DIR = path.join(__dirname, '..', 'data', 'torrents')
const TRANSMISSION_URL = process.env.TRANSMISSION_URL || 'http://transmission:9091/transmission/rpc'

class TorrentManager {
  constructor (options = {}) {
    this.domain = options.domain || process.env.DOMAIN || 'localhost'
    this.transmissionUrl = options.transmissionUrl || TRANSMISSION_URL
    this._sessionId = null

    if (!fs.existsSync(TORRENT_DIR)) {
      fs.mkdirSync(TORRENT_DIR, { recursive: true })
    }
  }

  generateDatasetTorrent (datasetId, files, datasetName) {
    if (!files || files.length === 0) {
      return Promise.reject(new Error(`No files for dataset ${datasetId}`))
    }

    const filePaths = files.map(f => f.file_path).filter(Boolean)
    if (filePaths.length === 0) {
      return Promise.reject(new Error(`No local file paths for dataset ${datasetId}`))
    }

    // Compute total size for adaptive piece length
    const totalSize = files.reduce((sum, f) => sum + (f.file_size || 0), 0)
    let pieceLength
    if (totalSize < 256 * 1024 * 1024) pieceLength = 256 * 1024        // <256MB: 256KB pieces
    else if (totalSize < 1024 * 1024 * 1024) pieceLength = 512 * 1024   // <1GB: 512KB pieces
    else if (totalSize < 8 * 1024 * 1024 * 1024) pieceLength = 1024 * 1024 // <8GB: 1MB pieces
    else pieceLength = 2 * 1024 * 1024                                  // 8GB+: 2MB pieces

    // WebSeed URLs — one per file via the content API
    const webSeeds = files
      .filter(f => f.file_path)
      .map(f => `https://${this.domain}/api/documents/${f.id}/content`)

    const torrentPath = path.join(TORRENT_DIR, `ds${datasetId}.torrent`)
    const opts = {
      name: datasetName || `Dataset ${datasetId}`,
      pieceLength,
      comment: `Archive dataset ${datasetId} — distributed via Spill`,
      createdBy: 'spill-archive',
      urlList: webSeeds,
      announceList: [
        ['udp://tracker.opentrackr.org:1337/announce'],
        ['udp://open.tracker.cl:1337/announce'],
        ['udp://tracker.openbittorrent.com:6969/announce']
      ]
    }

    // Run in a worker thread so the main event loop stays responsive
    return new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, 'torrent-worker.js'), {
        workerData: { filePaths, opts, torrentPath }
      })
      worker.on('message', (msg) => {
        if (msg.error) return reject(new Error(msg.error))
        console.log('[torrent] Generated %s (%d files, %d bytes)', torrentPath, filePaths.length, totalSize)
        resolve(msg.torrentPath)
      })
      worker.on('error', reject)
    })
  }

  async addToTransmission (torrentPath) {
    const torrentData = fs.readFileSync(torrentPath).toString('base64')
    const body = JSON.stringify({
      method: 'torrent-add',
      arguments: { metainfo: torrentData }
    })

    try {
      const result = await this._transmissionRpc(body)
      const added = result.arguments['torrent-added'] || result.arguments['torrent-duplicate']
      if (added) {
        console.log('[torrent] Added to transmission: %s (id=%d)', added.name, added.id)
      }
      return result
    } catch (err) {
      console.error('[torrent] Transmission RPC error:', err.message)
      throw err
    }
  }

  getMagnetLink (datasetId) {
    const torrentPath = path.join(TORRENT_DIR, `ds${datasetId}.torrent`)
    if (!fs.existsSync(torrentPath)) return null

    const buf = fs.readFileSync(torrentPath)
    const parsed = parseTorrent(buf)
    return parseTorrent.toMagnetURI(parsed)
  }

  getTorrentPath (datasetId) {
    const p = path.join(TORRENT_DIR, `ds${datasetId}.torrent`)
    return fs.existsSync(p) ? p : null
  }

  async generateAll (docsDb) {
    const collections = docsDb.listCollections()
    let generated = 0
    let skipped = 0

    for (const col of collections) {
      const files = docsDb.getDatasetFilePaths(col.id)
      if (files.length === 0) continue

      // Skip if torrent file exists and DB already has the metadata
      const existingPath = this.getTorrentPath(col.id)
      if (existingPath && col.torrent_hash && col.magnet_link) {
        skipped++
        continue
      }

      // Yield the event loop between datasets so the HTTP server stays responsive
      await new Promise(resolve => setImmediate(resolve))

      // If the file exists but DB metadata is missing, parse it
      if (existingPath) {
        try {
          const parsed = parseTorrent(fs.readFileSync(existingPath))
          const magnet = parseTorrent.toMagnetURI(parsed)
          docsDb.updateCollectionTorrent(col.id, parsed.infoHash, magnet, existingPath)
          skipped++
          continue
        } catch (err) {
          console.warn('[torrent] Existing torrent for ds%d is corrupt, regenerating', col.id)
          fs.unlinkSync(existingPath)
        }
      }

      try {
        const torrentPath = await this.generateDatasetTorrent(col.id, files, col.name)
        const parsed = parseTorrent(fs.readFileSync(torrentPath))
        const magnet = parseTorrent.toMagnetURI(parsed)

        docsDb.updateCollectionTorrent(col.id, parsed.infoHash, magnet, torrentPath)

        try {
          await this.addToTransmission(torrentPath)
        } catch (err) {
          console.warn('[torrent] Could not add to transmission (service may be unavailable):', err.message)
        }

        generated++
      } catch (err) {
        console.error('[torrent] Failed to generate for collection %d:', col.id, err.message)
      }
    }

    console.log('[torrent] Torrents: %d generated, %d reused (of %d datasets)', generated, skipped, collections.length)
    return generated
  }

  _transmissionRpc (body) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.transmissionUrl)
      const options = {
        hostname: url.hostname,
        port: url.port || 9091,
        path: url.pathname,
        method: 'POST',
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }

      if (this._sessionId) {
        options.headers['X-Transmission-Session-Id'] = this._sessionId
      }

      const req = http.request(options, (res) => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          if (res.statusCode === 409) {
            // Session ID dance — retry with new session ID
            this._sessionId = res.headers['x-transmission-session-id']
            this._transmissionRpc(body).then(resolve, reject)
            return
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`Transmission RPC returned ${res.statusCode}: ${data}`))
          }
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(new Error('Invalid JSON from Transmission'))
          }
        })
      })

      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Transmission RPC timed out after 30s'))
      })
      req.on('error', reject)
      req.write(body)
      req.end()
    })
  }
}

module.exports = TorrentManager
