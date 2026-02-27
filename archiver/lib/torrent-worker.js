/**
 * Worker thread for CPU-intensive torrent generation.
 * Runs createTorrent in an isolated thread so the main event loop stays responsive.
 */
const { workerData, parentPort } = require('worker_threads')
const createTorrent = require('create-torrent')
const fs = require('fs')

const { filePaths, opts, torrentPath } = workerData

const input = filePaths.length === 1 ? filePaths[0] : filePaths

createTorrent(input, opts, (err, torrent) => {
  if (err) {
    parentPort.postMessage({ error: err.message })
    return
  }
  fs.writeFileSync(torrentPath, torrent)
  parentPort.postMessage({ ok: true, torrentPath })
})
