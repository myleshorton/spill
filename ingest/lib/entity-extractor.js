/**
 * Entity, relationship, and financial transaction extraction.
 * Supports two backends:
 *   - Ollama (local, free) — used by live ingest pipeline
 *   - OpenAI GPT-4o-mini (fast, cheap) — used for batch backfill
 *
 * Usage:
 *   const { extractEntitiesAndFinancials } = require('./entity-extractor')
 *   // Ollama (default):
 *   const result = await extractEntitiesAndFinancials(text, { ollamaUrl, model })
 *   // OpenAI:
 *   const result = await extractEntitiesAndFinancials(text, { backend: 'openai' })
 *
 *   const { storeExtractionResults } = require('./entity-extractor')
 *   storeExtractionResults(docsDb, docId, result)
 */

const DEFAULT_OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b'
const MAX_TEXT_CHARS = 8000

let _openai = null
function getOpenAI () {
  if (!_openai) {
    const OpenAI = require('openai')
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return _openai
}

let _groq = null
function getGroq () {
  if (!_groq) {
    const OpenAI = require('openai')
    _groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1'
    })
  }
  return _groq
}

let _anthropic = null
function getAnthropic () {
  if (!_anthropic) {
    const Anthropic = require('@anthropic-ai/sdk')
    _anthropic = new Anthropic()
  }
  return _anthropic
}

const EXTRACTION_PROMPT = `Extract all named entities, relationships, and financial transactions from this document text. Return JSON only.

{
  "entities": [
    {"name": "Full Name", "type": "person|organization|location", "count": N}
  ],
  "relationships": [
    {"source": "Entity A", "target": "Entity B", "type": "relationship_type", "description": "brief description"}
  ],
  "financial": [
    {"type": "payment|transfer|donation|investment|purchase|salary|wire|check|other", "amount": 123.45, "currency": "USD", "date": "YYYY-MM-DD", "from": "Payer Name", "to": "Payee Name", "description": "what for"}
  ]
}

Rules:
- entities: All clearly identifiable people, organizations, locations. Normalize names (e.g. "J. Epstein" -> "Jeffrey Epstein"). count = occurrences in text.
- relationships: Employment, financial, legal, social connections. Types: employed_by, paid_by, associated_with, legal_counsel, co_conspirator, witness, family, business_partner, donor, recipient, owner, tenant, passenger, attorney, client, other.
- financial: ANY monetary amount — payments, transfers, wires, checks, donations, investments, real estate, salaries. Amount as number. Date as YYYY-MM-DD when possible.
- Return empty arrays [] for categories with no data.
- Be thorough.

Text:`

/**
 * Extract entities, relationships, and financial transactions from text.
 * @param {string} text - Document text
 * @param {object} options
 * @param {string} options.backend - 'ollama' (default) or 'openai'
 * @param {string} options.ollamaUrl - Ollama API URL
 * @param {string} options.model - Model name
 * @param {number} options.maxChars - Max text chars to send
 * @returns {{ entities: [], relationships: [], financial: [] }}
 */
async function extractEntitiesAndFinancials (text, options = {}) {
  const backend = options.backend || 'ollama'
  const truncated = text.slice(0, options.maxChars || MAX_TEXT_CHARS)

  let content
  if (backend === 'groq') {
    content = await _extractViaGroq(truncated, options)
  } else if (backend === 'anthropic') {
    content = await _extractViaAnthropic(truncated, options)
  } else if (backend === 'openai') {
    content = await _extractViaOpenAI(truncated, options)
  } else {
    content = await _extractViaOllama(truncated, options)
  }

  try {
    const parsed = JSON.parse(content)
    return {
      entities: (Array.isArray(parsed.entities) ? parsed.entities : []).filter(e =>
        e.name && typeof e.name === 'string' && e.name.trim().length > 1 &&
        ['person', 'organization', 'location'].includes(e.type)
      ),
      relationships: (Array.isArray(parsed.relationships) ? parsed.relationships : []).filter(r =>
        r.source && r.target && r.type
      ),
      financial: (Array.isArray(parsed.financial) ? parsed.financial : []).filter(f =>
        f.description || f.amount || f.from || f.to
      )
    }
  } catch {
    return { entities: [], relationships: [], financial: [] }
  }
}

async function _extractViaOllama (truncated, options) {
  const ollamaUrl = options.ollamaUrl || DEFAULT_OLLAMA_URL
  const model = options.model || DEFAULT_MODEL

  const res = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: EXTRACTION_PROMPT + '\n' + truncated,
      stream: false,
      options: { temperature: 0, num_predict: 2000 },
      format: 'json'
    })
  })

  if (!res.ok) throw new Error(`Ollama error: ${res.status} ${res.statusText}`)
  const data = await res.json()
  return data.response || '{}'
}

async function _extractViaOpenAI (truncated, options) {
  const client = getOpenAI()
  const model = options.model || 'gpt-4o-mini'

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: EXTRACTION_PROMPT.replace('Text:', '').trim() },
      { role: 'user', content: truncated }
    ],
    temperature: 0,
    max_tokens: 4000,
    response_format: { type: 'json_object' }
  })

  return response.choices[0]?.message?.content || '{}'
}

async function _extractViaGroq (truncated, options, retries = 3) {
  const client = getGroq()
  const model = options.model || 'qwen/qwen3-32b'

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: EXTRACTION_PROMPT.replace('Text:', '').trim() + '\n\nIMPORTANT: Return ONLY raw JSON, no thinking, no markdown fences, no explanation. /no_think' },
          { role: 'user', content: truncated }
        ],
        temperature: 0,
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      })

      let text = response.choices[0]?.message?.content || '{}'
      // Strip any thinking tags from Qwen3
      text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      // Strip markdown fences if present
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) text = jsonMatch[1].trim()
      return text
    } catch (err) {
      if (err.status === 429 && attempt < retries) {
        const wait = Math.min(2000 * Math.pow(2, attempt), 30000)
        await new Promise(r => setTimeout(r, wait))
        continue
      }
      throw err
    }
  }
}

async function _extractViaAnthropic (truncated, options) {
  const client = getAnthropic()
  const model = options.model || 'claude-haiku-4-5-20251001'
  const systemPrompt = EXTRACTION_PROMPT.replace('Text:', '').trim() +
    '\n\nIMPORTANT: Return ONLY raw JSON, no markdown fences, no explanation.'

  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    messages: [
      { role: 'user', content: truncated }
    ],
    system: systemPrompt,
    temperature: 0
  })

  let text = response.content[0]?.text || '{}'
  // Strip markdown fences if present
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) text = jsonMatch[1].trim()
  return text
}

/**
 * Check if Ollama is reachable and has the required model.
 */
async function checkOllama (options = {}) {
  const ollamaUrl = options.ollamaUrl || DEFAULT_OLLAMA_URL
  const model = options.model || DEFAULT_MODEL
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`)
    if (!res.ok) return false
    const tags = await res.json()
    const models = (tags.models || []).map(m => m.name)
    return models.some(m => m.startsWith(model.split(':')[0]))
  } catch {
    return false
  }
}

/**
 * Guess entity type from extracted entities list or name heuristics.
 */
function guessEntityType (name, entities) {
  const normalized = name.toLowerCase().trim()
  const match = (entities || []).find(e => e.name.toLowerCase().trim() === normalized)
  if (match) return match.type
  const orgWords = ['inc', 'corp', 'llc', 'ltd', 'foundation', 'bank', 'group', 'company', 'associates', 'partners', 'fund', 'trust', 'university', 'department', 'bureau', 'office', 'fbi', 'cia', 'doj', 'sec']
  if (orgWords.some(w => normalized.includes(w))) return 'organization'
  return 'person'
}

/**
 * Store extraction results in the database.
 * @param {object} docsDb - DocumentsDatabase instance
 * @param {string} docId - Document ID
 * @param {object} result - Output from extractEntitiesAndFinancials
 */
function storeExtractionResults (docsDb, docId, result) {
  // Store entities
  if (result.entities && result.entities.length > 0) {
    for (const entity of result.entities) {
      const entityId = docsDb.upsertEntity(entity.name, entity.type)
      if (entityId) {
        docsDb.linkDocumentEntity(docId, entityId, entity.count || 1)
      }
    }
  }

  // Store relationships
  if (result.relationships && result.relationships.length > 0) {
    for (const rel of result.relationships) {
      const sourceType = guessEntityType(rel.source, result.entities)
      const targetType = guessEntityType(rel.target, result.entities)
      const sourceId = docsDb.upsertEntity(rel.source, sourceType)
      const targetId = docsDb.upsertEntity(rel.target, targetType)
      if (sourceId && targetId) {
        docsDb.upsertEntityRelationship(sourceId, targetId, rel.type, rel.description, docId)
      }
    }
  }

  // Store financial records
  if (result.financial && result.financial.length > 0) {
    for (const fin of result.financial) {
      docsDb.insertFinancialRecord({
        documentId: docId,
        type: fin.type || 'other',
        amount: typeof fin.amount === 'number' ? fin.amount : parseFloat(fin.amount) || null,
        currency: fin.currency || 'USD',
        date: fin.date || null,
        from: fin.from || null,
        to: fin.to || null,
        description: fin.description || null,
        rawJson: JSON.stringify(fin)
      })
    }
  }

  // Mark as scanned
  docsDb.markEntityScanned(docId)
  docsDb.markFinancialScanned(docId)
}

module.exports = {
  extractEntitiesAndFinancials,
  storeExtractionResults,
  checkOllama,
  guessEntityType
}
