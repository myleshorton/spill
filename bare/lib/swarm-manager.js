/**
 * Manages Hyperswarm networking for peer discovery and connection.
 *
 * Joins a global "samizdat" topic plus per-category topics so nodes can
 * discover content for specific categories. All known categories are
 * joined on start; new categories can be joined dynamically.
 */
const Hyperswarm = require('hyperswarm')
const crypto = require('hypercore-crypto')

const CATEGORIES = [
  'General', 'Epstein', 'JFK', 'RFK', 'Covid', 'Diddy', 'UFOs', 'AI', 'Pentagon'
]

class SwarmManager {
  constructor (opts = {}) {
    this.swarm = null
    this._globalTopic = crypto.hash(Buffer.from('spill-global-feed'))
    this._seed = opts.seed || null
    this._joinedTopics = new Set()
  }

  async start () {
    const swarmOpts = {}
    if (this._seed) swarmOpts.seed = this._seed
    this.swarm = new Hyperswarm(swarmOpts)

    // Join the global samizdat topic for peer discovery
    this._joinTopic(this._globalTopic, 'global')

    // Join per-category topics
    for (const cat of CATEGORIES) {
      this.joinCategoryTopic(cat)
    }

    console.log('[swarm] Joined global + ' + CATEGORIES.length + ' category topics, listening for peers...')
  }

  _joinTopic (topic, label) {
    const hex = topic.toString('hex')
    if (this._joinedTopics.has(hex)) return
    this._joinedTopics.add(hex)

    const discovery = this.swarm.join(topic, {
      server: true,
      client: true
    })

    discovery.flushed().then(() => {
      console.log('[swarm] DHT discovery flushed for', label)
    }).catch((err) => {
      console.error('[swarm] DHT flush error for', label + ':', err.message)
    })
  }

  joinCategoryTopic (category) {
    if (!this.swarm) return
    const topic = crypto.hash(Buffer.from('spill-cat-' + category.toLowerCase()))
    this._joinTopic(topic, 'cat:' + category)
  }

  onConnection (cb) {
    if (!this.swarm) throw new Error('Swarm not started')
    this.swarm.on('connection', cb)
  }

  get peerCount () {
    if (!this.swarm) return 0
    return this.swarm.connections.size
  }

  async destroy () {
    if (this.swarm) {
      await this.swarm.destroy()
      this.swarm = null
    }
  }
}

module.exports = SwarmManager
