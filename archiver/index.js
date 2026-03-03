/**
 * Samizdat Web Archiver
 *
 * Entry point: creates Corestore, starts the P2P archiver and HTTP server.
 * Wires archiver events to the SQLite database.
 * Also serves the document archive API via Meilisearch.
 */
const express = require('express')
const cors = require('cors')
const path = require('path')

const ArchiveDatabase = require('./lib/database')
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
const createChatRouter = require('./lib/chat-api')

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

  // Initialize torrent manager (generation runs in child process)
  const torrentManager = new TorrentManager()

  // Initialize upload system
  const virusScanner = new VirusScanner()
  const uploadProcessor = new UploadProcessor(docsDb, searchIndex, null, virusScanner, torrentManager)
  console.log('[main] Upload processor ready')

  // Start HTTP server first so the API is available during slow startup tasks
  const app = express()
  app.use(cors({ exposedHeaders: ['X-User-ID'] }))

  // P2P archiver runs in a child process; pass null ref to routes
  const archiverRef = { current: null }

  // Documents API (archive) — registered first so /stats serves document stats
  app.use('/api', createDocumentsRouter(docsDb, searchIndex, archiverRef, torrentManager))

  // Video API (existing)
  app.use('/api', createRouter(db, archiverRef))

  // Upload API
  app.use('/api', createUploadRouter(docsDb, uploadProcessor))

  // Users & recommendations API
  app.use('/api', createUsersRouter(docsDb, usersDb))

  // Chat / RAG API
  app.use('/api', createChatRouter(docsDb, searchIndex))

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

  // Start P2P networking and torrent generation in a child process
  // so the HTTP API stays responsive during heavy Corestore operations
  const { fork } = require('child_process')
  const p2pWorker = fork(path.join(__dirname, 'lib', 'p2p-worker.js'), [], {
    env: {
      ...process.env,
      STORE_PATH,
      CONTENT_DIR,
      DHT_PORT: process.env.DHT_PORT || '',
      DOCS_DB_PATH,
      DB_PATH,
      DOMAIN: process.env.DOMAIN || 'localhost'
    }
  })
  p2pWorker.on('message', (msg) => {
    if (msg.type === 'started') {
      console.log('[main] P2P archiver running (child process)')
    } else if (msg.type === 'torrentsDone') {
      console.log('[main] Torrent generation complete')
    } else if (msg.type === 'videoDiscovered') {
      db.upsert(msg.meta)
    } else if (msg.type === 'videoArchived') {
      db.updatePaths(msg.id, msg.videoPath, msg.thumbPath)
      console.log('[main] Archived video', msg.id)
    } else if (msg.type === 'videoDeleted') {
      db.remove(msg.id)
      console.log('[main] Removed video', msg.id)
    } else if (msg.type === 'videoPublished') {
      db.upsert(msg.meta)
      db.updatePaths(msg.meta.id, msg.meta.videoPath, msg.meta.thumbPath)
      console.log('[main] Published video', msg.meta.id)
    }
  })
  p2pWorker.on('exit', (code) => {
    if (code) console.warn('[main] P2P worker exited with code', code)
  })

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[main] Shutting down...')
    p2pWorker.kill('SIGINT')
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
