const createTorrent = require('create-torrent')
const parseTorrent = require('parse-torrent')
const fs = require('fs')
const path = require('path')
const http = require('http')

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
    return new Promise((resolve, reject) => {
      if (!files || files.length === 0) {
        return reject(new Error(`No files for dataset ${datasetId}`))
      }

      const filePaths = files.map(f => f.file_path).filter(Boolean)
      if (filePaths.length === 0) {
        return reject(new Error(`No local file paths for dataset ${datasetId}`))
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

      // For single file, pass the path directly; for multiple, pass array
      const input = filePaths.length === 1 ? filePaths[0] : filePaths

      createTorrent(input, opts, (err, torrent) => {
        if (err) return reject(err)

        const torrentPath = path.join(TORRENT_DIR, `ds${datasetId}.torrent`)
        fs.writeFileSync(torrentPath, torrent)
        console.log('[torrent] Generated %s (%d files, %d bytes)', torrentPath, filePaths.length, totalSize)
        resolve(torrentPath)
      })
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

    for (const col of collections) {
      const files = docsDb.getDatasetFilePaths(col.id)
      if (files.length === 0) continue

      try {
        const torrentPath = await this.generateDatasetTorrent(col.id, files, col.name)
        const magnet = this.getMagnetLink(col.id)
        const parsed = parseTorrent(fs.readFileSync(torrentPath))
        const hash = parsed.infoHash

        docsDb.updateCollectionTorrent(col.id, hash, magnet, torrentPath)

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

    console.log('[torrent] Generated %d/%d dataset torrents', generated, collections.length)
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

      req.on('error', reject)
      req.write(body)
      req.end()
    })
  }
}

module.exports = TorrentManager
