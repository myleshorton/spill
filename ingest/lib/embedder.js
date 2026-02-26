/**
 * Document embedding via OpenAI text-embedding-3-small.
 *
 * Generates 1536-dimension embeddings for document text.
 * Gracefully degrades: warns once and returns null if no OPENAI_API_KEY.
 */

const MAX_RETRIES = 3
const RETRY_DELAYS = [1000, 4000, 16000]
const DIMENSIONS = 1536
const MAX_CHARS = 8000
const BATCH_SIZE = 20

let OpenAI = null
let openai = null
try {
  OpenAI = require('openai')
} catch {}

let _warnedOnce = false

function getClient () {
  if (process.env.OPENAI_API_KEY && OpenAI) {
    if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    return openai
  }
  if (!_warnedOnce) {
    console.warn('[embedder] No OPENAI_API_KEY set — embeddings will be skipped.')
    _warnedOnce = true
  }
  return null
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function toBuffer (float32Array) {
  return Buffer.from(float32Array.buffer, float32Array.byteOffset, float32Array.byteLength)
}

function fromBuffer (buf) {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  return new Float32Array(ab)
}

async function embed (text) {
  const client = getClient()
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

async function embedBatch (texts) {
  const client = getClient()
  if (!client) return texts.map(() => null)

  const results = new Array(texts.length).fill(null)

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map(t => t.slice(0, MAX_CHARS))

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

module.exports = { embed, embedBatch, toBuffer, fromBuffer, DIMENSIONS }
