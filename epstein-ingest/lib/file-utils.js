/**
 * File detection and utility functions for the ingest pipeline.
 */
const path = require('path')
const crypto = require('crypto')
const fs = require('fs')

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
  return EXTENSION_MAP[ext] || { contentType: 'pdf', category: null }
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
  const lower = filePath.toLowerCase()
  const baseName = path.basename(lower)

  if (dataSet >= 1 && dataSet <= 2) return 'fbi_report'
  if (dataSet >= 3 && dataSet <= 4) return 'police_report'
  if (dataSet === 5) return 'court_record'
  if (dataSet === 6) return 'deposition'
  if (dataSet === 7) return 'court_record'
  if (dataSet === 8) return 'court_record'
  if (dataSet === 9) {
    if (lower.includes('email') || lower.includes('.eml') || lower.includes('.msg')) return 'email'
    return 'court_record'
  }
  if (dataSet === 10) {
    const { contentType } = detectFileType(filePath)
    if (contentType === 'image') return 'photo'
    if (contentType === 'video') return 'video'
    return null
  }
  if (dataSet === 11) {
    if (lower.includes('flight') || lower.includes('manifest')) return 'flight_log'
    return 'financial'
  }
  if (dataSet === 12) return null

  return null
}

function walkDir (dir) {
  const results = []
  if (!fs.existsSync(dir)) return results

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath))
    } else if (entry.isFile() && !entry.name.startsWith('.')) {
      results.push(fullPath)
    }
  }
  return results
}

module.exports = {
  detectFileType,
  generateId,
  getFileSize,
  categorizeByDataSet,
  walkDir,
  EXTENSION_MAP
}
