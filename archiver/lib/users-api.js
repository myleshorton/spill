const express = require('express')

let embedder = null
try {
  embedder = require('../../ingest/lib/embedder')
} catch {}

let Resend = null
try {
  Resend = require('resend')
} catch {}

let _resendWarned = false

// In-memory embedding cache with TTL
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

function averageEmbeddings (embeddings) {
  if (embeddings.length === 0) return null
  const dim = embeddings[0].length
  const avg = new Float32Array(dim)
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      avg[i] += emb[i]
    }
  }
  for (let i = 0; i < dim; i++) {
    avg[i] /= embeddings.length
  }
  return avg
}

function getCachedEmbeddings (docsDb) {
  const now = Date.now()
  if (_embeddingCache && (now - _embeddingCacheTime) < CACHE_TTL) {
    return _embeddingCache
  }
  const rows = docsDb.getAllEmbeddings()
  _embeddingCache = rows.map(r => ({
    id: r.id,
    embedding: embedder ? embedder.fromBuffer(r.embedding) : new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4)
  }))
  _embeddingCacheTime = now
  return _embeddingCache
}

function rowToDoc (row) {
  return {
    id: row.id,
    title: row.title,
    fileName: row.file_name,
    dataSet: row.data_set,
    contentType: row.content_type,
    category: row.category,
    fileSize: row.file_size,
    pageCount: row.page_count,
    driveKey: row.drive_key,
    fileKey: row.file_key,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
    indexedAt: row.indexed_at,
    hasContent: !!row.file_path,
    hasThumbnail: !!row.thumb_path
  }
}

function userIdentity (usersDb) {
  return (req, res, next) => {
    const userId = req.headers['x-user-id']
    if (!userId || typeof userId !== 'string' || userId.length < 10 || userId.length > 64) {
      return res.status(400).json({ error: 'Missing or invalid X-User-ID header' })
    }
    usersDb.ensureUser(userId)
    req.userId = userId
    next()
  }
}

function createUsersRouter (docsDb, usersDb) {
  const router = express.Router()
  const identify = userIdentity(usersDb)

  // Record a document view
  router.post('/views/:docId', identify, (req, res) => {
    const docId = req.params.docId
    const doc = docsDb.get(docId)
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' })
    }
    usersDb.recordView(req.userId, docId)
    res.json({ ok: true })
  })

  // Personalized recommendations
  router.get('/recommendations', identify, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 12, 50)
    const viewedIds = usersDb.getViewedDocIds(req.userId, 50)

    if (viewedIds.length === 0) {
      return res.json({ documents: [], message: 'No view history yet' })
    }

    const viewedEmbRows = docsDb.getEmbeddingsForIds(viewedIds)
    if (viewedEmbRows.length === 0) {
      return res.json({ documents: [], message: 'No embedded documents in history' })
    }

    const viewedEmbeddings = viewedEmbRows.map(r =>
      embedder ? embedder.fromBuffer(r.embedding) : new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4)
    )
    const centroid = averageEmbeddings(viewedEmbeddings)
    if (!centroid) {
      return res.json({ documents: [], message: 'Could not compute centroid' })
    }

    const viewedSet = new Set(viewedIds)
    const allEmbeddings = getCachedEmbeddings(docsDb)
    const scored = []

    for (const item of allEmbeddings) {
      if (viewedSet.has(item.id)) continue
      const score = cosineSimilarity(centroid, item.embedding)
      scored.push({ id: item.id, score })
    }

    scored.sort((a, b) => b.score - a.score)
    const top = scored.slice(0, limit)

    const documents = top.map(s => {
      const row = docsDb.get(s.id)
      if (!row) return null
      const doc = rowToDoc(row)
      doc.similarityScore = Math.round(s.score * 1000) / 1000
      return doc
    }).filter(Boolean)

    res.json({ documents })
  })

  // Similar documents (public, no auth needed)
  router.get('/documents/:id/similar', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 8, 30)
    const embBuf = docsDb.getEmbedding(req.params.id)

    if (!embBuf) {
      return res.json({ documents: [] })
    }

    const targetEmb = embedder ? embedder.fromBuffer(embBuf) : new Float32Array(embBuf.buffer, embBuf.byteOffset, embBuf.byteLength / 4)
    const allEmbeddings = getCachedEmbeddings(docsDb)
    const scored = []

    for (const item of allEmbeddings) {
      if (item.id === req.params.id) continue
      const score = cosineSimilarity(targetEmb, item.embedding)
      scored.push({ id: item.id, score })
    }

    scored.sort((a, b) => b.score - a.score)
    const top = scored.slice(0, limit)

    const documents = top.map(s => {
      const row = docsDb.get(s.id)
      if (!row) return null
      const doc = rowToDoc(row)
      doc.similarityScore = Math.round(s.score * 1000) / 1000
      return doc
    }).filter(Boolean)

    res.json({ documents })
  })

  // Request magic link
  router.post('/auth/magic-link', express.json(), identify, async (req, res) => {
    const { email } = req.body || {}
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' })
    }

    if (!process.env.RESEND_API_KEY || !Resend) {
      if (!_resendWarned) {
        console.warn('[users-api] RESEND_API_KEY not set — magic links disabled')
        _resendWarned = true
      }
      return res.status(503).json({ error: 'Email service not configured' })
    }

    const existing = usersDb.getUserByEmail(email)
    if (existing && existing.id !== req.userId) {
      // Email belongs to another account — still send link to allow merge
    }

    const { token, expiresAt } = usersDb.createMagicLink(email, req.userId)

    try {
      const resend = new Resend.Resend(process.env.RESEND_API_KEY)
      const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`
      const verifyUrl = `${baseUrl}/api/auth/verify?token=${token}`

      await resend.emails.send({
        from: process.env.EMAIL_FROM || 'noreply@unredact.org',
        to: email,
        subject: 'Sign in to your archive account',
        html: `<p>Click the link below to sign in. This link expires in 15 minutes.</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`
      })

      res.json({ ok: true, expiresAt })
    } catch (err) {
      console.error('[users-api] Failed to send magic link: %s', err.message)
      res.status(500).json({ error: 'Failed to send email' })
    }
  })

  // Verify magic link
  router.get('/auth/verify', (req, res) => {
    const { token } = req.query
    if (!token) {
      return res.status(400).json({ error: 'Token required' })
    }

    const link = usersDb.consumeMagicLink(token)
    if (!link) {
      return res.status(400).json({ error: 'Invalid or expired token' })
    }

    usersDb.linkEmail(link.user_id, link.email)
    res.json({ ok: true, userId: link.user_id, email: link.email })
  })

  return router
}

module.exports = createUsersRouter
