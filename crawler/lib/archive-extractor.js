/**
 * Safe extraction of .zip and .tar.gz/.tgz archive files.
 *
 * Safety limits:
 * - 5GB total extracted size
 * - 500MB per individual file
 * - 10,000 max file count
 * - Path traversal protection
 * - Only extracts files with safe extensions
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

let unzipper = null
let tar = null
try { unzipper = require('unzipper') } catch {}
try { tar = require('tar') } catch {}

const MAX_TOTAL_SIZE = 5 * 1024 * 1024 * 1024 // 5GB
const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB
const MAX_FILE_COUNT = 10000

const SAFE_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.rtf', '.eml', '.msg',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif',
  '.mp4', '.mov', '.avi', '.mkv', '.webm',
  '.mp3', '.wav', '.flac', '.m4a', '.ogg',
  '.html', '.htm', '.json', '.xml'
])

const DEFAULT_EXTRACT_DIR = path.join(process.cwd(), 'data', 'crawl-cache', '_extracted')

// Magic bytes for format detection
const ZIP_MAGIC = Buffer.from([0x50, 0x4B, 0x03, 0x04])
const GZIP_MAGIC = Buffer.from([0x1F, 0x8B])

function detectFormat (filePath) {
  try {
    const fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(4)
    fs.readSync(fd, buf, 0, 4, 0)
    fs.closeSync(fd)

    if (buf.slice(0, 4).equals(ZIP_MAGIC)) return 'zip'
    if (buf.slice(0, 2).equals(GZIP_MAGIC)) return 'tar.gz'
  } catch {}

  // Fallback to extension
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.zip')) return 'zip'
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar.gz'
  if (lower.endsWith('.tar')) return 'tar'
  return null
}

function isSafePath (entryPath) {
  if (!entryPath) return false
  // Reject absolute paths and path traversal
  if (path.isAbsolute(entryPath)) return false
  const normalized = path.normalize(entryPath)
  if (normalized.startsWith('..') || normalized.includes('..')) return false
  return true
}

function hasSafeExtension (fileName) {
  const ext = path.extname(fileName).toLowerCase()
  return SAFE_EXTENSIONS.has(ext)
}

async function extractArchive (filePath, options = {}) {
  const extractDir = options.extractDir || DEFAULT_EXTRACT_DIR
  const format = detectFormat(filePath)
  if (!format) return []

  const hash = crypto.createHash('sha256').update(filePath).digest('hex').slice(0, 16)
  const destDir = path.join(extractDir, hash)
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })

  if (format === 'zip') {
    return _extractZip(filePath, destDir)
  } else if (format === 'tar.gz' || format === 'tar') {
    return _extractTarGz(filePath, destDir)
  }

  return []
}

async function _extractZip (filePath, destDir) {
  if (!unzipper) {
    console.warn('[archive-extractor] unzipper package not installed — skipping zip extraction')
    return []
  }

  const results = []
  let totalSize = 0
  let fileCount = 0

  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath)
      .pipe(unzipper.Parse())

    stream.on('entry', async (entry) => {
      const entryPath = entry.path
      const type = entry.type // 'File' or 'Directory'
      const size = entry.vars?.uncompressedSize || 0

      if (type === 'Directory') {
        entry.autodrain()
        return
      }

      fileCount++
      if (fileCount > MAX_FILE_COUNT) {
        entry.autodrain()
        return
      }

      if (!isSafePath(entryPath) || !hasSafeExtension(entryPath)) {
        entry.autodrain()
        return
      }

      if (size > MAX_FILE_SIZE) {
        entry.autodrain()
        return
      }

      totalSize += size
      if (totalSize > MAX_TOTAL_SIZE) {
        entry.autodrain()
        return
      }

      const fileName = path.basename(entryPath)
      const destPath = path.join(destDir, fileName)

      // Avoid overwriting by appending hash if duplicate name
      let finalPath = destPath
      if (fs.existsSync(finalPath)) {
        const hash = crypto.randomBytes(4).toString('hex')
        const ext = path.extname(fileName)
        const base = path.basename(fileName, ext)
        finalPath = path.join(destDir, `${base}-${hash}${ext}`)
      }

      try {
        const writeStream = fs.createWriteStream(finalPath)
        entry.pipe(writeStream)
        await new Promise((res, rej) => {
          writeStream.on('finish', res)
          writeStream.on('error', rej)
        })
        const stat = fs.statSync(finalPath)
        results.push({ filePath: finalPath, fileName, size: stat.size })
      } catch (err) {
        console.warn('[archive-extractor] Failed to extract %s: %s', entryPath, err.message)
        entry.autodrain()
      }
    })

    stream.on('close', () => resolve(results))
    stream.on('error', (err) => {
      console.warn('[archive-extractor] ZIP stream error: %s', err.message)
      resolve(results) // Return whatever we got
    })
  })
}

async function _extractTarGz (filePath, destDir) {
  if (!tar) {
    console.warn('[archive-extractor] tar package not installed — skipping tar extraction')
    return []
  }

  const results = []
  let totalSize = 0
  let fileCount = 0

  // Collect list of safe entries first
  const safeEntries = []

  try {
    await tar.list({
      file: filePath,
      onentry: (entry) => {
        if (entry.type !== 'File') return
        fileCount++
        if (fileCount > MAX_FILE_COUNT) return
        if (!isSafePath(entry.path)) return
        if (!hasSafeExtension(entry.path)) return
        if (entry.size > MAX_FILE_SIZE) return
        totalSize += entry.size
        if (totalSize > MAX_TOTAL_SIZE) return
        safeEntries.push(entry.path)
      }
    })
  } catch (err) {
    console.warn('[archive-extractor] tar list error: %s', err.message)
    return []
  }

  if (safeEntries.length === 0) return []

  // Extract only the safe entries
  const safeSet = new Set(safeEntries)

  try {
    await tar.extract({
      file: filePath,
      cwd: destDir,
      strip: 0,
      filter: (entryPath) => safeSet.has(entryPath)
    })
  } catch (err) {
    console.warn('[archive-extractor] tar extract error: %s', err.message)
  }

  // Walk the extracted directory and collect results
  for (const entryPath of safeEntries) {
    const fullPath = path.join(destDir, entryPath)
    try {
      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath)
        results.push({
          filePath: fullPath,
          fileName: path.basename(entryPath),
          size: stat.size
        })
      }
    } catch {}
  }

  return results
}

function isArchiveFile (filePath) {
  if (!filePath) return false
  const lower = filePath.toLowerCase()
  return lower.endsWith('.zip') || lower.endsWith('.tar.gz') ||
         lower.endsWith('.tgz') || lower.endsWith('.tar')
}

function guessContentType (filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const map = {
    '.pdf': 'application/pdf',
    '.html': 'text/html', '.htm': 'text/html',
    '.txt': 'text/plain',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.csv': 'text/csv',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4', '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
    '.json': 'application/json', '.xml': 'application/xml',
  }
  return map[ext] || 'application/octet-stream'
}

module.exports = { extractArchive, isArchiveFile, guessContentType, detectFormat }
