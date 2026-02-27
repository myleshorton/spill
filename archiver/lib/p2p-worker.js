/**
 * P2P worker — runs Corestore, Hyperswarm, and torrent generation in a
 * separate process so the main HTTP server event loop stays responsive.
 */
const Corestore = require('corestore')
const Archiver = require('./archiver')
const TorrentManager = require('./torrent-manager')
const DocumentsDatabase = require('./documents-db')

const STORE_PATH = process.env.STORE_PATH
const CONTENT_DIR = process.env.CONTENT_DIR
const DOCS_DB_PATH = process.env.DOCS_DB_PATH
const DHT_PORT = process.env.DHT_PORT ? parseInt(process.env.DHT_PORT, 10) : null

async function main () {
  const store = new Corestore(STORE_PATH)
  const archiver = new Archiver(store, CONTENT_DIR, { port: DHT_PORT })

  // Forward archiver events to parent process
  archiver.on('videoDiscovered', (meta) => {
    process.send({ type: 'videoDiscovered', meta })
  })
  archiver.on('videoArchived', ({ id, videoPath, thumbPath }) => {
    process.send({ type: 'videoArchived', id, videoPath, thumbPath })
  })
  archiver.on('videoDeleted', (id) => {
    process.send({ type: 'videoDeleted', id })
  })
  archiver.on('videoPublished', (meta) => {
    process.send({ type: 'videoPublished', meta })
  })

  await archiver.start()
  process.send({ type: 'started' })

  // Generate torrents (uses its own DB connection since we're in a child process)
  const docsDb = new DocumentsDatabase(DOCS_DB_PATH)
  const torrentManager = new TorrentManager()

  try {
    await torrentManager.generateAll(docsDb)
    process.send({ type: 'torrentsDone' })
  } catch (err) {
    console.warn('[p2p-worker] Torrent generation failed:', err.message)
  }

  // Keep running for P2P networking
  process.on('SIGINT', async () => {
    await archiver.destroy()
    docsDb.close()
    process.exit(0)
  })
}

main().catch(err => {
  console.error('[p2p-worker] Fatal:', err.message)
  process.exit(1)
})
