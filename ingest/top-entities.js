#!/usr/bin/env node
const Database = require('better-sqlite3')
const path = require('path')

const DB_PATH = process.env.DOCS_DB_PATH || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const db = new Database(DB_PATH, { readonly: true })

const entities = db.prepare(`
  SELECT e.id, e.name, e.type,
    (SELECT COUNT(DISTINCT document_id) FROM document_entities WHERE entity_id = e.id) as doc_count,
    (SELECT COUNT(*) FROM entity_relationships WHERE source_entity_id = e.id OR target_entity_id = e.id) as rel_count
  FROM entities e
  ORDER BY doc_count DESC
  LIMIT 150
`).all()

// Filter to entities with at least 10 docs
const filtered = entities.filter(e => e.doc_count >= 10)

for (const e of filtered) {
  const rows = db.prepare(`
    SELECT CASE WHEN er.source_entity_id = ? THEN e2.name ELSE e1.name END as name,
           er.relationship_type as rel
    FROM entity_relationships er
    JOIN entities e1 ON er.source_entity_id = e1.id
    JOIN entities e2 ON er.target_entity_id = e2.id
    WHERE (er.source_entity_id = ? OR er.target_entity_id = ?)
    ORDER BY er.id DESC
    LIMIT 5
  `).all(e.id, e.id, e.id)
  e.connections = rows
}

process.stdout.write(JSON.stringify(filtered, null, 2))
