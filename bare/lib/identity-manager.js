/**
 * Manages persistent user identity (Ed25519 keypair) and DHT username registration.
 *
 * The identity keypair is stored in identity.json and persists across app restarts.
 * Usernames are claimed via HyperDHT mutablePut using a deterministic registry
 * keypair derived from the username. The inner payload is signed by the user's
 * real identity key to prove ownership.
 */
const fs = require('bare-fs')
const path = require('bare-path')
const DHT = require('hyperdht')
const crypto = require('hypercore-crypto')
const sodium = require('sodium-universal')
const b4a = require('b4a')

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{1,32}$/
const REGISTRY_PREFIX = 'samizdat-username-v1:'
const SWARM_SEED_PREFIX = 'samizdat-swarm-seed'
const REFRESH_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

class IdentityManager {
  constructor (dataDir) {
    this._identityPath = path.join(dataDir, 'identity.json')
    this._keypair = null
    this._username = null
    this._createdAt = null
    this._refreshTimer = null
  }

  async load () {
    try {
      const data = fs.readFileSync(this._identityPath, 'utf8')
      const json = JSON.parse(data)
      this._keypair = {
        publicKey: b4a.from(json.publicKey, 'hex'),
        secretKey: b4a.from(json.secretKey, 'hex')
      }
      this._username = json.username || null
      this._createdAt = json.createdAt || Date.now()
      console.log('[identity] Loaded identity, pubkey:', b4a.toString(this._keypair.publicKey, 'hex').slice(0, 16) + '...')
    } catch (err) {
      // First run — generate new keypair
      this._keypair = DHT.keyPair()
      this._createdAt = Date.now()
      this._save()
      console.log('[identity] Generated new identity, pubkey:', b4a.toString(this._keypair.publicKey, 'hex').slice(0, 16) + '...')
    }
    return this._keypair
  }

  _save () {
    const json = {
      publicKey: b4a.toString(this._keypair.publicKey, 'hex'),
      secretKey: b4a.toString(this._keypair.secretKey, 'hex'),
      username: this._username,
      createdAt: this._createdAt
    }
    fs.writeFileSync(this._identityPath, JSON.stringify(json, null, 2))
  }

  getSwarmSeed () {
    const prefix = b4a.from(SWARM_SEED_PREFIX)
    const secret = this._keypair.secretKey.subarray(0, 32)
    return crypto.hash(b4a.concat([prefix, secret]))
  }

  getProfile () {
    return {
      publicKey: b4a.toString(this._keypair.publicKey, 'hex'),
      username: this._username,
      createdAt: this._createdAt
    }
  }

  async checkUsername (dht, username) {
    const registryKp = this._deriveRegistryKeypair(username)

    let result = null
    try {
      result = await dht.mutableGet(registryKp.publicKey)
    } catch (err) {
      console.error('[identity] DHT mutableGet error:', err.message)
    }

    if (!result || !result.value) {
      return { available: true }
    }

    try {
      const claim = JSON.parse(b4a.toString(result.value))
      const valid = this._verifyClaim(claim)
      if (!valid) {
        // Invalid signature — treat as available (fraudulent claim)
        return { available: true }
      }
      const ownedByUs = claim.publicKey === b4a.toString(this._keypair.publicKey, 'hex')
      return { available: false, claimedBy: claim.publicKey, ownedByUs }
    } catch (err) {
      console.error('[identity] Failed to parse DHT claim:', err.message)
      return { available: true }
    }
  }

  async setUsername (dht, username) {
    username = username.trim()
    if (!USERNAME_REGEX.test(username)) {
      throw new Error('Invalid username. Must be 1-32 characters, letters/numbers/underscore/hyphen only.')
    }

    const check = await this.checkUsername(dht, username)
    if (!check.available && !check.ownedByUs) {
      throw new Error('Username "' + username + '" is already taken.')
    }

    const registryKp = this._deriveRegistryKeypair(username)
    const timestamp = Date.now()
    const claim = this._signClaim(username, timestamp)
    const claimBuffer = b4a.from(JSON.stringify(claim))

    await dht.mutablePut(registryKp, claimBuffer, { seq: timestamp })

    // Verify our claim persisted
    const verify = await this.checkUsername(dht, username)
    if (!verify.available && !verify.ownedByUs) {
      throw new Error('Username claim failed — another user claimed it simultaneously.')
    }

    this._username = username
    this._save()

    // Start periodic refresh to keep DHT entry alive
    this._startRefresh(dht, username)

    console.log('[identity] Username set to:', username)
    return this.getProfile()
  }

  _startRefresh (dht, username) {
    if (this._refreshTimer) clearInterval(this._refreshTimer)
    this._refreshTimer = setInterval(async () => {
      try {
        const registryKp = this._deriveRegistryKeypair(username)
        const timestamp = Date.now()
        const claim = this._signClaim(username, timestamp)
        const claimBuffer = b4a.from(JSON.stringify(claim))
        await dht.mutablePut(registryKp, claimBuffer, { seq: timestamp })
        console.log('[identity] Refreshed DHT username claim for:', username)
      } catch (err) {
        console.error('[identity] Failed to refresh username claim:', err.message)
      }
    }, REFRESH_INTERVAL_MS)
  }

  _deriveRegistryKeypair (username) {
    const normalized = username.toLowerCase().trim()
    const seed = crypto.hash(b4a.from(REGISTRY_PREFIX + normalized))
    return DHT.keyPair(seed)
  }

  _signClaim (username, timestamp) {
    const payload = JSON.stringify({
      username,
      publicKey: b4a.toString(this._keypair.publicKey, 'hex'),
      timestamp
    })
    const payloadBuf = b4a.from(payload)
    const signature = b4a.alloc(sodium.crypto_sign_BYTES)
    sodium.crypto_sign_detached(signature, payloadBuf, this._keypair.secretKey)

    return {
      username,
      publicKey: b4a.toString(this._keypair.publicKey, 'hex'),
      timestamp,
      signature: b4a.toString(signature, 'hex')
    }
  }

  _verifyClaim (claim) {
    try {
      const payload = JSON.stringify({
        username: claim.username,
        publicKey: claim.publicKey,
        timestamp: claim.timestamp
      })
      const payloadBuf = b4a.from(payload)
      const signature = b4a.from(claim.signature, 'hex')
      const publicKey = b4a.from(claim.publicKey, 'hex')
      return sodium.crypto_sign_verify_detached(signature, payloadBuf, publicKey)
    } catch (err) {
      console.error('[identity] Claim verification error:', err.message)
      return false
    }
  }
}

module.exports = IdentityManager
