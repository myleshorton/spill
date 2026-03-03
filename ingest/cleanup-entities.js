#!/usr/bin/env node
/**
 * Entity cleanup: merge duplicates, fix types, remove junk entities.
 *
 * Usage:
 *   node ingest/cleanup-entities.js [--db-path /path/to/documents.db] [--dry-run]
 */
const path = require('path')
const Database = require('better-sqlite3')

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const dbIdx = args.indexOf('--db-path')
const DB_PATH = dbIdx >= 0 ? args[dbIdx + 1] : path.join(__dirname, '..', 'archiver', 'data', 'documents.db')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

// --- Merge rules: [target name, target type, source ids to merge into target] ---
// We'll look up target by normalized name + type, and merge all source ids into it.

const MERGES = [
  // Person duplicates
  { target: 'Ghislaine Maxwell', type: 'person', absorb: ['maxwell'] },
  { target: 'Alison J. Nathan', type: 'person', absorb: ['judge nathan', 'nathan'] },
  { target: 'Audrey Strauss', type: 'person', absorb: ['audrey struass'] },
  { target: 'William Barr', type: 'person', absorb: ['william p. barr'] },
  { target: 'Jeffrey Pagliuca', type: 'person', absorb: ['jeff pagliuca'] },
  { target: 'Laura Menninger', type: 'person', absorb: ['laura mennin'] },
  { target: 'Bobbi C. Sternheim', type: 'person', absorb: ['bobbi c sternheim'] },

  // Location duplicates
  { target: 'Washington, D.C.', type: 'location', absorb: ['washington dc'] },
  { target: 'United States Virgin Islands', type: 'location', absorb: ['us virgin islands', 'virgin islands'] },
  { target: 'New York', type: 'location', absorb: ['city of new york'] },
  { target: 'Metropolitan Correctional Center', type: 'location', absorb: ['mcc new york'] },
]

// --- Type fixes: entities with wrong type ---
const TYPE_FIXES = [
  // SDNY is an org, not a location
  { name: 'southern district of new york', from: 'location', to: 'organization' },
  // Southern District of Florida is an org
  { name: 'southern district of florida', from: 'location', to: 'organization' },
  // 15th Judicial Circuit is an org
  { name: '15th judicial circuit', from: 'location', to: 'organization' },
]

// --- Junk entities to delete ---
const JUNK = [
  // Overly generic
  { normalized: 'bureau', type: 'organization' },  // should be FBI or Bureau of Prisons
  { normalized: 'control center', type: 'organization' },
  { normalized: 'ny state attorneys', type: 'person' },
  // Case names misclassified as organizations
  { normalized: 'united states v. kidd', type: 'organization' },
  { normalized: 'united states v. johnson', type: 'organization' },
  { normalized: 'united states v. raymond', type: 'organization' },
  { normalized: 'united states v. dupigny', type: 'organization' },
  { normalized: 'united states v. lewis', type: 'organization' },
  { normalized: 'united states v. romero', type: 'organization' },
  { normalized: 'united states v. randall', type: 'organization' },
  { normalized: 'united states v. torres', type: 'organization' },
  { normalized: 'united states v. hitt', type: 'organization' },
  { normalized: 'united states v. batton', type: 'organization' },
  { normalized: 'united states v. halamek', type: 'organization' },
  { normalized: 'doe ex rel. pike v. pike', type: 'organization' },
  // Legal rules/acts misclassified
  { normalized: 'title vii', type: 'organization' },
  { normalized: 'prison rape elimination act', type: 'organization' },
  { normalized: 'federal rule of evidence 702', type: 'organization' },
  { normalized: 'daubert', type: 'organization' },
  // United States duplicate as org (keep location)
  { normalized: 'united states', type: 'organization' },
  // "United States of America" is same as "United States" location
  { normalized: 'united states of america', type: 'organization' },
  // Abbreviations that duplicate full names
  { normalized: 'bop', type: 'organization' },  // = Bureau of Prisons
  { normalized: 'fbi', type: 'organization' },  // = Federal Bureau of Investigation
  { normalized: 'mcc', type: 'organization' },  // = Metropolitan Correctional Center
  { normalized: 'mdc', type: 'organization' },  // = Metropolitan Detention Center
  { normalized: 'shu', type: 'organization' },  // Special Housing Unit, too generic
  // "Federal Medical Centers" as location
  { normalized: 'federal medical centers', type: 'location' },
]

// --- Merge duplicates between org names for same entity ---
const ORG_MERGES = [
  { target: 'U.S. Attorney\'s Office', type: 'organization', absorb: ['us attorney\'s office', 'united states attorney\'s office', 'united states attorney', 'usanys'] },
  { target: 'U.S. Department of Justice', type: 'organization', absorb: ['department of justice'] },
  { target: 'Federal Bureau of Investigation', type: 'organization', absorb: [] },
  { target: 'Bureau of Prisons', type: 'organization', absorb: ['federal bureau of prisons'] },
  { target: 'Metropolitan Correctional Center', type: 'organization', absorb: ['metropolitan correctional center'] }, // org version into location version
  { target: 'Palm Beach Police Department', type: 'organization', absorb: ['city of palm beach police department'] },
  { target: 'U.S. Attorney\'s Office for the Southern District of New York', type: 'organization', absorb: ['usao-sdny'] },
]

function getEntity (normalized, type) {
  return db.prepare('SELECT id FROM entities WHERE normalized_name = ? AND type = ?').get(normalized, type)
}

function mergeEntity (targetId, sourceId) {
  // Move all document_entities links from source to target
  // Use INSERT OR REPLACE to handle cases where both target and source link to same doc
  const links = db.prepare('SELECT document_id, mention_count FROM document_entities WHERE entity_id = ?').all(sourceId)
  const upsert = db.prepare('INSERT OR REPLACE INTO document_entities (document_id, entity_id, mention_count) VALUES (?, ?, ?)')
  for (const link of links) {
    // Check if target already has a link to this doc
    const existing = db.prepare('SELECT mention_count FROM document_entities WHERE document_id = ? AND entity_id = ?').get(link.document_id, targetId)
    const count = existing ? existing.mention_count + link.mention_count : link.mention_count
    upsert.run(link.document_id, targetId, count)
  }
  // Delete old links
  db.prepare('DELETE FROM document_entities WHERE entity_id = ?').run(sourceId)
  // Update relationships
  db.prepare('UPDATE entity_relationships SET source_entity_id = ? WHERE source_entity_id = ?').run(targetId, sourceId)
  db.prepare('UPDATE entity_relationships SET target_entity_id = ? WHERE target_entity_id = ?').run(targetId, sourceId)
  // Delete the source entity
  db.prepare('DELETE FROM entities WHERE id = ?').run(sourceId)
}

let mergeCount = 0
let typeFixCount = 0
let deleteCount = 0

// 1. Process merges
console.log('=== Merging duplicate entities ===')
for (const rule of [...MERGES, ...ORG_MERGES]) {
  const targetNorm = rule.target.toLowerCase().trim()
  const target = getEntity(targetNorm, rule.type)
  if (!target) {
    console.log('  SKIP (target not found): %s (%s)', rule.target, rule.type)
    continue
  }

  for (const sourceNorm of rule.absorb) {
    const source = getEntity(sourceNorm, rule.type)
    if (!source) {
      // Also check other types for cross-type merges
      const sourceAny = db.prepare('SELECT id, type FROM entities WHERE normalized_name = ?').get(sourceNorm)
      if (sourceAny && sourceAny.id !== target.id) {
        console.log('  MERGE: "%s" (%s, id=%d) → "%s" (%s, id=%d)', sourceNorm, sourceAny.type, sourceAny.id, rule.target, rule.type, target.id)
        if (!DRY_RUN) mergeEntity(target.id, sourceAny.id)
        mergeCount++
      }
      continue
    }
    if (source.id === target.id) continue

    console.log('  MERGE: "%s" (id=%d) → "%s" (id=%d)', sourceNorm, source.id, rule.target, target.id)
    if (!DRY_RUN) mergeEntity(target.id, source.id)
    mergeCount++
  }
}

// 2. Fix entity types
console.log('\n=== Fixing entity types ===')
for (const fix of TYPE_FIXES) {
  const entity = getEntity(fix.name, fix.from)
  if (!entity) {
    console.log('  SKIP (not found): %s (%s)', fix.name, fix.from)
    continue
  }
  // Check if target type already exists
  const existing = getEntity(fix.name, fix.to)
  if (existing) {
    // Merge into existing
    console.log('  MERGE+TYPEFIX: "%s" %s (id=%d) → %s (id=%d)', fix.name, fix.from, entity.id, fix.to, existing.id)
    if (!DRY_RUN) mergeEntity(existing.id, entity.id)
    mergeCount++
  } else {
    console.log('  TYPEFIX: "%s" %s → %s (id=%d)', fix.name, fix.from, fix.to, entity.id)
    if (!DRY_RUN) db.prepare('UPDATE entities SET type = ? WHERE id = ?').run(fix.to, entity.id)
    typeFixCount++
  }
}

// 3. Delete junk entities
console.log('\n=== Removing junk entities ===')
for (const junk of JUNK) {
  const entity = getEntity(junk.normalized, junk.type)
  if (!entity) {
    continue
  }
  const linkCount = db.prepare('SELECT COUNT(*) as cnt FROM document_entities WHERE entity_id = ?').get(entity.id).cnt
  console.log('  DELETE: "%s" (%s, id=%d, %d doc links)', junk.normalized, junk.type, entity.id, linkCount)
  if (!DRY_RUN) {
    db.prepare('DELETE FROM document_entities WHERE entity_id = ?').run(entity.id)
    db.prepare('DELETE FROM entity_relationships WHERE source_entity_id = ? OR target_entity_id = ?').run(entity.id, entity.id)
    db.prepare('DELETE FROM entities WHERE id = ?').run(entity.id)
  }
  deleteCount++
}

console.log('\n=== Summary ===')
console.log('Merged: %d', mergeCount)
console.log('Type fixes: %d', typeFixCount)
console.log('Deleted: %d', deleteCount)
if (DRY_RUN) console.log('(DRY RUN — no changes made)')

// Final stats
if (!DRY_RUN) {
  const entities = db.prepare('SELECT type, COUNT(*) as cnt FROM entities GROUP BY type ORDER BY cnt DESC').all()
  const total = entities.reduce((s, r) => s + r.cnt, 0)
  console.log('\nRemaining entities: %d', total)
  entities.forEach(r => console.log('  %s: %d', r.type, r.cnt))
  const links = db.prepare('SELECT COUNT(*) as cnt FROM document_entities').get()
  console.log('Document-entity links: %d', links.cnt)
}

db.close()
