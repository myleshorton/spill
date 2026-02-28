/**
 * Audio/video transcription via local whisper.cpp or OpenAI Whisper API.
 *
 * Backend selection:
 *   1. whisper.cpp if WHISPER_CPP_PATH is set and the binary exists (free, local)
 *   2. OpenAI API if OPENAI_API_KEY is set and `openai` package is available
 *   3. Returns '' with a one-time warning if neither is configured
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const AUDIO_TYPES = new Set(['audio', 'video'])
const CHUNK_MINUTES = 10
const CHUNK_BYTES_LIMIT = 25 * 1024 * 1024 // 25 MB Whisper API limit
const MAX_RETRIES = 3
const RETRY_DELAYS = [1000, 4000, 16000]
const WHISPER_THREADS = parseInt(process.env.WHISPER_THREADS || '8') || 8

let openai = null
let OpenAI = null
try {
  OpenAI = require('openai')
} catch {}

let _warnedOnce = false

function getBackend () {
  // Prefer local whisper.cpp — free, no quota, no network dependency
  const cppPath = process.env.WHISPER_CPP_PATH
  if (cppPath && fs.existsSync(cppPath)) {
    return 'whisper-cpp'
  }

  if (process.env.OPENAI_API_KEY && OpenAI) {
    if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    return 'openai'
  }

  if (!_warnedOnce) {
    console.warn('[transcriber] No transcription backend configured. Set WHISPER_CPP_PATH or OPENAI_API_KEY.')
    _warnedOnce = true
  }
  return null
}

function getDuration (filePath) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      filePath
    ], { timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] })
    return parseFloat(out.toString().trim()) || 0
  } catch {
    return 0
  }
}

function extractAudio (filePath, outPath, offset, duration) {
  const args = [
    '-y', '-v', 'error',
    '-i', filePath
  ]
  if (offset > 0) args.push('-ss', String(offset))
  if (duration > 0) args.push('-t', String(duration))
  args.push('-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', outPath)

  execFileSync('ffmpeg', args, { timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'] })
}

async function transcribeChunkOpenAI (wavPath) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await openai.audio.transcriptions.create({
        model: 'whisper-1',
        file: fs.createReadStream(wavPath),
        response_format: 'text'
      })
      return typeof result === 'string' ? result : (result.text || '')
    } catch (err) {
      const status = err.status || err.statusCode || 0
      const retryable = status === 429 || status >= 500 || status === 0
      if (retryable && attempt < MAX_RETRIES - 1) {
        console.warn('[transcriber] API error %s, retrying in %dms...', status || err.message, RETRY_DELAYS[attempt])
        await sleep(RETRY_DELAYS[attempt])
        continue
      }
      throw err
    }
  }
  return ''
}

function transcribeChunkCpp (wavPath) {
  const cppPath = process.env.WHISPER_CPP_PATH
  const modelPath = process.env.WHISPER_MODEL_PATH || ''
  const threads = String(WHISPER_THREADS)

  const args = [
    '--no-timestamps',
    '--threads', threads,
    '--file', wavPath
  ]
  if (modelPath) args.push('--model', modelPath)

  const out = execFileSync(cppPath, args, {
    timeout: 1200000, // 20 min — CPU transcription is slower
    maxBuffer: 50 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  // whisper-cli outputs to stdout, strip any leading/trailing whitespace
  return out.toString().trim()
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function transcribe (filePath, contentType) {
  if (!AUDIO_TYPES.has(contentType)) return ''

  const backend = getBackend()
  if (!backend) return ''

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-'))
  const tmpFiles = []

  try {
    const duration = getDuration(filePath)
    if (duration <= 0) {
      console.warn('[transcriber] Could not determine duration for %s, attempting single chunk', path.basename(filePath))
    }

    const chunkSecs = CHUNK_MINUTES * 60
    const numChunks = duration > 0 ? Math.ceil(duration / chunkSecs) : 1
    const transcriptParts = []

    for (let i = 0; i < numChunks; i++) {
      const offset = i * chunkSecs
      const chunkDuration = duration > 0 ? Math.min(chunkSecs, duration - offset) : 0
      const wavPath = path.join(tmpDir, `chunk-${i}.wav`)
      tmpFiles.push(wavPath)

      try {
        extractAudio(filePath, wavPath, offset, chunkDuration)
      } catch (err) {
        console.error('[transcriber] Audio extraction failed for chunk %d of %s: %s', i, path.basename(filePath), err.message)
        continue
      }

      if (!fs.existsSync(wavPath) || fs.statSync(wavPath).size === 0) continue

      try {
        let text = ''
        if (backend === 'openai') {
          text = await transcribeChunkOpenAI(wavPath)
        } else {
          text = transcribeChunkCpp(wavPath)
        }
        if (text) transcriptParts.push(text.trim())
      } catch (err) {
        console.error('[transcriber] Transcription failed for chunk %d of %s: %s', i, path.basename(filePath), err.message)
      }
    }

    const transcript = transcriptParts.join(' ')
    if (transcript) {
      console.log('[transcriber] Transcribed %s (%s): %d chars via %s',
        path.basename(filePath), formatDuration(duration), transcript.length, backend)
    }
    return transcript
  } finally {
    for (const f of tmpFiles) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f) } catch {}
    }
    try { fs.rmdirSync(tmpDir) } catch {}
  }
}

function formatDuration (secs) {
  if (!secs || secs <= 0) return '?'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}m${s}s`
}

module.exports = { transcribe }
