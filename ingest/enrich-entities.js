#!/usr/bin/env node
/**
 * Entity enrichment pipeline — backfill links, populate metadata, and extract relationships.
 *
 * Phase 0 — Backfill links: text-match all known entities against documents (pure SQL, no LLM)
 * Phase 1 — Wikidata: fetches descriptions, aliases, photos, and external URLs
 * Phase 2 — Ollama (local LLM): extracts typed relationships from shared document text
 *
 * Usage:
 *   node ingest/enrich-entities.js [--limit N] [--batch-size 20] [--concurrency 2] [--db-path ...]
 *                                  [--backfill-links] [--skip-wikidata] [--skip-relationships]
 *                                  [--ollama-url http://localhost:11434] [--ollama-model llama3]
 *                                  [--min-shared-docs 2]
 */
const path = require('path')
const pLimit = require('p-limit')

const DocumentsDatabase = require('../archiver/lib/documents-db')

const args = parseArgs(process.argv.slice(2))
const DB_PATH = args['db-path'] || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const BATCH_SIZE = parseInt(args['batch-size'] || '20') || 20
const LIMIT = parseInt(args.limit || '0') || 0
const CONCURRENCY = parseInt(args.concurrency || '2') || 2
const BACKFILL_LINKS = args['backfill-links'] === 'true'
const SKIP_WIKIDATA = args['skip-wikidata'] === 'true'
const SKIP_RELATIONSHIPS = args['skip-relationships'] === 'true'
const OLLAMA_URL = args['ollama-url'] || 'http://localhost:11434'
const OLLAMA_MODEL = args['ollama-model'] || 'llama3'
const MIN_SHARED_DOCS = parseInt(args['min-shared-docs'] || '2') || 2
const RATE_LIMIT_MS = 100 // Wikidata is generous but be polite

function parseArgs (argv) {
  const result = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i].startsWith('--')) {
      result[argv[i].slice(2)] = argv[i + 1] || 'true'
    }
  }
  return result
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ────────────────────────────────────────────────────────────────────
// Phase 0: Text-match backfill — link existing entities to documents
// ────────────────────────────────────────────────────────────────────

function runPhase0 (db) {
  console.log('\n[enrich] ═══ Phase 0: Backfill Entity–Document Links ═══')

  // Get all entities, ordered by doc count desc (most important first)
  const entityLimit = LIMIT > 0 ? LIMIT : 100000
  const entities = db.db.prepare(`
    SELECT e.id, e.name, e.type, e.normalized_name, e.aliases
    FROM entities e ORDER BY e.id ASC LIMIT ?
  `).all(entityLimit)

  console.log('[enrich] Entities to backfill: %d', entities.length)

  const insertLink = db.db.prepare(`
    INSERT OR IGNORE INTO document_entities (document_id, entity_id, mention_count)
    VALUES (?, ?, ?)
  `)

  const startTime = Date.now()
  let totalLinked = 0
  let entitiesProcessed = 0

  for (const entity of entities) {
    // Collect all name variants to search for
    const names = [entity.name]
    try {
      const aliases = JSON.parse(entity.aliases || '[]')
      if (Array.isArray(aliases)) {
        for (const a of aliases) {
          if (typeof a === 'string' && a.length > 2) names.push(a)
        }
      }
    } catch {}

    // Skip very short names (likely false positives: "US", "FBI", etc. with 2 chars)
    const searchNames = names.filter(n => n.length >= 4)
    if (searchNames.length === 0) {
      entitiesProcessed++
      continue
    }

    // Build OR condition for all name variants
    const conditions = searchNames.map(() => "extracted_text LIKE ? OR transcript LIKE ?")
    const params = []
    for (const name of searchNames) {
      const pattern = `%${name}%`
      params.push(pattern, pattern)
    }

    // Find documents mentioning this entity that aren't already linked
    // Process in batches to avoid memory issues with huge result sets
    const SCAN_BATCH = 10000
    let offset = 0
    let batchLinked = 0

    while (true) {
      const docs = db.db.prepare(`
        SELECT id FROM documents
        WHERE (${conditions.join(' OR ')})
        AND id NOT IN (SELECT document_id FROM document_entities WHERE entity_id = ?)
        LIMIT ? OFFSET ?
      `).all(...params, entity.id, SCAN_BATCH, offset)

      if (docs.length === 0) break

      const insertBatch = db.db.transaction((rows) => {
        for (const doc of rows) {
          insertLink.run(doc.id, entity.id, 1)
        }
      })
      insertBatch(docs)

      batchLinked += docs.length
      offset += docs.length

      if (docs.length < SCAN_BATCH) break
    }

    totalLinked += batchLinked
    entitiesProcessed++

    if (batchLinked > 0) {
      console.log('[enrich] "%s" → +%d docs linked (total for entity: %d)',
        entity.name, batchLinked,
        db.db.prepare('SELECT COUNT(*) as c FROM document_entities WHERE entity_id = ?').get(entity.id).c
      )
    }

    // Progress every 10 entities
    if (entitiesProcessed % 10 === 0) {
      const elapsed = (Date.now() - startTime) / 1000
      console.log('[enrich] Phase 0 progress: %d/%d entities, %d links added (%.1fs)',
        entitiesProcessed, entities.length, totalLinked, elapsed)
    }
  }

  const elapsed = (Date.now() - startTime) / 1000
  console.log('[enrich] Phase 0 complete: %d entities processed, %d links added (%.1fs)',
    entitiesProcessed, totalLinked, elapsed)
  return { entitiesProcessed, totalLinked }
}

// ────────────────────────────────────────────────────────────────────
// Phase 1: Wikidata enrichment
// ────────────────────────────────────────────────────────────────────

async function searchWikidata (name, type) {
  const typeHint = type === 'person' ? 'human' : type === 'organization' ? 'organization' : ''
  const q = typeHint ? `${name} ${typeHint}` : name
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=en&format=json&limit=3`

  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  if (!data.search || data.search.length === 0) return null

  // Return first match — could add smarter disambiguation later
  return data.search[0]
}

async function getWikidataEntity (qid) {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&languages=en&format=json&props=labels|descriptions|aliases|claims|sitelinks`

  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  return data.entities?.[qid] || null
}

function extractWikidataMetadata (entity) {
  const result = {
    description: null,
    aliases: [],
    photoUrl: null,
    externalUrls: {}
  }

  // Description
  if (entity.descriptions?.en) {
    result.description = entity.descriptions.en.value
  }

  // Aliases
  if (entity.aliases?.en) {
    result.aliases = entity.aliases.en.map(a => a.value).slice(0, 10)
  }

  // Photo — P18 (image)
  const imageClaim = entity.claims?.P18
  if (imageClaim && imageClaim[0]?.mainsnak?.datavalue?.value) {
    const filename = imageClaim[0].mainsnak.datavalue.value
    // Wikimedia Commons thumb URL
    const encoded = encodeURIComponent(filename.replace(/ /g, '_'))
    result.photoUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=300`
  }

  // External URLs
  // Wikipedia
  if (entity.sitelinks?.enwiki) {
    const title = entity.sitelinks.enwiki.title
    result.externalUrls.Wikipedia = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
  }

  // Official website — P856
  const websiteClaim = entity.claims?.P856
  if (websiteClaim && websiteClaim[0]?.mainsnak?.datavalue?.value) {
    result.externalUrls['Official Site'] = websiteClaim[0].mainsnak.datavalue.value
  }

  return result
}

async function enrichEntityFromWikidata (db, entity) {
  const searchResult = await searchWikidata(entity.name, entity.type)
  if (!searchResult) return false

  const wdEntity = await getWikidataEntity(searchResult.id)
  if (!wdEntity) return false

  const metadata = extractWikidataMetadata(wdEntity)

  // Only save if we got something useful
  if (!metadata.description && metadata.aliases.length === 0 && !metadata.photoUrl) {
    return false
  }

  db.updateEntityMetadata(entity.id, metadata)
  return true
}

async function runPhase1 (db) {
  console.log('\n[enrich] ═══ Phase 1: Wikidata Metadata ═══')

  const limit = pLimit(CONCURRENCY)
  let enriched = 0
  let skipped = 0
  let errors = 0
  let totalProcessed = 0
  const startTime = Date.now()
  let lastTick = Date.now()

  while (true) {
    const remaining = LIMIT > 0 ? Math.min(BATCH_SIZE, LIMIT - totalProcessed) : BATCH_SIZE
    if (remaining <= 0) break

    const entities = db.getUnenrichedEntities(remaining)
    if (entities.length === 0) break

    const tasks = entities.map(entity => limit(async () => {
      await sleep(RATE_LIMIT_MS)
      try {
        const success = await enrichEntityFromWikidata(db, entity)
        if (success) {
          enriched++
        } else {
          skipped++
        }
        db.markEntityEnriched(entity.id)
      } catch (err) {
        console.warn('[enrich] Wikidata error for "%s": %s', entity.name, err.message)
        db.markEntityEnriched(entity.id) // Don't retry failures
        errors++
      }
    }))

    await Promise.allSettled(tasks)
    totalProcessed += entities.length

    if (Date.now() - lastTick >= 10000) {
      const elapsed = (Date.now() - startTime) / 1000
      const rate = totalProcessed / (elapsed || 1)
      console.log('[enrich] Phase 1 progress: enriched=%d skipped=%d errors=%d total=%d (%.1f/s)',
        enriched, skipped, errors, totalProcessed, rate)
      lastTick = Date.now()
    }
  }

  const elapsed = (Date.now() - startTime) / 1000
  console.log('[enrich] Phase 1 complete: enriched=%d skipped=%d errors=%d total=%d (%.1fs)',
    enriched, skipped, errors, totalProcessed, elapsed)
  return { enriched, skipped, errors, totalProcessed }
}

// ────────────────────────────────────────────────────────────────────
// Phase 2: Ollama relationship extraction
// ────────────────────────────────────────────────────────────────────

const RELATIONSHIP_PROMPT = `You are analyzing documents from a legal/investigative archive. Given two entities and text where they co-occur, determine their relationship.

Return ONLY a JSON object with these fields:
{"relationship_type": "...", "description": "one sentence explaining the relationship"}

Valid relationship_type values:
associate, attorney, client, employer, employee, family, victim, witness, co-defendant, co-conspirator, friend, financier, beneficiary

If you cannot determine a specific relationship, return: {"relationship_type": "unknown", "description": null}`

async function ollamaGenerate (prompt) {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0, num_predict: 200 }
    })
  })

  if (!res.ok) {
    throw new Error(`Ollama error: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  return data.response || ''
}

function parseRelationshipResponse (text) {
  // Try to extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*?\}/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.relationship_type || parsed.relationship_type === 'unknown') return null

    const validTypes = [
      'associate', 'attorney', 'client', 'employer', 'employee',
      'family', 'victim', 'witness', 'co-defendant', 'co-conspirator',
      'friend', 'financier', 'beneficiary'
    ]
    if (!validTypes.includes(parsed.relationship_type)) return null

    return {
      type: parsed.relationship_type,
      description: parsed.description || null
    }
  } catch {
    return null
  }
}

async function runPhase2 (db) {
  console.log('\n[enrich] ═══ Phase 2: Ollama Relationship Extraction ═══')

  // Check if Ollama is reachable
  try {
    const check = await fetch(`${OLLAMA_URL}/api/tags`)
    if (!check.ok) throw new Error('Not reachable')
    const tags = await check.json()
    const models = (tags.models || []).map(m => m.name)
    console.log('[enrich] Ollama models available:', models.join(', ') || 'none')
    if (!models.some(m => m.startsWith(OLLAMA_MODEL))) {
      console.warn('[enrich] Warning: model "%s" not found in Ollama. Available: %s', OLLAMA_MODEL, models.join(', '))
      console.warn('[enrich] Pull it with: ollama pull %s', OLLAMA_MODEL)
      return { extracted: 0, skipped: 0, errors: 0 }
    }
  } catch (err) {
    console.warn('[enrich] Ollama not reachable at %s — skipping Phase 2 (%s)', OLLAMA_URL, err.message)
    return { extracted: 0, skipped: 0, errors: 0 }
  }

  const limit = pLimit(CONCURRENCY)
  let extracted = 0
  let skipped = 0
  let errors = 0
  let totalPairs = 0
  const startTime = Date.now()
  let lastTick = Date.now()

  // Get entities ordered by document count (most connected first)
  const entityLimit = LIMIT > 0 ? LIMIT : 200
  const entities = db.getUnenrichedEntities(0) // already enriched, get all
  // Actually get entities that have been enriched (use top entities instead)
  const topEntities = db.getTopEntities(null, entityLimit)

  for (const entity of topEntities) {
    const cooccurring = db.getCooccurringEntities(entity.id, 10)
    const pairs = cooccurring.filter(c => c.shared_documents >= MIN_SHARED_DOCS)

    if (pairs.length === 0) continue

    const tasks = pairs.map(partner => limit(async () => {
      try {
        // Check if relationship already exists
        const existing = db.getEntityRelationships(entity.id, 200)
        const alreadyLinked = existing.some(r =>
          r.other_id === partner.id
        )
        if (alreadyLinked) {
          skipped++
          return
        }

        // Get shared document texts
        const sharedDocIds = partner.shared_doc_ids.split(',').slice(0, 3)
        let textSnippets = ''
        for (const docId of sharedDocIds) {
          const text = db.getText(docId)
          if (text) {
            textSnippets += text.slice(0, 2000) + '\n---\n'
          }
        }

        if (textSnippets.length < 50) {
          skipped++
          return
        }

        const prompt = `${RELATIONSHIP_PROMPT}

Entity A: ${entity.name} (${entity.type})
Entity B: ${partner.name} (${partner.type})

Document excerpts where both appear:
${textSnippets.slice(0, 6000)}`

        const response = await ollamaGenerate(prompt)
        const result = parseRelationshipResponse(response)

        if (result) {
          db.upsertEntityRelationship(entity.id, partner.id, result.type, result.description, sharedDocIds[0])
          extracted++
        } else {
          skipped++
        }
      } catch (err) {
        console.warn('[enrich] Relationship error for "%s" ↔ "%s": %s', entity.name, partner.name, err.message)
        errors++
      }
    }))

    await Promise.allSettled(tasks)
    totalPairs += pairs.length

    if (Date.now() - lastTick >= 10000) {
      const elapsed = (Date.now() - startTime) / 1000
      console.log('[enrich] Phase 2 progress: extracted=%d skipped=%d errors=%d pairs=%d (%.1fs)',
        extracted, skipped, errors, totalPairs, elapsed)
      lastTick = Date.now()
    }

    if (LIMIT > 0 && totalPairs >= LIMIT) break
  }

  const elapsed = (Date.now() - startTime) / 1000
  console.log('[enrich] Phase 2 complete: extracted=%d skipped=%d errors=%d pairs=%d (%.1fs)',
    extracted, skipped, errors, totalPairs, elapsed)
  return { extracted, skipped, errors }
}

// ────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────

async function main () {
  console.log('[enrich] Starting entity enrichment pipeline...')
  console.log('[enrich] Database:', DB_PATH)
  console.log('[enrich] Batch size:', BATCH_SIZE)
  console.log('[enrich] Concurrency:', CONCURRENCY)
  if (LIMIT > 0) console.log('[enrich] Limit:', LIMIT)

  const db = new DocumentsDatabase(DB_PATH)

  try {
    if (BACKFILL_LINKS) {
      runPhase0(db)
    }

    if (!SKIP_WIKIDATA) {
      await runPhase1(db)
    } else {
      console.log('[enrich] Skipping Phase 1 (Wikidata)')
    }

    if (!SKIP_RELATIONSHIPS) {
      await runPhase2(db)
    } else {
      console.log('[enrich] Skipping Phase 2 (Relationships)')
    }
  } finally {
    db.close()
  }

  console.log('\n[enrich] ═══ Enrichment Complete ═══')
}

main().catch(err => {
  console.error('[enrich] Fatal error:', err)
  process.exit(1)
})
