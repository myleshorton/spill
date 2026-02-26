/**
 * Samizdat Web Archiver
 *
 * Entry point: creates Corestore, starts the P2P archiver and HTTP server.
 * Wires archiver events to the SQLite database.
 * Also serves the Epstein document archive API via Meilisearch.
 */
const Corestore = require('corestore')
const express = require('express')
const cors = require('cors')
const path = require('path')

const ArchiveDatabase = require('./lib/database')
const Archiver = require('./lib/archiver')
const createRouter = require('./lib/api')
const DocumentsDatabase = require('./lib/documents-db')
const SearchIndex = require('./lib/meilisearch')
const createDocumentsRouter = require('./lib/documents-api')
const TorrentManager = require('./lib/torrent-manager')
const VirusScanner = require('./lib/virus-scanner')
const UploadProcessor = require('./lib/upload-processor')
const createUploadRouter = require('./lib/upload-api')
const UsersDatabase = require('./lib/users-db')
const createUsersRouter = require('./lib/users-api')

const DATA_DIR = path.join(__dirname, 'data')
const CONTENT_DIR = path.join(DATA_DIR, 'content')
const DB_PATH = path.join(DATA_DIR, 'archive.db')
const DOCS_DB_PATH = path.join(DATA_DIR, 'documents.db')
const USERS_DB_PATH = path.join(DATA_DIR, 'users.db')
const STORE_PATH = path.join(DATA_DIR, 'corestore')
const PORT = process.env.PORT || 4000
const WEB_DIR = path.join(__dirname, '..', 'build', 'web')

async function main () {
  console.log('[main] Starting Samizdat archiver...')

  // Initialize databases
  const db = new ArchiveDatabase(DB_PATH)
  console.log('[main] Video database ready')

  const docsDb = new DocumentsDatabase(DOCS_DB_PATH)
  console.log('[main] Documents database ready (%d documents)', docsDb.count())

  const usersDb = new UsersDatabase(USERS_DB_PATH)
  console.log('[main] Users database ready')

  // Initialize Meilisearch
  const searchIndex = new SearchIndex()
  try {
    await searchIndex.setup()
    console.log('[main] Meilisearch index configured')
  } catch (err) {
    console.warn('[main] Meilisearch not available:', err.message)
    console.warn('[main] Search will be unavailable until Meilisearch is running')
  }

  // Initialize Corestore and archiver
  const store = new Corestore(STORE_PATH)
  const archiver = new Archiver(store, CONTENT_DIR)

  // Wire archiver events to database
  archiver.on('videoDiscovered', (meta) => {
    db.upsert(meta)
  })

  archiver.on('videoArchived', ({ id, videoPath, thumbPath }) => {
    db.updatePaths(id, videoPath, thumbPath)
    console.log('[main] Archived video', id)
  })

  archiver.on('videoDeleted', (id) => {
    db.remove(id)
    console.log('[main] Removed video', id)
  })

  archiver.on('videoPublished', (meta) => {
    db.upsert(meta)
    db.updatePaths(meta.id, meta.videoPath, meta.thumbPath)
    console.log('[main] Published video', meta.id)
  })

  // Initialize torrent manager
  const torrentManager = new TorrentManager()
  try {
    await torrentManager.generateAll(docsDb)
    console.log('[main] Torrent generation complete')
  } catch (err) {
    console.warn('[main] Torrent generation failed (non-fatal):', err.message)
  }

  // Start P2P networking
  await archiver.start()
  console.log('[main] P2P archiver running')

  // Initialize upload system
  const virusScanner = new VirusScanner()
  const uploadProcessor = new UploadProcessor(docsDb, searchIndex, archiver, virusScanner, torrentManager)
  console.log('[main] Upload processor ready')

  // Start HTTP server
  const app = express()
  app.use(cors({ exposedHeaders: ['X-User-ID'] }))

  // Documents API (archive) — registered first so /stats serves document stats
  app.use('/api', createDocumentsRouter(docsDb, searchIndex, archiver, torrentManager))

  // Video API (existing)
  app.use('/api', createRouter(db, archiver))

  // Upload API
  app.use('/api', createUploadRouter(docsDb, uploadProcessor))

  // Users & recommendations API
  app.use('/api', createUsersRouter(docsDb, usersDb))

  // Serve Flutter web app (static files)
  app.use(express.static(WEB_DIR))
  app.get('*', (req, res) => {
    const indexPath = path.join(WEB_DIR, 'index.html')
    const fs = require('fs')
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath)
    } else {
      res.status(404).send('Web app not built. Run: make web')
    }
  })

  const server = app.listen(PORT, () => {
    console.log(`[main] HTTP server listening on http://localhost:${PORT}`)
  })
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[main] Port ${PORT} is already in use. Kill the other process or set PORT=<number>`)
    } else {
      console.error('[main] Server error:', err)
    }
    process.exit(1)
  })

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[main] Shutting down...')
    await archiver.destroy()
    db.close()
    docsDb.close()
    usersDb.close()
    process.exit(0)
  })
}

main().catch(err => {
  console.error('[main] Fatal error:', err)
  process.exit(1)
})
