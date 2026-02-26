/**
 * File detection and utility functions for the ingest pipeline.
 */
const path = require('path')
const crypto = require('crypto')
const fs = require('fs')

const archiveConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'archiver', 'archive-config.json'), 'utf8')
)

const EXTENSION_MAP = {
  // PDF
  '.pdf': { contentType: 'pdf', category: null },
  // Images
  '.jpg': { contentType: 'image', category: 'photo' },
  '.jpeg': { contentType: 'image', category: 'photo' },
  '.png': { contentType: 'image', category: 'photo' },
  '.gif': { contentType: 'image', category: 'photo' },
  '.bmp': { contentType: 'image', category: 'photo' },
  '.tiff': { contentType: 'image', category: 'photo' },
  '.tif': { contentType: 'image', category: 'photo' },
  '.webp': { contentType: 'image', category: 'photo' },
  // Video
  '.mp4': { contentType: 'video', category: 'video' },
  '.avi': { contentType: 'video', category: 'video' },
  '.mov': { contentType: 'video', category: 'video' },
  '.wmv': { contentType: 'video', category: 'video' },
  '.mkv': { contentType: 'video', category: 'video' },
  '.webm': { contentType: 'video', category: 'video' },
  '.mpg': { contentType: 'video', category: 'video' },
  '.mpeg': { contentType: 'video', category: 'video' },
  // Audio
  '.mp3': { contentType: 'audio', category: null },
  '.wav': { contentType: 'audio', category: null },
  '.flac': { contentType: 'audio', category: null },
  '.m4a': { contentType: 'audio', category: null },
  '.ogg': { contentType: 'audio', category: null },
  // Email
  '.eml': { contentType: 'email', category: 'email' },
  '.msg': { contentType: 'email', category: 'email' },
  '.mbox': { contentType: 'email', category: 'email' },
  // Spreadsheets
  '.xls': { contentType: 'spreadsheet', category: 'financial' },
  '.xlsx': { contentType: 'spreadsheet', category: 'financial' },
  '.csv': { contentType: 'spreadsheet', category: 'financial' },
  // Documents
  '.doc': { contentType: 'pdf', category: null },
  '.docx': { contentType: 'pdf', category: null },
  '.rtf': { contentType: 'pdf', category: null },
  '.txt': { contentType: 'pdf', category: null },
}

function detectFileType (filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return EXTENSION_MAP[ext] || { contentType: 'unknown', category: null }
}

function generateId (filePath) {
  return crypto.createHash('sha256').update(filePath).digest('hex').slice(0, 32)
}

function getFileSize (filePath) {
  try {
    return fs.statSync(filePath).size
  } catch {
    return 0
  }
}

function categorizeByDataSet (dataSet, filePath) {
  const rule = archiveConfig.categoryRules[String(dataSet)]

  // No rule defined — no category
  if (rule === undefined || rule === null) return null

  // Simple string rule — fixed category
  if (typeof rule === 'string') return rule

  // Object rule — check match patterns and content type patterns
  const lower = filePath.toLowerCase()

  if (rule.match) {
    for (const [pattern, category] of Object.entries(rule.match)) {
      const parts = pattern.split('|')
      if (parts.some((p) => lower.includes(p))) return category
    }
  }

  if (rule.matchContentType) {
    const { contentType } = detectFileType(filePath)
    if (rule.matchContentType[contentType]) return rule.matchContentType[contentType]
  }

  return rule.default !== undefined ? rule.default : null
}

function * walkDir (dir) {
  if (!fs.existsSync(dir)) return

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield * walkDir(fullPath)
    } else if (entry.isFile() && !entry.name.startsWith('.')) {
      yield fullPath
    }
  }
}

module.exports = {
  detectFileType,
  generateId,
  getFileSize,
  categorizeByDataSet,
  walkDir,
  EXTENSION_MAP
}
