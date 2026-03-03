const express = require('express')
const Anthropic = require('@anthropic-ai/sdk')

// Reuse embedding helpers from users-api pattern
let _embeddingCache = null
let _embeddingCacheTime = 0
const CACHE_TTL = 5 * 60 * 1000

function cosineSimilarity (a, b) {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

function getCachedEmbeddings (docsDb) {
  const now = Date.now()
  if (_embeddingCache && (now - _embeddingCacheTime) < CACHE_TTL) {
    return _embeddingCache
  }
  const rows = docsDb.getAllEmbeddings()
  _embeddingCache = rows.map(r => ({
    id: r.id,
    embedding: new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4)
  }))
  _embeddingCacheTime = now
  return _embeddingCache
}

const FINANCIAL_KEYWORDS = [
  'money', 'payment', 'wire', 'transfer', 'bank', 'account', 'financial',
  'dollar', 'fund', 'transaction', 'invoice', 'check', 'deposit',
  'jpmorgan', 'deutsche', 'million', 'thousand', '$'
]

const SYSTEM_PROMPT = `You are an AI research assistant for a document archive containing court filings, FBI reports, depositions, financial records, flight logs, emails, and other evidence. Your job is to help researchers understand the documents and find relevant information.

RULES:
1. Answer ONLY based on the provided documents. Never fabricate information.
2. Cite every factual claim using [DOC:document_id] format — these will be rendered as clickable links.
3. Clearly distinguish between:
   - Established facts (from court rulings, official records)
   - Allegations (from depositions, complaints, FBI reports)
   - Circumstantial connections (co-occurrence in records)
4. Note the source type for context: "According to an FBI report [DOC:123]..." or "In a deposition [DOC:456]..."
5. If the documents don't contain enough information to answer, say so explicitly.
6. Be precise and factual. Avoid speculation beyond what the documents support.
7. When discussing financial records, cite specific amounts, dates, and parties.
8. For entity relationships, explain how connections were established in the documents.`

function createChatRouter (docsDb, searchIndex) {
  const router = express.Router()

  router.post('/chat', express.json(), async (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return res.status(503).json({ error: 'Chat is not configured — ANTHROPIC_API_KEY is not set.' })
    }

    const { query, history } = req.body
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query is required' })
    }
    if (query.length > 2000) {
      return res.status(400).json({ error: 'Query too long (max 2000 characters)' })
    }

    const chatHistory = Array.isArray(history) ? history.slice(-10) : []

    // --- Retrieval pipeline: 3 strategies in parallel ---
    const docScores = new Map() // id → { score, doc }

    function addScore (id, score, doc) {
      const existing = docScores.get(id)
      if (existing) {
        existing.score += score
        if (doc && !existing.doc) existing.doc = doc
      } else {
        docScores.set(id, { score, doc: doc || null })
      }
    }

    const hasFinancialIntent = FINANCIAL_KEYWORDS.some(kw => query.toLowerCase().includes(kw))

    try {
      const [keywordResult, semanticResult, entityResult] = await Promise.allSettled([
        // Strategy 1: Meilisearch keyword search
        (async () => {
          try {
            const result = await searchIndex.search(query, { limit: 20 })
            if (result && result.hits) {
              result.hits.forEach((hit, i) => {
                const score = 0.5 * (1 - i / result.hits.length)
                addScore(hit.id, score, hit)
              })
            }
          } catch (err) {
            console.warn('[chat] Keyword search failed:', err.message)
          }
        })(),

        // Strategy 2: Embedding cosine similarity
        (async () => {
          try {
            const allEmbeddings = getCachedEmbeddings(docsDb)
            if (allEmbeddings.length === 0) return

            // Get query embedding from the first keyword hit or use text search
            // We don't have a live embedder here, so use the doc embeddings directly
            // Find docs whose text matches query terms and use their embeddings as proxy
            const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2)
            const matchedEmbeddings = []

            // Use keyword hits to seed semantic search
            const keywordIds = new Set()
            for (const [id] of docScores) {
              keywordIds.add(id)
            }

            // Compute centroid from keyword matches
            for (const item of allEmbeddings) {
              if (keywordIds.has(item.id)) {
                matchedEmbeddings.push(item.embedding)
              }
            }

            if (matchedEmbeddings.length === 0) return

            // Average the matched embeddings to create a query vector
            const dim = matchedEmbeddings[0].length
            const queryVec = new Float32Array(dim)
            for (const emb of matchedEmbeddings) {
              for (let i = 0; i < dim; i++) queryVec[i] += emb[i]
            }
            for (let i = 0; i < dim; i++) queryVec[i] /= matchedEmbeddings.length

            // Score all embeddings
            const scored = []
            for (const item of allEmbeddings) {
              if (keywordIds.has(item.id)) continue // skip already-found docs
              const sim = cosineSimilarity(queryVec, item.embedding)
              if (sim > 0.3) {
                scored.push({ id: item.id, score: sim })
              }
            }
            scored.sort((a, b) => b.score - a.score)
            scored.slice(0, 20).forEach(s => addScore(s.id, s.score, null))
          } catch (err) {
            console.warn('[chat] Semantic search failed:', err.message)
          }
        })(),

        // Strategy 3: Entity search + entity documents
        (async () => {
          try {
            const entityResult = docsDb.searchEntities(query, null, 5, 0)
            const entities = entityResult.entities || []
            for (const entity of entities) {
              const docResult = docsDb.getEntityDocuments(entity.id, 5, 0)
              const docs = docResult.documents || []
              for (const doc of docs) {
                addScore(doc.id, 0.3, doc)
              }

              // If financial intent, pull financial records
              if (hasFinancialIntent) {
                try {
                  docsDb.getFinancialsByEntity(entity.name, 10)
                } catch {}
              }
            }
          } catch (err) {
            console.warn('[chat] Entity search failed:', err.message)
          }
        })()
      ])

      // --- Rank and select top 30 ---
      const ranked = [...docScores.entries()]
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, 30)

      // --- Fetch full doc metadata and text ---
      const sources = []
      const contextParts = []
      let totalChars = 0
      const MAX_CHARS_PER_DOC = 4000
      const MAX_TOTAL_CHARS = 80000

      for (const [id, { doc }] of ranked) {
        if (totalChars >= MAX_TOTAL_CHARS) break

        let docMeta = doc
        if (!docMeta || !docMeta.title) {
          try {
            docMeta = docsDb.get(id)
          } catch { continue }
        }
        if (!docMeta) continue

        let text = ''
        try {
          text = docsDb.getText(id) || ''
        } catch {}
        if (!text) continue

        if (text.length > MAX_CHARS_PER_DOC) {
          text = text.slice(0, MAX_CHARS_PER_DOC) + '...'
        }

        if (totalChars + text.length > MAX_TOTAL_CHARS) {
          text = text.slice(0, MAX_TOTAL_CHARS - totalChars) + '...'
        }
        totalChars += text.length

        sources.push({
          id: docMeta.id,
          title: docMeta.title || docMeta.file_name || docMeta.fileName || id,
          contentType: docMeta.content_type || docMeta.contentType || 'unknown',
          category: docMeta.category || null
        })

        contextParts.push(`[Document ID: ${id}]\nTitle: ${docMeta.title || docMeta.file_name || docMeta.fileName || 'Untitled'}\nType: ${docMeta.content_type || docMeta.contentType || 'unknown'}${docMeta.category ? ` (${docMeta.category})` : ''}\n\n${text}`)
      }

      // Add entity relationships if relevant
      if (entityResult.status === 'fulfilled') {
        try {
          const entResult = docsDb.searchEntities(query, null, 3, 0)
          const entities = entResult.entities || []
          for (const entity of entities) {
            const rels = docsDb.getEntityRelationships(entity.id, 10)
            if (rels.length > 0) {
              const relText = rels.map(r =>
                `${r.source_name || r.sourceName} → ${r.type} → ${r.target_name || r.targetName}${r.description ? ': ' + r.description : ''}`
              ).join('\n')
              contextParts.push(`[Entity Relationships for "${entity.name}"]\n${relText}`)
            }

            if (hasFinancialIntent) {
              const financials = docsDb.getFinancialsByEntity(entity.name, 10)
              if (financials.length > 0) {
                const finText = financials.map(f =>
                  `${f.date || 'Unknown date'}: ${f.payer || '?'} → ${f.payee || '?'} $${f.amount || '?'} (${f.description || 'no description'})`
                ).join('\n')
                contextParts.push(`[Financial Records for "${entity.name}"]\n${finText}`)
              }
            }
          }
        } catch (err) {
          console.warn('[chat] Entity enrichment failed:', err.message)
        }
      }

      if (sources.length === 0) {
        return res.status(200).json({
          type: 'error',
          error: 'No relevant documents found for your query. Try rephrasing or using different keywords.'
        })
      }

      // --- Build messages for Claude ---
      const contextBlock = contextParts.join('\n\n---\n\n')
      const messages = []

      for (const msg of chatHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: msg.content })
        }
      }
      messages.push({
        role: 'user',
        content: `Based on the following documents from the archive, answer this question:\n\n${query}\n\n---\nDOCUMENTS:\n\n${contextBlock}`
      })

      // --- Stream response via SSE ---
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      })

      // Send sources first
      res.write(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`)

      const anthropic = new Anthropic({ apiKey })
      const stream = anthropic.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages
      })

      let aborted = false
      req.on('close', () => {
        aborted = true
        stream.abort()
      })

      stream.on('text', (text) => {
        if (!aborted) {
          res.write(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`)
        }
      })

      let streamEnded = false

      stream.on('error', (err) => {
        if (!aborted && !streamEnded) {
          streamEnded = true
          console.error('[chat] Stream error:', err.message)
          res.write(`data: ${JSON.stringify({ type: 'error', error: 'Generation failed. Please try again.' })}\n\n`)
          res.end()
        }
      })

      stream.on('end', () => {
        if (!aborted && !streamEnded) {
          streamEnded = true
          const usage = stream.currentMessageSnapshot?.usage || {}
          res.write(`data: ${JSON.stringify({ type: 'done', usage })}\n\n`)
          res.end()
        }
      })
    } catch (err) {
      console.error('[chat] Pipeline error:', err)
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal error during retrieval' })
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Internal error' })}\n\n`)
        res.end()
      }
    }
  })

  return router
}

module.exports = createChatRouter
