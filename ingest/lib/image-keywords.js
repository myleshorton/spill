/**
 * Image keyword extraction via GPT-4o-mini vision (low detail).
 *
 * Extracts searchable keywords from images (objects, people, setting, text, etc.).
 * Gracefully degrades: warns once and returns null if no OPENAI_API_KEY.
 */

const fs = require('fs')
const path = require('path')

const MAX_RETRIES = 3
const RETRY_DELAYS = [1000, 4000, 16000]
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])

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
    console.warn('[image-keywords] No OPENAI_API_KEY set — image keyword extraction will be skipped.')
    _warnedOnce = true
  }
  return null
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const PROMPT = `Analyze this image and return a comma-separated list of descriptive keywords. Include: objects visible, number of people (if any), setting/location type, activities or actions, any visible text or signage, and overall scene description. Return ONLY the comma-separated keywords, nothing else.`

async function extractKeywords (filePath) {
  const client = getClient()
  if (!client) return null

  // Validate extension
  const ext = path.extname(filePath).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(ext)) return null

  // Validate size
  try {
    const stat = fs.statSync(filePath)
    if (stat.size > MAX_FILE_SIZE || stat.size === 0) return null
  } catch {
    return null
  }

  // Read and encode
  const buffer = fs.readFileSync(filePath)
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  }
  const mime = mimeMap[ext] || 'image/jpeg'
  const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } }
            ]
          }
        ]
      })
      const text = res.choices?.[0]?.message?.content?.trim()
      return text || null
    } catch (err) {
      const status = err.status || err.statusCode || 0
      const retryable = status === 429 || status >= 500
      if (retryable && attempt < MAX_RETRIES - 1) {
        console.warn('[image-keywords] API error %d, retrying in %dms...', status, RETRY_DELAYS[attempt])
        await sleep(RETRY_DELAYS[attempt])
        continue
      }
      throw err
    }
  }
  return null
}

async function extractKeywordsFromPdf (filePath) {
  const client = getClient()
  if (!client) return null

  const { execFileSync } = require('child_process')
  const os = require('os')

  // Render page 1 to JPEG via pdftoppm
  const tmpPrefix = path.join(os.tmpdir(), 'pdfkw-' + process.pid + '-' + Date.now())
  try {
    execFileSync('pdftoppm', [
      '-f', '1', '-l', '1',
      '-jpeg', '-r', '150',
      '-singlefile',
      filePath,
      tmpPrefix
    ], { timeout: 30000, stdio: ['pipe', 'pipe', 'ignore'] })
  } catch {
    return null
  }

  const tmpJpeg = tmpPrefix + '.jpg'
  if (!fs.existsSync(tmpJpeg)) return null

  try {
    const stat = fs.statSync(tmpJpeg)
    if (stat.size === 0 || stat.size > MAX_FILE_SIZE) return null

    const buffer = fs.readFileSync(tmpJpeg)
    const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          max_tokens: 200,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: PROMPT },
                { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } }
              ]
            }
          ]
        })
        const text = res.choices?.[0]?.message?.content?.trim()
        return text || null
      } catch (err) {
        const status = err.status || err.statusCode || 0
        const retryable = status === 429 || status >= 500
        if (retryable && attempt < MAX_RETRIES - 1) {
          console.warn('[image-keywords] API error %d, retrying in %dms...', status, RETRY_DELAYS[attempt])
          await sleep(RETRY_DELAYS[attempt])
          continue
        }
        throw err
      }
    }
    return null
  } finally {
    try { fs.unlinkSync(tmpJpeg) } catch {}
  }
}

module.exports = { extractKeywords, extractKeywordsFromPdf }
