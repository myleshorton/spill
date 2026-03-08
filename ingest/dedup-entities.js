#!/usr/bin/env node
/**
 * Entity deduplication script.
 *
 * Merges duplicate entities using two strategies:
 *   1. Exact duplicates (same name + type, case-insensitive)
 *   2. Person name variants: "FirstName" merges into "FirstName LastName"
 *      but only for type=person, only when the short name is a single token
 *      that matches the first or last name of a multi-token entity, and
 *      both entities share at least 1 document.
 *
 * Usage:
 *   node dedup-entities.js [--dry-run]
 */

const Database = require('better-sqlite3')
const path = require('path')

const DB_PATH = process.env.DOCS_DB_PATH || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const DRY_RUN = process.argv.includes('--dry-run')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = OFF')

console.log('Loading entities...')
const entities = db.prepare(`
  SELECT e.id, e.name, e.type, e.aliases,
    (SELECT COUNT(DISTINCT document_id) FROM document_entities WHERE entity_id = e.id) as document_count
  FROM entities e
  ORDER BY document_count DESC
`).all()
console.log(`Loaded ${entities.length} entities`)

// Build document sets for shared-document check
console.log('Building document overlap index...')
const docSets = new Map()
for (const e of entities) {
  const docs = db.prepare('SELECT DISTINCT document_id FROM document_entities WHERE entity_id = ?').all(e.id)
  docSets.set(e.id, new Set(docs.map(d => d.document_id)))
}

function shareDocuments(id1, id2) {
  const s1 = docSets.get(id1)
  const s2 = docSets.get(id2)
  if (!s1 || !s2) return false
  for (const d of s1) {
    if (s2.has(d)) return true
  }
  return false
}

const merges = [] // { canonical, duplicates[] }
const mergedIds = new Set()

// ── Phase 1: Exact duplicates (case-insensitive, same type) ──
const byKey = new Map()
for (const e of entities) {
  const key = e.type + ':' + e.name.toLowerCase().trim()
  if (!byKey.has(key)) byKey.set(key, [])
  byKey.get(key).push(e)
}

for (const [, group] of byKey) {
  if (group.length > 1) {
    group.sort((a, b) => b.document_count - a.document_count)
    const m = { canonical: group[0], duplicates: group.slice(1) }
    merges.push(m)
    for (const d of m.duplicates) mergedIds.add(d.id)
  }
}
console.log(`Phase 1 — exact duplicates: ${merges.length} groups`)

// ── Phase 2: Person name variants ──
// "Jeffrey" → "Jeffrey Epstein" (if both are type=person and share documents)
// "Epstein" → "Jeffrey Epstein" (same)
// Only merge single-token names into multi-token names of same type=person.

const personEntities = entities.filter(e => e.type === 'person' && !mergedIds.has(e.id))
const multiToken = personEntities.filter(e => e.name.trim().split(/\s+/).length >= 2)
const singleToken = personEntities.filter(e => e.name.trim().split(/\s+/).length === 1 && e.name.trim().length >= 3)

// Index multi-token persons by their first and last name tokens
const byFirstName = new Map() // lowercase first name → [entity]
const byLastName = new Map()  // lowercase last name → [entity]

for (const e of multiToken) {
  const tokens = e.name.trim().split(/\s+/)
  const first = tokens[0].toLowerCase()
  const last = tokens[tokens.length - 1].toLowerCase()
  if (!byFirstName.has(first)) byFirstName.set(first, [])
  byFirstName.get(first).push(e)
  if (!byLastName.has(last)) byLastName.set(last, [])
  byLastName.get(last).push(e)
}

let phase2Count = 0
for (const short of singleToken) {
  if (mergedIds.has(short.id)) continue
  const token = short.name.trim().toLowerCase()

  // Find all multi-token persons where this token is the first or last name
  const candidates = new Set()
  for (const c of (byFirstName.get(token) || [])) candidates.add(c)
  for (const c of (byLastName.get(token) || [])) candidates.add(c)

  // Filter to those that share at least one document
  const sharing = [...candidates].filter(c => !mergedIds.has(c.id) && shareDocuments(short.id, c.id))

  if (sharing.length === 1) {
    // Unambiguous match
    const canonical = sharing[0]
    mergedIds.add(short.id)
    const existing = merges.find(m => m.canonical.id === canonical.id)
    if (existing) {
      existing.duplicates.push(short)
    } else {
      merges.push({ canonical, duplicates: [short] })
    }
    phase2Count++
  } else if (sharing.length > 1) {
    // Ambiguous — pick the one with most shared docs
    sharing.sort((a, b) => {
      const sa = docSets.get(a.id)
      const sb = docSets.get(b.id)
      const sharedA = [...docSets.get(short.id)].filter(d => sa.has(d)).length
      const sharedB = [...docSets.get(short.id)].filter(d => sb.has(d)).length
      return sharedB - sharedA
    })
    // Only merge if top candidate has significantly more shared docs
    const topShared = [...docSets.get(short.id)].filter(d => docSets.get(sharing[0].id).has(d)).length
    const secondShared = [...docSets.get(short.id)].filter(d => docSets.get(sharing[1].id).has(d)).length
    if (topShared >= secondShared * 2 && topShared >= 3) {
      const canonical = sharing[0]
      mergedIds.add(short.id)
      const existing = merges.find(m => m.canonical.id === canonical.id)
      if (existing) {
        existing.duplicates.push(short)
      } else {
        merges.push({ canonical, duplicates: [short] })
      }
      phase2Count++
    }
  }
}
console.log(`Phase 2 — person name variants: ${phase2Count} merges`)

// ── Phase 3: Org/location near-duplicates ──
// "Southern District of New York" vs "U.S. District Court for the Southern District of New York"
// Only merge if shorter name (2+ tokens) is a suffix of the longer name, same type, and share docs.
for (const type of ['organization', 'location']) {
  const typeEnts = entities.filter(e => e.type === type && !mergedIds.has(e.id))
  // Sort by name length desc
  typeEnts.sort((a, b) => b.name.length - a.name.length)

  for (let i = 0; i < typeEnts.length; i++) {
    const longer = typeEnts[i]
    if (mergedIds.has(longer.id)) continue
    const longerLower = longer.name.toLowerCase().trim()

    for (let j = i + 1; j < typeEnts.length; j++) {
      const shorter = typeEnts[j]
      if (mergedIds.has(shorter.id)) continue
      const shorterLower = shorter.name.toLowerCase().trim()
      const shorterTokens = shorterLower.split(/\s+/)

      // Must have at least 3 tokens to avoid false matches
      if (shorterTokens.length < 3) continue
      // Must be notably shorter
      if (shorterLower.length >= longerLower.length) continue

      // Check if shorter is a suffix or prefix of longer
      if (longerLower.endsWith(shorterLower) || longerLower.startsWith(shorterLower)) {
        if (shareDocuments(longer.id, shorter.id)) {
          mergedIds.add(shorter.id)
          const existing = merges.find(m => m.canonical.id === longer.id)
          if (existing) {
            existing.duplicates.push(shorter)
          } else {
            merges.push({ canonical: longer, duplicates: [shorter] })
          }
        }
      }
    }
  }
}

// Count total
let totalDuplicates = 0
for (const m of merges) totalDuplicates += m.duplicates.length

console.log(`\nTotal merge groups: ${merges.length}, total duplicates to merge: ${totalDuplicates}`)

// Show preview
console.log('\nSample merges:')
for (const m of merges.slice(0, 40)) {
  const dupeNames = m.duplicates.map(d => `"${d.name}"(${d.document_count})`).join(', ')
  console.log(`  "${m.canonical.name}"(${m.canonical.document_count}) ← ${dupeNames}`)
}

if (DRY_RUN) {
  console.log('\n--dry-run mode, not applying changes.')
  process.exit(0)
}

// ── Apply merges ──
console.log('\nApplying merges...')

const reassignDocEntities = db.prepare('UPDATE OR IGNORE document_entities SET entity_id = ? WHERE entity_id = ?')
const deleteDocEntities = db.prepare('DELETE FROM document_entities WHERE entity_id = ?')
const reassignRelSource = db.prepare('UPDATE OR IGNORE entity_relationships SET source_entity_id = ? WHERE source_entity_id = ?')
const reassignRelTarget = db.prepare('UPDATE OR IGNORE entity_relationships SET target_entity_id = ? WHERE target_entity_id = ?')
const deleteRelsForEntity = db.prepare('DELETE FROM entity_relationships WHERE source_entity_id = ? OR target_entity_id = ?')
const deleteSelfRels = db.prepare('DELETE FROM entity_relationships WHERE source_entity_id = target_entity_id')

let hasQuestionsTable = false
try { db.prepare('SELECT 1 FROM entity_questions LIMIT 1').get(); hasQuestionsTable = true } catch {}
const deleteQuestions = hasQuestionsTable ? db.prepare('DELETE FROM entity_questions WHERE entity_id = ?') : null

const deleteEntity = db.prepare('DELETE FROM entities WHERE id = ?')
const mergeAliases = db.prepare('UPDATE entities SET aliases = ? WHERE id = ?')

const applyMerge = db.transaction((canonical, duplicates) => {
  const aliasNames = new Set()
  const currentRow = db.prepare('SELECT aliases FROM entities WHERE id = ?').get(canonical.id)
  if (currentRow && currentRow.aliases) {
    try { for (const a of JSON.parse(currentRow.aliases)) aliasNames.add(a) } catch {}
  }

  for (const dup of duplicates) {
    if (dup.name.toLowerCase().trim() !== canonical.name.toLowerCase().trim()) {
      aliasNames.add(dup.name)
    }
    const dupRow = db.prepare('SELECT aliases FROM entities WHERE id = ?').get(dup.id)
    if (dupRow && dupRow.aliases) {
      try { for (const a of JSON.parse(dupRow.aliases)) aliasNames.add(a) } catch {}
    }

    reassignDocEntities.run(canonical.id, dup.id)
    deleteDocEntities.run(dup.id)
    reassignRelSource.run(canonical.id, dup.id)
    reassignRelTarget.run(canonical.id, dup.id)
    deleteRelsForEntity.run(dup.id, dup.id)
    if (deleteQuestions) deleteQuestions.run(dup.id)
    deleteEntity.run(dup.id)
  }

  deleteSelfRels.run()

  if (aliasNames.size > 0) {
    mergeAliases.run(JSON.stringify([...aliasNames]), canonical.id)
  }
})

let merged = 0
for (const m of merges) {
  try {
    applyMerge(m.canonical, m.duplicates)
    merged += m.duplicates.length
  } catch (err) {
    console.error(`  Error merging into "${m.canonical.name}":`, err.message)
  }
}

// Clear cached questions for canonical entities
if (hasQuestionsTable) {
  for (const m of merges) {
    try { deleteQuestions.run(m.canonical.id) } catch {}
  }
}

console.log(`\nDone. Merged ${merged} duplicate entities.`)
const remaining = db.prepare('SELECT COUNT(*) as c FROM entities').get()
console.log(`Entities remaining: ${remaining.c}`)
