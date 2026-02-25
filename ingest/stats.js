#!/usr/bin/env node
/**
 * Quick stats check on the documents database.
 */
const path = require('path')
const DocumentsDatabase = require('../archiver/lib/documents-db')

const DB_PATH = process.argv[2] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')

const db = new DocumentsDatabase(DB_PATH)
const stats = db.stats()

console.log('=== Epstein Archive Stats ===')
console.log('Total documents:', stats.totalDocuments.toLocaleString())
console.log('Total size:', (stats.totalSize / (1024 * 1024 * 1024)).toFixed(1), 'GB')
console.log()
console.log('By content type:')
for (const [type, count] of Object.entries(stats.byContentType)) {
  console.log('  %-15s %s', type, count.toLocaleString())
}
console.log()
console.log('By data set:')
for (const [ds, count] of Object.entries(stats.byDataSet)) {
  console.log('  DS %-3s %s', ds, count.toLocaleString())
}
console.log()
console.log('By category:')
for (const [cat, count] of Object.entries(stats.byCategory)) {
  console.log('  %-20s %s', cat, count.toLocaleString())
}

// Check processing status
const processed = db.db.prepare('SELECT COUNT(*) as c FROM documents WHERE extracted_text IS NOT NULL').get()
const thumbed = db.db.prepare('SELECT COUNT(*) as c FROM documents WHERE thumb_path IS NOT NULL').get()
const indexed = db.db.prepare('SELECT COUNT(*) as c FROM documents WHERE indexed_at IS NOT NULL').get()

console.log()
console.log('Processing status:')
console.log('  Text extracted:  %s / %s', processed.c.toLocaleString(), stats.totalDocuments.toLocaleString())
console.log('  Thumbnailed:     %s / %s', thumbed.c.toLocaleString(), stats.totalDocuments.toLocaleString())
console.log('  Search indexed:  %s / %s', indexed.c.toLocaleString(), stats.totalDocuments.toLocaleString())

db.close()
