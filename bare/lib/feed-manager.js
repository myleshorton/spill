/**
 * Manages the video discovery feed.
 *
 * Connects to the Hyperswarm network, replicates Corestores with peers,
 * and discovers new videos via a Hyperbee catalog. Each node stores
 * video metadata in a sorted B-tree with structured keys:
 *   video:<timestamp>:<authorId>:<fileId>
 *
 * When peers connect, catalog keys are exchanged via a Protomux channel,
 * enabling automatic discovery. Changes are detected via diff streams.
 *
 * A separate local-only Hyperbee (recentBee) indexes all discovered videos
 * (both local and from peers) to support paginated "recent" queries.
 */
const EventEmitter = require('bare-events')
const Hyperbee = require('hyperbee')
const SwarmManager = require('./swarm-manager')
const Protomux = require('protomux')
const c = require('compact-encoding')

// Max entries to sync from each remote catalog on first discovery.
// Newer entries are fetched first; older content is not fetched.
const TAIL_SYNC_LIMIT = 50

// Catalog entries older than this are ignored during sync.
// Content is still accessible by drive key — just not discoverable.
const CATALOG_WINDOW_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

// Max videos held in the in-memory discovery list.
const MAX_VIDEOS = 500

class FeedManager extends EventEmitter {
  constructor (store, opts = {}) {
    super()
    this.store = store
    this.swarm = new SwarmManager({ seed: opts.seed })
    this.catalogBee = null
    this.recentBee = null
    this.knownVideos = []
    this._myVideos = []
    this._seenIds = new Set()
    this.peerCatalogs = new Map() // peerKeyHex → { bee, lastVersion }
  }

  _makeKey (meta) {
    const ts = String(meta.timestamp).padStart(16, '0')
    const author = (meta.publisherKey || 'unknown').slice(0, 16)
    return `video:${ts}:${author}:${meta.id}`
  }

  _makeCatKey (meta) {
    if (!meta.category) return null
    const ts = String(meta.timestamp).padStart(16, '0')
    const author = (meta.publisherKey || 'unknown').slice(0, 16)
    return `cat:${meta.category}:video:${ts}:${author}:${meta.id}`
  }

  async start () {
    // Create our local catalog Hyperbee (sorted B-tree on Hypercore)
    const core = this.store.get({ name: 'spill-catalog-bee' })
    this.catalogBee = new Hyperbee(core, {
      keyEncoding: 'utf-8',
      valueEncoding: 'json'
    })
    await this.catalogBee.ready()
    console.log('[feed] Catalog bee ready, key:', this.catalogBee.core.key.toString('hex').slice(0, 16) + '...')

    // Create local-only index for all discovered videos (not replicated to peers)
    const recentCore = this.store.get({ name: 'spill-recent-index' })
    this.recentBee = new Hyperbee(recentCore, {
      keyEncoding: 'utf-8',
      valueEncoding: 'json'
    })
    await this.recentBee.ready()
    console.log('[feed] Recent index ready, entries:', this.recentBee.version)

    // Load existing local catalog entries
    const stream = this.catalogBee.createReadStream({ gte: 'video:', lt: 'video;' })
    for await (const { key, value: meta } of stream) {
      if (meta && meta.id && !this._seenIds.has(meta.id)) {
        this._seenIds.add(meta.id)
        this.knownVideos.unshift(meta)
        this._myVideos.unshift(meta)
      }
    }

    await this.swarm.start()

    // When peers connect, replicate and exchange catalog keys
    this.swarm.onConnection((socket, peerInfo) => {
      const peerKeyHex = peerInfo.publicKey.toString('hex')
      console.log('[feed] Peer connected:', peerKeyHex.slice(0, 8))

      // Replicate our corestore over this connection
      this.store.replicate(socket)

      // Set up Protomux channel for catalog key exchange
      const mux = Protomux.from(socket)
      const channel = mux.createChannel({
        protocol: 'spill/catalog',
        messages: [
          {
            encoding: c.buffer,
            onmessage: (key) => this._handleRemoteCatalogKey(key, peerKeyHex)
          }
        ],
        onopen: () => {
          console.log('[feed] Catalog channel open with', peerKeyHex.slice(0, 8))
          channel.messages[0].send(this.catalogBee.core.key)
        }
      })
      channel.open()
    })

    console.log('[feed] Feed manager started')
  }

  _handleRemoteCatalogKey (key, peerKeyHex) {
    const keyHex = key.toString('hex')
    console.log('[feed] Received catalog key from', peerKeyHex.slice(0, 8) + ':', keyHex.slice(0, 16) + '...')

    // Skip if it's our own catalog key
    if (keyHex === this.catalogBee.core.key.toString('hex')) return

    // Skip if we're already watching this catalog
    if (this.peerCatalogs.has(keyHex)) return

    // Get the remote catalog core via our shared corestore (triggers replication)
    const remoteCore = this.store.get({ key })
    const bee = new Hyperbee(remoteCore, {
      keyEncoding: 'utf-8',
      valueEncoding: 'json'
    })
    this.peerCatalogs.set(keyHex, { bee, lastVersion: 0 })

    this._watchCatalog(bee, keyHex)
  }

  async _watchCatalog (bee, catalogKeyHex) {
    try {
      await bee.ready()
      console.log('[feed] Watching remote catalog', catalogKeyHex.slice(0, 16) + '..., version:', bee.version)

      // Initial sync: read the most recent entries (newest-first via reverse)
      const stream = bee.createReadStream({
        gte: 'video:',
        lt: 'video;',
        reverse: true,
        limit: TAIL_SYNC_LIMIT
      })

      const now = Date.now()
      for await (const { key, value: meta } of stream) {
        if (!meta || !meta.id) continue
        if (meta.timestamp && (now - meta.timestamp) > CATALOG_WINDOW_MS) continue
        this.addVideo(meta)
      }

      // Record the current version so diff streams start from here
      const state = this.peerCatalogs.get(catalogKeyHex)
      if (state) {
        state.lastVersion = bee.version
      }

      // Watch for new changes via append events on the underlying core
      bee.core.on('append', () => {
        this._readNewDiffs(bee, catalogKeyHex)
      })
    } catch (err) {
      console.error('[feed] Error watching catalog', catalogKeyHex.slice(0, 16) + ':', err.message)
    }
  }

  async _readNewDiffs (bee, catalogKeyHex) {
    const state = this.peerCatalogs.get(catalogKeyHex)
    if (!state) return

    const oldVersion = state.lastVersion
    const newVersion = bee.version

    if (newVersion <= oldVersion) return

    try {
      const diffStream = bee.createDiffStream(oldVersion, {
        gte: 'video:',
        lt: 'video;'
      })

      const now = Date.now()
      for await (const { left, right } of diffStream) {
        if (left && !right) {
          // New entry (left = current value, right = previous value which is null)
          const meta = left.value
          if (!meta || !meta.id) continue
          if (meta.timestamp && (now - meta.timestamp) > CATALOG_WINDOW_MS) continue
          this.addVideo(meta)
        } else if (!left && right) {
          // Deletion (left = null means key no longer exists)
          const meta = right.value
          if (meta && meta.id) {
            this.knownVideos = this.knownVideos.filter(v => v.id !== meta.id)
            this._myVideos = this._myVideos.filter(v => v.id !== meta.id)
            this._seenIds.delete(meta.id)
            this._deindexVideo(meta.id).catch(err => {
              console.error('[feed] Failed to deindex video:', err.message)
            })
            this.emit('videoDeleted', meta.id)
          }
        } else if (left && right) {
          // Update — treat as new entry
          const meta = left.value
          if (!meta || !meta.id) continue
          if (meta.timestamp && (now - meta.timestamp) > CATALOG_WINDOW_MS) continue
          // Remove old version first so addVideo re-inserts it
          this.knownVideos = this.knownVideos.filter(v => v.id !== meta.id)
          this._seenIds.delete(meta.id)
          this.addVideo(meta)
        }
      }

      state.lastVersion = newVersion
    } catch (err) {
      console.error('[feed] Error reading diffs for', catalogKeyHex.slice(0, 16) + ':', err.message)
    }
  }

  async _indexVideo (meta) {
    if (!this.recentBee) return
    const key = this._makeKey(meta)
    await this.recentBee.put(key, meta)
    // Also write a category-prefixed key for per-category queries
    const catKey = this._makeCatKey(meta)
    if (catKey) {
      await this.recentBee.put(catKey, meta)
    }
  }

  async _deindexVideo (id) {
    if (!this.recentBee) return
    // Find the global key and delete it + the category key
    const stream = this.recentBee.createReadStream({ gte: 'video:', lt: 'video;' })
    for await (const { key, value: meta } of stream) {
      if (meta && meta.id === id) {
        await this.recentBee.del(key)
        // Also remove the category-prefixed key
        const catKey = this._makeCatKey(meta)
        if (catKey) {
          await this.recentBee.del(catKey)
        }
        return
      }
    }
  }

  async announceVideo (meta) {
    const key = this._makeKey(meta)
    await this.catalogBee.put(key, meta)
    this.addVideo(meta)
    if (meta.id && !this._myVideos.some(v => v.id === meta.id)) {
      this._myVideos.unshift(meta)
    }
    console.log('[feed] Announced video to catalog:', meta.title)
  }

  addVideo (meta) {
    if (this._seenIds.has(meta.id)) return
    this._seenIds.add(meta.id)
    this.knownVideos.unshift(meta)
    this.emit('videoDiscovered', meta)

    // Index into local recent Bee (fire-and-forget)
    this._indexVideo(meta).catch(err => {
      console.error('[feed] Failed to index video:', err.message)
    })

    // Evict oldest entries beyond the in-memory cap
    while (this.knownVideos.length > MAX_VIDEOS) {
      const evicted = this.knownVideos.pop()
      this._seenIds.delete(evicted.id)
    }
  }

  async removeVideo (id) {
    // Remove from in-memory lists
    this._myVideos = this._myVideos.filter(v => v.id !== id)
    this.knownVideos = this.knownVideos.filter(v => v.id !== id)
    this._seenIds.delete(id)

    // Find and delete the entry from the catalog Hyperbee
    const stream = this.catalogBee.createReadStream({ gte: 'video:', lt: 'video;' })
    for await (const { key, value: meta } of stream) {
      if (meta && meta.id === id) {
        await this.catalogBee.del(key)
        break
      }
    }

    // Also remove from the recent index
    await this._deindexVideo(id)
    console.log('[feed] Removed video from catalog:', id)
  }

  async getRecentVideos ({ limit = 20, cursor = null, category = null } = {}) {
    if (!this.recentBee) return { videos: [], cursor: null }

    // Use category-prefixed keys when filtering by category
    let prefix, prefixEnd
    if (category) {
      prefix = `cat:${category}:video:`
      prefixEnd = `cat:${category}:video;`
    } else {
      prefix = 'video:'
      prefixEnd = 'video;'
    }

    const opts = {
      gte: prefix,
      lt: cursor || prefixEnd,
      reverse: true,
      limit: limit + 1
    }

    const results = []
    const stream = this.recentBee.createReadStream(opts)
    for await (const { key, value: meta } of stream) {
      results.push({ key, meta })
    }

    let nextCursor = null
    if (results.length > limit) {
      results.pop()
      nextCursor = results[results.length - 1].key
    }

    return {
      videos: results.map(r => r.meta),
      cursor: nextCursor
    }
  }

  getPopularVideos ({ limit = 20, offset = 0, category = null } = {}) {
    let source = this.knownVideos
    if (category) {
      source = source.filter(v => v.category === category)
    }
    const sorted = [...source].sort((a, b) => b.peerCount - a.peerCount)
    const page = sorted.slice(offset, offset + limit)
    return {
      videos: page,
      hasMore: offset + limit < sorted.length
    }
  }

  listVideos (category = null) {
    if (category) {
      return this.knownVideos.filter(v => v.category === category)
    }
    return this.knownVideos
  }

  listMyVideos () {
    return this._myVideos
  }

  getNodeId () {
    if (!this.swarm.swarm) return null
    return this.swarm.swarm.keyPair.publicKey.toString('hex')
  }

  get peerCount () {
    return this.swarm.peerCount
  }

  async destroy () {
    await this.swarm.destroy()
  }
}

module.exports = FeedManager
