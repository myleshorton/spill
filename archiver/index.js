/**
 * Samizdat Web Archiver
 *
 * Entry point: creates Corestore, starts the P2P archiver and HTTP server.
 * Wires archiver events to the SQLite database.
 */
const Corestore = require('corestore')
const express = require('express')
const cors = require('cors')
const path = require('path')

const ArchiveDatabase = require('./lib/database')
const Archiver = require('./lib/archiver')
const createRouter = require('./lib/api')

const DATA_DIR = path.join(__dirname, 'data')
const CONTENT_DIR = path.join(DATA_DIR, 'content')
const DB_PATH = path.join(DATA_DIR, 'archive.db')
const STORE_PATH = path.join(DATA_DIR, 'corestore')
const PORT = process.env.PORT || 3000
const WEB_DIR = path.join(__dirname, '..', 'build', 'web')

async function main () {
  console.log('[main] Starting Samizdat archiver...')

  // Initialize database
  const db = new ArchiveDatabase(DB_PATH)
  console.log('[main] Database ready')

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

  // Start P2P networking
  await archiver.start()
  console.log('[main] P2P archiver running')

  // Start HTTP server
  const app = express()
  app.use(cors())
  app.use('/api', createRouter(db, archiver))

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
    process.exit(0)
  })
}

main().catch(err => {
  console.error('[main] Fatal error:', err)
  process.exit(1)
})
