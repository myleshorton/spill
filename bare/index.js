/**
 * Samizdat Bare Worklet Entry Point
 *
 * This JS runs inside a Bare runtime worklet, started by the native C bridge.
 * It provides P2P networking via Holepunch (Hyperswarm, Hyperdrive, Hypercore)
 * and communicates with the Flutter UI via JSON-RPC over IPC.
 *
 * In bare-kit worklets, IPC is provided as BareKit.IPC — a Duplex stream
 * backed by bare-ipc/bare-pipe over OS-level pipe file descriptors.
 */

const ipc = BareKit.IPC

// Prevent unhandled rejections from crashing the worklet process.
// Bare calls abort() on unhandled rejections by default.
Bare.on('unhandledRejection', (reason, promise) => {
  const msg = reason && reason.stack ? reason.stack : String(reason)
  console.error('[spill] Unhandled rejection:', msg)
})

Bare.on('uncaughtException', (err) => {
  const msg = err && err.stack ? err.stack : String(err)
  console.error('[spill] Uncaught exception:', msg)
})

const RpcHandler = require('./lib/rpc-handler')
const VideoManager = require('./lib/video-manager')
const FeedManager = require('./lib/feed-manager')
const IdentityManager = require('./lib/identity-manager')
const SearchManager = require('./lib/search-manager')
const Corestore = require('corestore')
const path = require('bare-path')

const rpc = new RpcHandler(ipc)

let dataDir = null
let store = null
let videoManager = null
let feedManager = null
let identityManager = null
let searchManager = null

// --- RPC Methods ---

rpc.register('ping', async () => {
  return 'pong'
})

rpc.register('startNode', async (params) => {
  dataDir = params.dataDir || '/tmp/samizdat'

  // Load or create persistent identity
  identityManager = new IdentityManager(dataDir)
  await identityManager.load()
  const swarmSeed = identityManager.getSwarmSeed()

  // Single shared Corestore for both managers
  store = new Corestore(path.join(dataDir, 'cores'))

  videoManager = new VideoManager(store, dataDir)
  feedManager = new FeedManager(store, { seed: swarmSeed })

  // Wire up discovery notifications — eagerly open the drive so replication
  // starts immediately and we can reseed this content to other peers.
  feedManager.on('videoDiscovered', (meta) => {
    if (meta.driveKey) {
      videoManager.openDrive(meta.driveKey).catch(err => {
        console.error('[bare] Failed to open drive:', err.message)
      })
    }
    rpc.notify('onVideoDiscovered', meta)
  })

  // Wire up publish progress notifications
  videoManager.on('publishProgress', (data) => {
    rpc.notify('onPublishProgress', data)
  })

  // Wire up video deletion notifications from peers
  feedManager.on('videoDeleted', (id) => {
    rpc.notify('onVideoDeleted', { id })
  })

  await feedManager.start()
  await videoManager.startSeeding()

  searchManager = new SearchManager(feedManager, feedManager.swarm)
  searchManager.on('searchResults', ({ searchId, results, source }) => {
    rpc.notify('onSearchResults', { searchId, results, source })
  })
  searchManager.start()

  return feedManager.getNodeId()
})

rpc.register('publishVideo', async (params) => {
  if (!videoManager) throw new Error('Node not started')
  const meta = await videoManager.publish(params)
  // Inject publisher identity into metadata
  if (identityManager) {
    const profile = identityManager.getProfile()
    meta.publisherKey = profile.publicKey
    if (profile.username) meta.publisherName = profile.username
  }
  // Announce to the catalog so peers discover it
  rpc.notify('onPublishProgress', { progress: 0.95, stage: 'Announcing...' })
  await feedManager.announceVideo(meta)
  rpc.notify('onPublishProgress', { progress: 1.0, stage: 'Complete' })
  // Yield so the 1.0 notification flushes before the RPC response
  await new Promise(resolve => setTimeout(resolve, 0))
  return meta
})

rpc.register('getVideos', async (params) => {
  if (!feedManager) return []
  return feedManager.listVideos(params ? params.category : null)
})

rpc.register('getMyVideos', async () => {
  if (!feedManager) return []
  return feedManager.listMyVideos()
})

rpc.register('getRecentVideos', async (params) => {
  if (!feedManager) return { videos: [], cursor: null }
  return feedManager.getRecentVideos({
    limit: params.limit || 20,
    cursor: params.cursor || null,
    category: params.category || null
  })
})

rpc.register('getPopularVideos', async (params) => {
  if (!feedManager) return { videos: [], hasMore: false }
  return feedManager.getPopularVideos({
    limit: params.limit || 20,
    offset: params.offset || 0,
    category: params.category || null
  })
})

rpc.register('searchContent', async (params) => {
  if (!searchManager) throw new Error('Node not started')
  const query = params.query
  if (!query || typeof query !== 'string') throw new Error('Query string is required')
  return searchManager.searchNetwork(query.trim())
})

rpc.register('fetchVideo', async (params) => {
  if (!videoManager) throw new Error('Node not started')
  try {
    return await videoManager.fetch(params)
  } catch (err) {
    if (searchManager && params.driveKey) {
      const meta = feedManager.knownVideos.find(
        v => v.driveKey === params.driveKey && (v.fileKey === params.videoKey || v.videoKey === params.videoKey)
      )
      if (meta) searchManager.invalidateContent(meta.id)
    }
    throw err
  }
})

rpc.register('getVideoEntry', async (params) => {
  if (!videoManager) throw new Error('Node not started')
  return videoManager.getVideoEntry(params)
})

rpc.register('readVideoRange', async (params) => {
  if (!videoManager) throw new Error('Node not started')
  return videoManager.readVideoRange(params)
})

rpc.register('deleteVideo', async (params) => {
  if (!videoManager) throw new Error('Node not started')
  await videoManager.delete(params)
  await feedManager.removeVideo(params.id)
  return { success: true }
})

rpc.register('getNodeId', async () => {
  if (!feedManager) throw new Error('Node not started')
  return feedManager.getNodeId()
})

rpc.register('getProfile', async () => {
  if (!identityManager) throw new Error('Node not started')
  return identityManager.getProfile()
})

rpc.register('checkUsername', async (params) => {
  if (!identityManager || !feedManager) throw new Error('Node not started')
  const dht = feedManager.swarm.swarm.dht
  return identityManager.checkUsername(dht, params.username)
})

rpc.register('setUsername', async (params) => {
  if (!identityManager || !feedManager) throw new Error('Node not started')
  const dht = feedManager.swarm.swarm.dht
  return identityManager.setUsername(dht, params.username)
})

console.log('[spill] Bare worklet started, waiting for RPC messages...')
