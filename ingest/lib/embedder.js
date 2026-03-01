/**
 * Document embedding — local ONNX model (default) or OpenAI API (fallback).
 *
 * Backend priority:
 *   1. Local: @huggingface/transformers with bge-small-en-v1.5 (384-dim, ~33MB)
 *   2. OpenAI: text-embedding-3-small (1536-dim, requires OPENAI_API_KEY)
 *   3. None: gracefully returns null
 *
 * Set EMBEDDER_BACKEND=openai to force OpenAI, or EMBEDDER_BACKEND=local to force local.
 */

const MAX_RETRIES = 3
const RETRY_DELAYS = [1000, 4000, 16000]
const MAX_CHARS = 8000

// ── Local backend (ONNX via @huggingface/transformers) ───────────────────────

const LOCAL_MODEL = process.env.EMBEDDER_MODEL || 'Xenova/bge-small-en-v1.5'
const LOCAL_DIMENSIONS = 384

let _pipeline = null
let _localReady = false
let _localFailed = false

async function getLocalPipeline () {
  if (_localFailed) return null
  if (_pipeline) return _pipeline

  try {
    const { pipeline, env } = await import('@huggingface/transformers')
    // Cache models inside the container so they persist across restarts
    env.cacheDir = process.env.TRANSFORMERS_CACHE || '/app/.cache/transformers'
    // Disable remote model checks after first download
    env.allowRemoteModels = true
    console.log('[embedder] Loading local model %s ...', LOCAL_MODEL)
    _pipeline = await pipeline('feature-extraction', LOCAL_MODEL, {
      dtype: 'q8' // quantized for speed
    })
    _localReady = true
    console.log('[embedder] Local model loaded (%d-dim)', LOCAL_DIMENSIONS)
    return _pipeline
  } catch (err) {
    console.warn('[embedder] Local model unavailable: %s', err.message)
    _localFailed = true
    return null
  }
}

async function localEmbed (text) {
  const pipe = await getLocalPipeline()
  if (!pipe) return null

  const input = text.slice(0, MAX_CHARS)
  const output = await pipe(input, { pooling: 'mean', normalize: true })
  return new Float32Array(output.data)
}

async function localEmbedBatch (texts) {
  const pipe = await getLocalPipeline()
  if (!pipe) return texts.map(() => null)

  const results = []
  // Process one at a time to avoid OOM on large batches
  for (const text of texts) {
    const input = text.slice(0, MAX_CHARS)
    const output = await pipe(input, { pooling: 'mean', normalize: true })
    results.push(new Float32Array(output.data))
  }
  return results
}

// ── OpenAI backend ───────────────────────────────────────────────────────────

const OPENAI_DIMENSIONS = 1536
const OPENAI_BATCH_SIZE = 20

let OpenAI = null
let openai = null
try {
  OpenAI = require('openai')
} catch {}

function getOpenAIClient () {
  if (process.env.OPENAI_API_KEY && OpenAI) {
    if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    return openai
  }
  return null
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function openaiEmbed (text) {
  const client = getOpenAIClient()
  if (!client) return null

  const input = text.slice(0, MAX_CHARS)
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await client.embeddings.create({
        model: 'text-embedding-3-small',
        input
      })
      return new Float32Array(res.data[0].embedding)
    } catch (err) {
      const status = err.status || err.statusCode || 0
      const retryable = status === 429 || status >= 500
      if (retryable && attempt < MAX_RETRIES - 1) {
        console.warn('[embedder] API error %d, retrying in %dms...', status, RETRY_DELAYS[attempt])
        await sleep(RETRY_DELAYS[attempt])
        continue
      }
      throw err
    }
  }
  return null
}

async function openaiEmbedBatch (texts) {
  const client = getOpenAIClient()
  if (!client) return texts.map(() => null)

  const results = new Array(texts.length).fill(null)
  for (let i = 0; i < texts.length; i += OPENAI_BATCH_SIZE) {
    const batch = texts.slice(i, i + OPENAI_BATCH_SIZE).map(t => t.slice(0, MAX_CHARS))

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await client.embeddings.create({
          model: 'text-embedding-3-small',
          input: batch
        })
        for (const item of res.data) {
          results[i + item.index] = new Float32Array(item.embedding)
        }
        break
      } catch (err) {
        const status = err.status || err.statusCode || 0
        const retryable = status === 429 || status >= 500
        if (retryable && attempt < MAX_RETRIES - 1) {
          console.warn('[embedder] Batch API error %d, retrying in %dms...', status, RETRY_DELAYS[attempt])
          await sleep(RETRY_DELAYS[attempt])
          continue
        }
        throw err
      }
    }
  }
  return results
}

// ── Router: pick backend based on config + availability ──────────────────────

let _warnedOnce = false
const BACKEND = (process.env.EMBEDDER_BACKEND || 'auto').toLowerCase()

async function embed (text) {
  if (BACKEND === 'openai') return openaiEmbed(text)
  if (BACKEND === 'local') return localEmbed(text)

  // auto: try local first, fall back to OpenAI
  const local = await localEmbed(text)
  if (local) return local

  const remote = await openaiEmbed(text)
  if (remote) return remote

  if (!_warnedOnce) {
    console.warn('[embedder] No embedding backend available — embeddings will be skipped.')
    _warnedOnce = true
  }
  return null
}

async function embedBatch (texts) {
  if (BACKEND === 'openai') return openaiEmbedBatch(texts)
  if (BACKEND === 'local') return localEmbedBatch(texts)

  // auto: try local first
  if (!_localFailed) {
    const results = await localEmbedBatch(texts)
    if (results.some(r => r !== null)) return results
  }

  return openaiEmbedBatch(texts)
}

function getDimensions () {
  if (BACKEND === 'openai') return OPENAI_DIMENSIONS
  if (BACKEND === 'local' || !_localFailed) return LOCAL_DIMENSIONS
  if (getOpenAIClient()) return OPENAI_DIMENSIONS
  return LOCAL_DIMENSIONS
}

function toBuffer (float32Array) {
  return Buffer.from(float32Array.buffer, float32Array.byteOffset, float32Array.byteLength)
}

function fromBuffer (buf) {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  return new Float32Array(ab)
}

// Exported DIMENSIONS is dynamic based on backend
Object.defineProperty(module.exports, 'DIMENSIONS', { get: getDimensions })
module.exports.embed = embed
module.exports.embedBatch = embedBatch
module.exports.toBuffer = toBuffer
module.exports.fromBuffer = fromBuffer
