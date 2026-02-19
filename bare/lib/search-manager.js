/**
 * Distributed P2P Search via Random Walk with Result Caching
 *
 * Provides full-text keyword search across the P2P network:
 * - Local inverted index built from replicated catalog entries
 * - Random-walk search propagation via Protomux `spill/search` channel
 * - Result caching with TTL expiration and lazy invalidation
 */

const EventEmitter = require('bare-events')
const Protomux = require('protomux')
const c = require('compact-encoding')
const crypto = require('hypercore-crypto')

// --- Constants ---
const FANOUT = 3            // Number of peers to query on initial search
const RELAY_FANOUT = 2      // Number of peers to relay to on hop
const DEFAULT_TTL = 2       // Max hops for search propagation
const SEARCH_TIMEOUT = 8000 // 8s timeout for network search
const CACHE_TTL = 30 * 60 * 1000  // 30 minutes
const MAX_CACHE_ENTRIES = 100
const SEARCH_ID_EXPIRY = SEARCH_TIMEOUT * 2
const MAX_RESULTS = 50

// ---------------------------------------------------------------------------
// InvertedIndex — in-memory keyword → Set<contentId> mapping
// ---------------------------------------------------------------------------

class InvertedIndex {
  constructor () {
    this._index = new Map()    // keyword → Set<contentId>
    this._docs = new Map()     // contentId → meta object
  }

  addDocument (meta) {
    if (!meta || !meta.id) return
    const id = meta.id
    const text = (meta.title || '') + ' ' + (meta.description || '')
    const tokens = this._tokenize(text)

    this._docs.set(id, meta)
    for (const token of tokens) {
      let set = this._index.get(token)
      if (!set) {
        set = new Set()
        this._index.set(token, set)
      }
      set.add(id)
    }
  }

  removeDocument (id) {
    const meta = this._docs.get(id)
    if (!meta) return
    const text = (meta.title || '') + ' ' + (meta.description || '')
    const tokens = this._tokenize(text)

    for (const token of tokens) {
      const set = this._index.get(token)
      if (set) {
        set.delete(id)
        if (set.size === 0) this._index.delete(token)
      }
    }
    this._docs.delete(id)
  }

  search (query, limit = MAX_RESULTS) {
    const tokens = this._tokenize(query)
    if (tokens.length === 0) return []

    // Score each document by number of matching tokens (OR-matching)
    const scores = new Map() // contentId → score
    for (const token of tokens) {
      const set = this._index.get(token)
      if (!set) continue
      for (const id of set) {
        scores.set(id, (scores.get(id) || 0) + 1)
      }
    }

    // Build results array with scores
    const results = []
    for (const [id, score] of scores) {
      const meta = this._docs.get(id)
      if (meta) results.push({ ...meta, _score: score })
    }

    // Sort by score desc, then timestamp desc (recency)
    results.sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score
      return (b.timestamp || 0) - (a.timestamp || 0)
    })

    // Remove internal score field and limit
    return results.slice(0, limit).map(r => {
      const { _score, ...meta } = r
      return meta
    })
  }

  _tokenize (text) {
    if (!text) return []
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(t => t.length >= 2)
  }
}

// ---------------------------------------------------------------------------
// ResultCache — query → results with TTL and LRU eviction
// ---------------------------------------------------------------------------

class ResultCache {
  constructor () {
    this._cache = new Map() // normalizedQuery → { results, timestamp }
  }

  get (query) {
    const key = this._normalize(query)
    const entry = this._cache.get(key)
    if (!entry) return null
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      this._cache.delete(key)
      return null
    }
    // Move to end for LRU
    this._cache.delete(key)
    this._cache.set(key, entry)
    return entry.results
  }

  set (query, results) {
    const key = this._normalize(query)
    // Evict oldest if at capacity
    if (this._cache.size >= MAX_CACHE_ENTRIES && !this._cache.has(key)) {
      const oldest = this._cache.keys().next().value
      this._cache.delete(oldest)
    }
    this._cache.set(key, { results, timestamp: Date.now() })
  }

  invalidate (contentId) {
    for (const [key, entry] of this._cache) {
      entry.results = entry.results.filter(r => r.id !== contentId)
    }
  }

  removeContent (contentId) {
    for (const [key, entry] of this._cache) {
      entry.results = entry.results.filter(r => r.id !== contentId)
    }
  }

  _normalize (query) {
    return query.toLowerCase().trim().replace(/\s+/g, ' ')
  }
}

// ---------------------------------------------------------------------------
// SearchManager — orchestrates local + network search
// ---------------------------------------------------------------------------

class SearchManager extends EventEmitter {
  constructor (feedManager, swarmManager) {
    super()
    this.feedManager = feedManager
    this.swarmManager = swarmManager
    this.index = new InvertedIndex()
    this.cache = new ResultCache()

    this._peerChannels = new Map()  // peerKeyHex → { channel, requestMsg, responseMsg }
    this._seenSearchIds = new Map() // searchId → expiry timestamp
    this._activeSearches = new Map() // searchId → { results, resolve, timer, resultIds }
    this._relayedSearches = new Map() // searchId → originPeerKeyHex
    this._cleanupTimer = null
  }

  start () {
    // Build initial index from known videos
    for (const meta of this.feedManager.knownVideos) {
      this.index.addDocument(meta)
    }

    // Index new discoveries
    this.feedManager.on('videoDiscovered', (meta) => {
      this.index.addDocument(meta)
    })

    // Remove deleted content
    this.feedManager.on('videoDeleted', (id) => {
      this.index.removeDocument(id)
      this.cache.removeContent(id)
    })

    // Set up search channels on already-connected peers
    if (this.swarmManager.swarm && this.swarmManager.swarm.connections) {
      for (const socket of this.swarmManager.swarm.connections) {
        const peerKeyHex = socket.remotePublicKey
          ? socket.remotePublicKey.toString('hex')
          : null
        if (peerKeyHex) {
          this._setupSearchChannel(socket, peerKeyHex)
        }
      }
    }

    // Listen for new peer connections
    this.swarmManager.onConnection((socket, peerInfo) => {
      const peerKeyHex = peerInfo.publicKey.toString('hex')
      this._setupSearchChannel(socket, peerKeyHex)
    })

    // Periodic cleanup of expired search IDs
    this._cleanupTimer = setInterval(() => this._cleanupSeenIds(), SEARCH_ID_EXPIRY)

    console.log('[search] Search manager started, indexed', this.index._docs.size, 'documents')
  }

  _setupSearchChannel (socket, peerKeyHex) {
    if (this._peerChannels.has(peerKeyHex)) return

    const mux = Protomux.from(socket)
    const self = this

    const channel = mux.createChannel({
      protocol: 'spill/search',
      messages: [
        {
          // Message type 0: search request
          encoding: c.buffer,
          onmessage (buf) { self._handleSearchRequest(buf, peerKeyHex) }
        },
        {
          // Message type 1: search response
          encoding: c.buffer,
          onmessage (buf) { self._handleSearchResponse(buf, peerKeyHex) }
        }
      ],
      onopen () {
        console.log('[search] Search channel open with', peerKeyHex.slice(0, 8))
      }
    })
    channel.open()

    this._peerChannels.set(peerKeyHex, {
      channel,
      requestMsg: channel.messages[0],
      responseMsg: channel.messages[1]
    })

    // Clean up on socket close
    socket.on('close', () => {
      this._peerChannels.delete(peerKeyHex)
    })
  }

  searchLocal (query) {
    return this.index.search(query)
  }

  searchNetwork (query) {
    // Check cache first
    const cached = this.cache.get(query)
    if (cached) {
      return Promise.resolve({
        searchId: null,
        results: cached,
        source: 'cache',
        complete: true
      })
    }

    // Search local index immediately
    const localResults = this.index.search(query)
    const searchId = crypto.randomBytes(16).toString('hex')
    const resultIds = new Set(localResults.map(r => r.id))

    // Emit local results immediately
    if (localResults.length > 0) {
      this.emit('searchResults', {
        searchId,
        results: localResults,
        source: 'local'
      })
    }

    // Get available peers (excluding self)
    const peerKeys = Array.from(this._peerChannels.keys())
    if (peerKeys.length === 0) {
      // No peers connected, return local results only
      this.cache.set(query, localResults)
      return Promise.resolve({
        searchId,
        results: localResults,
        source: 'local',
        complete: true
      })
    }

    // Pick up to FANOUT random peers
    const selectedPeers = this._pickRandom(peerKeys, FANOUT)

    // Build search request
    const originKey = this.swarmManager.swarm
      ? this.swarmManager.swarm.keyPair.publicKey.toString('hex')
      : ''
    const request = {
      id: searchId,
      query,
      ttl: DEFAULT_TTL,
      origin: originKey
    }
    const requestBuf = Buffer.from(JSON.stringify(request))

    // Send to selected peers
    for (const peerKey of selectedPeers) {
      const peer = this._peerChannels.get(peerKey)
      if (peer) {
        try {
          peer.requestMsg.send(requestBuf)
        } catch (err) {
          console.error('[search] Failed to send request to', peerKey.slice(0, 8), err.message)
        }
      }
    }

    // Mark this search ID as seen
    this._seenSearchIds.set(searchId, Date.now() + SEARCH_ID_EXPIRY)

    // Create promise that resolves on timeout or when all responses received
    return new Promise((resolve) => {
      const allResults = [...localResults]
      const timer = setTimeout(() => {
        this._finalizeSearch(searchId)
      }, SEARCH_TIMEOUT)

      this._activeSearches.set(searchId, {
        results: allResults,
        resolve,
        timer,
        resultIds,
        query
      })
    })
  }

  _handleSearchRequest (buf, peerKeyHex) {
    let request
    try {
      request = JSON.parse(buf.toString())
    } catch (err) {
      console.error('[search] Invalid search request from', peerKeyHex.slice(0, 8))
      return
    }

    const { id, query, ttl, origin } = request
    if (!id || !query) return

    // Loop prevention
    if (this._seenSearchIds.has(id)) return
    this._seenSearchIds.set(id, Date.now() + SEARCH_ID_EXPIRY)

    // Search local index
    const localResults = this.index.search(query)

    // Send results back to requesting peer
    const response = {
      id,
      results: localResults
    }
    const peer = this._peerChannels.get(peerKeyHex)
    if (peer) {
      try {
        peer.responseMsg.send(Buffer.from(JSON.stringify(response)))
      } catch (err) {
        console.error('[search] Failed to send response to', peerKeyHex.slice(0, 8), err.message)
      }
    }

    // Relay to further peers if TTL allows
    if (ttl > 1) {
      const relayPeers = this._pickRandom(
        Array.from(this._peerChannels.keys()).filter(k => k !== peerKeyHex),
        RELAY_FANOUT
      )

      if (relayPeers.length > 0) {
        // Store relay mapping so we can forward responses back
        this._relayedSearches.set(id, peerKeyHex)

        const relayRequest = {
          id,
          query,
          ttl: ttl - 1,
          origin
        }
        const relayBuf = Buffer.from(JSON.stringify(relayRequest))

        for (const relayKey of relayPeers) {
          const relayPeer = this._peerChannels.get(relayKey)
          if (relayPeer) {
            try {
              relayPeer.requestMsg.send(relayBuf)
            } catch (err) {
              console.error('[search] Failed to relay to', relayKey.slice(0, 8), err.message)
            }
          }
        }
      }
    }
  }

  _handleSearchResponse (buf, peerKeyHex) {
    let response
    try {
      response = JSON.parse(buf.toString())
    } catch (err) {
      console.error('[search] Invalid search response from', peerKeyHex.slice(0, 8))
      return
    }

    const { id, results } = response
    if (!id || !Array.isArray(results)) return

    // Check if this is a response to our own search
    const active = this._activeSearches.get(id)
    if (active) {
      // Merge results, dedup by content ID
      let added = 0
      for (const result of results) {
        if (result.id && !active.resultIds.has(result.id)) {
          active.resultIds.add(result.id)
          active.results.push(result)
          added++
        }
      }
      if (added > 0) {
        this.emit('searchResults', {
          searchId: id,
          results: results.filter(r => r.id && active.resultIds.has(r.id)),
          source: 'network'
        })
      }
      return
    }

    // Check if this is a relayed search — forward response back
    const originPeer = this._relayedSearches.get(id)
    if (originPeer) {
      const peer = this._peerChannels.get(originPeer)
      if (peer) {
        try {
          peer.responseMsg.send(buf)
        } catch (err) {
          console.error('[search] Failed to forward response to', originPeer.slice(0, 8), err.message)
        }
      }
    }
  }

  _finalizeSearch (searchId) {
    const active = this._activeSearches.get(searchId)
    if (!active) return

    clearTimeout(active.timer)
    this._activeSearches.delete(searchId)

    // Cache the aggregated results
    this.cache.set(active.query, active.results)

    active.resolve({
      searchId,
      results: active.results,
      source: 'network',
      complete: true
    })
  }

  invalidateContent (contentId) {
    this.cache.invalidate(contentId)
  }

  _pickRandom (arr, count) {
    if (arr.length <= count) return [...arr]
    const shuffled = [...arr]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled.slice(0, count)
  }

  _cleanupSeenIds () {
    const now = Date.now()
    for (const [id, expiry] of this._seenSearchIds) {
      if (now > expiry) this._seenSearchIds.delete(id)
    }
    // Also clean up stale relay entries
    for (const [id] of this._relayedSearches) {
      if (!this._seenSearchIds.has(id)) this._relayedSearches.delete(id)
    }
  }

  destroy () {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer)
      this._cleanupTimer = null
    }
    // Clear any active search timers
    for (const [, active] of this._activeSearches) {
      clearTimeout(active.timer)
    }
    this._activeSearches.clear()
    this._seenSearchIds.clear()
    this._relayedSearches.clear()
    this._peerChannels.clear()
  }
}

module.exports = SearchManager
