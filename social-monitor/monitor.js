#!/usr/bin/env node
/**
 * Social Media Monitor for Epstein Files Archive
 *
 * Monitors Bluesky (real-time firehose + periodic search) and Reddit
 * for Epstein-related discussions, matches against entity database,
 * and generates suggested responses with archive links.
 *
 * Usage:
 *   node monitor.js                  # Run all monitors
 *   node monitor.js --bluesky-only   # Bluesky firehose + search only
 *   node monitor.js --search-only    # Periodic search only (no firehose)
 */

const WebSocket = require('ws')
const Database = require('better-sqlite3')
const path = require('path')
const http = require('http')

// ─── Config ───
const SITE_URL = process.env.SITE_URL || 'https://unredact.org'
const DB_PATH = process.env.MONITOR_DB || path.join(__dirname, 'monitor.db')
const DOCS_DB_PATH = process.env.DOCS_DB_PATH || path.join(__dirname, '..', 'archiver', 'data', 'documents.db')
const GROQ_API_KEY = process.env.GROQ_API_KEY
const SEARCH_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes
const DASHBOARD_PORT = process.env.DASHBOARD_PORT || 3847

const JETSTREAM_URL = 'wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post'
const BSKY_SEARCH_URL = 'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts'
const REDDIT_SEARCH_URL = 'https://www.reddit.com/search.json'

// Blocked handles — bots, spammers, or accounts we don't want to engage with
const BLOCKED_HANDLES = new Set([
  'epsteinweb.bsky.social',
])

// Text patterns that indicate a bot/spam post we don't want to engage with
const BLOCKED_TEXT_PATTERNS = [
  '#epsteinweb',
  'epsteinweb.org',
]

function isBlocked (handle) {
  if (!handle) return false
  const h = handle.toLowerCase()
  for (const blocked of BLOCKED_HANDLES) {
    if (h === blocked || h.includes(blocked.split('.')[0])) return true
  }
  return false
}

function isBlockedText (text) {
  if (!text) return false
  const lower = text.toLowerCase()
  for (const pat of BLOCKED_TEXT_PATTERNS) {
    if (lower.includes(pat)) return true
  }
  return false
}

// Keywords that indicate an Epstein-related post
const PRIMARY_KEYWORDS = [
  'epstein', 'ghislaine', 'maxwell', 'lolita express',
  'epstein island', 'little st james', 'epstein files',
  'epstein documents', 'epstein case', 'epstein list',
  'jeffrey epstein', 'epstein victim', 'epstein flight',
]

// Secondary keywords — need a primary keyword to also be present
const SECONDARY_KEYWORDS = [
  'prince andrew', 'bill clinton', 'les wexner', 'jean-luc brunel',
  'alan dershowitz', 'palm beach', 'non-prosecution agreement',
  'southern district', 'doj documents', 'trafficking',
  'visoski', 'groff', 'flight logs', 'black book',
  'mcc', 'metropolitan correctional', 'tartaglione',
]

// ─── Monitor Database ───
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.exec(`
  CREATE TABLE IF NOT EXISTS opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    post_url TEXT UNIQUE,
    author_handle TEXT,
    author_display_name TEXT,
    author_followers INTEGER DEFAULT 0,
    post_text TEXT NOT NULL,
    matched_keywords TEXT,
    matched_entities TEXT,
    suggested_reply TEXT,
    engagement_score INTEGER DEFAULT 0,
    content_score INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    status TEXT DEFAULT 'new',
    found_at INTEGER NOT NULL,
    acted_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_opp_status ON opportunities(status);
  CREATE INDEX IF NOT EXISTS idx_opp_found ON opportunities(found_at DESC);
`)

// Migrate existing DB if columns are missing
{
  const cols = db.prepare("PRAGMA table_info(opportunities)").all().map(c => c.name)
  if (!cols.includes('author_followers')) {
    db.exec(`ALTER TABLE opportunities ADD COLUMN author_followers INTEGER DEFAULT 0`)
  }
  if (!cols.includes('content_score')) {
    db.exec(`ALTER TABLE opportunities ADD COLUMN content_score INTEGER DEFAULT 0`)
  }
  if (!cols.includes('total_score')) {
    db.exec(`ALTER TABLE opportunities ADD COLUMN total_score INTEGER DEFAULT 0`)
    db.exec(`UPDATE opportunities SET total_score = engagement_score WHERE total_score = 0 AND engagement_score > 0`)
  }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_opp_score ON opportunities(total_score DESC)`) } catch {}
}

// ─── Scoring ───
// Minimum total_score to store a firehose post (filters out low-value noise)
const MIN_FIREHOSE_SCORE = 3

function computeContentScore (text, keywords, entities) {
  let score = 0
  // More keyword matches = more relevant
  score += Math.min(keywords.length * 2, 10)
  // Entity matches are very valuable
  score += Math.min(entities.length * 3, 15)
  // Longer, more substantive posts are better (cap at 500 chars)
  if (text.length > 100) score += 2
  if (text.length > 250) score += 3
  if (text.length > 500) score += 2
  // Posts with questions are engagement-ready
  if (text.includes('?')) score += 2
  // Posts mentioning specific secondary keywords indicate depth
  const lower = text.toLowerCase()
  const depthTerms = ['documents', 'files', 'evidence', 'testimony', 'court', 'deposition', 'flight log', 'investigation', 'prosecut', 'trafficking', 'victim', 'survivor']
  for (const t of depthTerms) {
    if (lower.includes(t)) { score += 1; break }
  }
  return score
}

function computeFollowerScore (followers) {
  if (!followers || followers <= 0) return 0
  // Log scale: 100 followers = 2, 1K = 3, 10K = 4, 100K = 5, 1M = 6
  return Math.min(Math.floor(Math.log10(followers)), 6)
}

function computeTotalScore (contentScore, engagementScore, followerScore) {
  // Content quality is most important, follower reach is a multiplier
  return contentScore + engagementScore + (followerScore * 2)
}

// ─── Entity Matching ───
let entityIndex = null

function loadEntityIndex () {
  try {
    const docsDb = new Database(DOCS_DB_PATH, { readonly: true })
    // Load all persons (most valuable for social matching) + top orgs/locations
    const entities = docsDb.prepare(`
      SELECT e.id, e.name, e.type, e.aliases,
        (SELECT COUNT(DISTINCT document_id) FROM document_entities WHERE entity_id = e.id) as doc_count
      FROM entities e
      WHERE e.type = 'person'
         OR (SELECT COUNT(DISTINCT document_id) FROM document_entities WHERE entity_id = e.id) >= 20
      ORDER BY doc_count DESC
    `).all()
    docsDb.close()

    entityIndex = entities.map(e => {
      const names = [e.name.toLowerCase()]
      if (e.aliases) {
        try {
          for (const a of JSON.parse(e.aliases)) names.push(a.toLowerCase())
        } catch {}
      }
      return {
        id: e.id,
        name: e.name,
        type: e.type,
        doc_count: e.doc_count,
        // Require multi-word names for persons, or at least 6 chars for single-word
        // This avoids false matches on common words like "Daniel", "Island", "Paul"
        searchTerms: names.filter(n => {
          if (n.length < 4) return false
          const tokens = n.split(/\s+/)
          if (tokens.length >= 2) return true // "Steven Hoffenberg" — always good
          return n.length >= 8 // Single words: "Hoffenberg" ok, "Daniel" too short
        }),
        url: `${SITE_URL}/entities?q=${encodeURIComponent(e.name)}`
      }
    })
    console.log(`[entity] Loaded ${entityIndex.length} entities for matching`)
  } catch (err) {
    console.warn('[entity] Could not load entity database:', err.message)
    entityIndex = []
  }
}

function matchEntities (text) {
  if (!entityIndex) return []
  const lower = text.toLowerCase()
  const matches = []
  for (const entity of entityIndex) {
    for (const term of entity.searchTerms) {
      const idx = lower.indexOf(term)
      if (idx !== -1) {
        const before = idx === 0 || /\W/.test(lower[idx - 1])
        const after = idx + term.length >= lower.length || /\W/.test(lower[idx + term.length])
        if (before && after) {
          matches.push(entity)
          break
        }
      }
    }
  }
  const seen = new Set()
  const deduped = matches.filter(m => {
    if (seen.has(m.id)) return false
    seen.add(m.id)
    return true
  })
  // Sort: prioritize specific entities (lower doc count) over ubiquitous ones
  // like "Jeffrey Epstein" or "United States". Entities with < 50K docs come
  // first (sorted by doc_count desc within that tier), then the mega-entities.
  deduped.sort((a, b) => {
    const aSpecific = a.doc_count < 50000 ? 0 : 1
    const bSpecific = b.doc_count < 50000 ? 0 : 1
    if (aSpecific !== bSpecific) return aSpecific - bSpecific
    return b.doc_count - a.doc_count
  })
  return deduped.slice(0, 5)
}

function matchKeywords (text) {
  const lower = text.toLowerCase()
  const matched = []
  for (const kw of PRIMARY_KEYWORDS) {
    if (lower.includes(kw)) matched.push(kw)
  }
  if (matched.length > 0) {
    for (const kw of SECONDARY_KEYWORDS) {
      if (lower.includes(kw)) matched.push(kw)
    }
  }
  return matched
}

// ─── Reply Generation ───
async function generateReply (postText, matchedEntities, platform) {
  if (!GROQ_API_KEY) {
    const topEntity = matchedEntities[0]
    if (topEntity) {
      return `The DOJ released 1.4M+ Epstein documents. ${topEntity.name} appears in ${topEntity.doc_count.toLocaleString()} of them. Explore the full network of connections: ${topEntity.url}`
    }
    return `The full DOJ Epstein document release (1.4M+ files) is searchable at ${SITE_URL} — with AI analysis, entity mapping, and an investigative chat.`
  }

  const entityContext = matchedEntities.map(e =>
    `${e.name} (${e.type}, ${e.doc_count.toLocaleString()} docs): ${e.url}`
  ).join('\n')

  const maxLen = platform === 'twitter' ? 280 : platform === 'bluesky' ? 300 : 500

  const prompt = `You are responding on behalf of an anonymous transparency collective that operates a searchable archive of 1.4 million DOJ Epstein documents at unredact.org.

Someone posted this on ${platform}:
"${postText.slice(0, 500)}"

Relevant entities from our archive:
${entityContext}

Write a brief, helpful reply (max ${maxLen} chars) that:
- Adds genuine value to the conversation with a specific fact or resource
- Includes ONE relevant URL from the entities above — PREFER the most specific entity (e.g. link to "Steven Hoffenberg" not "Jeffrey Epstein" if the post discusses Hoffenberg)
- Feels like a knowledgeable researcher sharing a resource, not a bot or ad
- Does NOT use hashtags or emojis
- Is conversational and direct

Return ONLY the reply text, nothing else.`

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 200,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)
    let reply = data.choices[0].message.content.trim()
    reply = reply.replace(/^["']|["']$/g, '')
    return reply
  } catch (err) {
    console.warn('[groq] Reply generation failed:', err.message)
    const topEntity = matchedEntities[0]
    if (topEntity) {
      return `Relevant: ${topEntity.name} appears in ${topEntity.doc_count.toLocaleString()} DOJ Epstein documents. Full searchable archive with AI analysis: ${topEntity.url}`
    }
    return null
  }
}

// ─── Store Opportunity ───
const insertOpp = db.prepare(`
  INSERT OR IGNORE INTO opportunities
    (platform, post_url, author_handle, author_display_name, author_followers, post_text,
     matched_keywords, matched_entities, suggested_reply, engagement_score, content_score, total_score, found_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

async function storeOpportunity (platform, postUrl, authorHandle, authorName, text, keywords, entities, engagementScore, followers) {
  const existing = db.prepare('SELECT id FROM opportunities WHERE post_url = ?').get(postUrl)
  if (existing) return false

  const contentScore = computeContentScore(text, keywords, entities)
  const followerScore = computeFollowerScore(followers || 0)
  const totalScore = computeTotalScore(contentScore, engagementScore, followerScore)

  const reply = await generateReply(text, entities, platform)
  if (!reply) return false

  insertOpp.run(
    platform, postUrl, authorHandle || null, authorName || null, followers || 0,
    text.slice(0, 2000), JSON.stringify(keywords),
    JSON.stringify(entities.map(e => ({ name: e.name, type: e.type, doc_count: e.doc_count, url: e.url }))),
    reply, engagementScore, contentScore, totalScore, Date.now()
  )
  console.log(`[${platform}] New (score:${totalScore}): @${authorHandle || '?'} — "${text.slice(0, 80)}..."`)
  return true
}

// ─── Bluesky Firehose ───
let wsReconnectDelay = 1000

function startFirehose () {
  console.log('[bluesky] Connecting to Jetstream firehose...')
  const ws = new WebSocket(JETSTREAM_URL)
  let messageCount = 0
  let matchCount = 0

  ws.on('open', () => {
    console.log('[bluesky] Firehose connected')
    wsReconnectDelay = 1000
  })

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data)
      messageCount++

      if (messageCount % 50000 === 0) {
        console.log(`[bluesky] Processed ${messageCount} posts, ${matchCount} matches`)
      }

      if (msg.kind !== 'commit' || msg.commit.operation !== 'create') return
      if (msg.commit.collection !== 'app.bsky.feed.post') return

      const record = msg.commit.record
      if (!record || !record.text) return

      if (isBlockedText(record.text)) return

      const keywords = matchKeywords(record.text)
      if (keywords.length === 0) return

      matchCount++
      const entities = matchEntities(record.text)
      const postUrl = `https://bsky.app/profile/${msg.did}/post/${msg.commit.rkey}`

      // Quick pre-check: skip low-quality matches before expensive API calls
      const quickContentScore = computeContentScore(record.text, keywords, entities)
      if (quickContentScore < MIN_FIREHOSE_SCORE) return

      let handle = msg.did
      let displayName = null
      let followers = 0
      try {
        const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${msg.did}`)
        if (res.ok) {
          const profile = await res.json()
          handle = profile.handle || msg.did
          displayName = profile.displayName || null
          followers = profile.followersCount || 0
        }
      } catch {}

      if (isBlocked(handle)) return

      await storeOpportunity('bluesky', postUrl, handle, displayName, record.text, keywords, entities, 0, followers)
    } catch {}
  })

  ws.on('close', () => {
    console.log(`[bluesky] Firehose disconnected, reconnecting in ${wsReconnectDelay / 1000}s...`)
    setTimeout(startFirehose, wsReconnectDelay)
    wsReconnectDelay = Math.min(wsReconnectDelay * 2, 60000)
  })

  ws.on('error', (err) => {
    console.warn('[bluesky] Firehose error:', err.message)
  })
}

// ─── Bluesky Search ───
async function searchBluesky () {
  const queries = [
    'epstein documents', 'epstein files', 'jeffrey epstein',
    'ghislaine maxwell', 'epstein flight logs', 'epstein island',
    'epstein list', 'lolita express',
  ]

  for (const q of queries) {
    try {
      const url = `${BSKY_SEARCH_URL}?q=${encodeURIComponent(q)}&limit=25&sort=latest`
      const res = await fetch(url)
      if (!res.ok) continue
      const data = await res.json()

      for (const post of (data.posts || [])) {
        if (isBlocked(post.author?.handle)) continue
        const text = post.record?.text
        if (!text) continue

        const keywords = matchKeywords(text)
        if (keywords.length === 0) continue

        const entities = matchEntities(text)
        const postUrl = `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}`
        const engagement = (post.likeCount || 0) + (post.repostCount || 0) * 3 + (post.replyCount || 0) * 2
        const followers = post.author?.followersCount || 0

        await storeOpportunity('bluesky', postUrl, post.author.handle, post.author.displayName, text, keywords, entities, engagement, followers)
      }
      await new Promise(r => setTimeout(r, 500))
    } catch (err) {
      console.warn('[bluesky-search] Error for "%s":', q, err.message)
    }
  }
}

// ─── Reddit Search ───
async function searchReddit () {
  const queries = [
    'epstein documents', 'epstein files release', 'jeffrey epstein DOJ',
    'ghislaine maxwell trial', 'epstein flight logs',
  ]
  const subreddits = ['Epstein', 'EpsteinAndFriends', 'conspiracy', 'law', 'news', 'politics']

  for (const q of queries) {
    try {
      const url = `${REDDIT_SEARCH_URL}?q=${encodeURIComponent(q)}&sort=new&limit=25&t=week`
      const res = await fetch(url, { headers: { 'User-Agent': 'SpillArchiveMonitor/1.0' } })
      if (!res.ok) continue
      const data = await res.json()

      for (const child of (data.data?.children || [])) {
        const post = child.data
        if (!post) continue
        if (isBlocked(post.author)) continue

        const text = `${post.title || ''} ${post.selftext || ''}`.trim()
        const keywords = matchKeywords(text)
        if (keywords.length === 0) continue

        const entities = matchEntities(text)
        const postUrl = `https://reddit.com${post.permalink}`
        const engagement = (post.score || 0) + (post.num_comments || 0) * 2

        await storeOpportunity('reddit', postUrl, post.author, null, text.slice(0, 2000), keywords, entities, engagement, 0)
      }
      await new Promise(r => setTimeout(r, 1000))
    } catch (err) {
      console.warn('[reddit] Error for "%s":', q, err.message)
    }
  }

  for (const sub of subreddits) {
    try {
      const url = `https://www.reddit.com/r/${sub}/new.json?limit=25`
      const res = await fetch(url, { headers: { 'User-Agent': 'SpillArchiveMonitor/1.0' } })
      if (!res.ok) continue
      const data = await res.json()

      for (const child of (data.data?.children || [])) {
        const post = child.data
        if (!post) continue
        if (isBlocked(post.author)) continue

        const text = `${post.title || ''} ${post.selftext || ''}`.trim()
        const keywords = matchKeywords(text)
        if (keywords.length === 0) continue

        const entities = matchEntities(text)
        const postUrl = `https://reddit.com${post.permalink}`
        const engagement = (post.score || 0) + (post.num_comments || 0) * 2

        await storeOpportunity('reddit', postUrl, post.author, null, text.slice(0, 2000), keywords, entities, engagement, 0)
      }
      await new Promise(r => setTimeout(r, 1000))
    } catch (err) {
      console.warn('[reddit] Error for r/%s:', sub, err.message)
    }
  }
}

// ─── Dashboard Server ───
function startDashboard () {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${DASHBOARD_PORT}`)

    if (url.pathname === '/api/opportunities') {
      const status = url.searchParams.get('status') || 'new'
      const limit = parseInt(url.searchParams.get('limit') || '50')
      const rows = db.prepare('SELECT * FROM opportunities WHERE status = ? ORDER BY total_score DESC, found_at DESC LIMIT ?').all(status, limit)
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
      res.end(JSON.stringify(rows))
      return
    }

    if (url.pathname === '/api/stats') {
      const stats = {
        total: db.prepare('SELECT COUNT(*) as c FROM opportunities').get().c,
        new: db.prepare("SELECT COUNT(*) as c FROM opportunities WHERE status = 'new'").get().c,
        flagged: db.prepare("SELECT COUNT(*) as c FROM opportunities WHERE status = 'flagged'").get().c,
        replied: db.prepare("SELECT COUNT(*) as c FROM opportunities WHERE status = 'replied'").get().c,
        skipped: db.prepare("SELECT COUNT(*) as c FROM opportunities WHERE status = 'skipped'").get().c,
        byPlatform: db.prepare('SELECT platform, COUNT(*) as c FROM opportunities GROUP BY platform').all(),
        last24h: db.prepare('SELECT COUNT(*) as c FROM opportunities WHERE found_at > ?').get(Date.now() - 86400000).c,
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
      res.end(JSON.stringify(stats))
      return
    }

    if (url.pathname === '/api/update' && req.method === 'POST') {
      let body = ''
      req.on('data', c => { body += c })
      req.on('end', () => {
        try {
          const { id, status } = JSON.parse(body)
          db.prepare('UPDATE opportunities SET status = ?, acted_at = ? WHERE id = ?').run(status, Date.now(), id)
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
          res.end('{"ok":true}')
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        }
      })
      return
    }

    // Dashboard HTML
    if (url.pathname === '/' || url.pathname === '/dashboard') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(getDashboardHTML())
      return
    }

    res.writeHead(404)
    res.end('Not found')
  })

  server.listen(DASHBOARD_PORT, () => {
    console.log(`[dashboard] Running at http://localhost:${DASHBOARD_PORT}`)
  })
}

function getDashboardHTML () {
  // Dashboard HTML — all rendered data comes from our own SQLite DB (no user-supplied HTML).
  // The esc() function in the script escapes all text content before insertion.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Social Monitor</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#111;color:#d4d4d4;font-family:system-ui,sans-serif}
    .hdr{padding:20px 24px;border-bottom:1px solid #2e2e2e;display:flex;align-items:center;gap:16px}
    .hdr h1{font-size:18px;font-weight:700}
    .badge{background:rgba(183,28,28,.15);color:#B71C1C;font-size:11px;padding:2px 8px;border-radius:4px;font-weight:600}
    .stats{display:flex;gap:16px;padding:16px 24px;border-bottom:1px solid #2e2e2e;flex-wrap:wrap}
    .st{background:#1a1a1a;border:1px solid #2e2e2e;border-radius:8px;padding:12px 16px;min-width:110px}
    .st .l{font-size:11px;color:#6b7994;text-transform:uppercase;letter-spacing:.05em}
    .st .v{font-size:24px;font-weight:700;margin-top:4px}
    .flt{padding:12px 24px;display:flex;gap:8px}
    .flt button{background:#1a1a1a;border:1px solid #2e2e2e;color:#d4d4d4;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px}
    .flt button.on{border-color:#B71C1C;color:#B71C1C}
    .flt button:hover{border-color:#444}
    .opps{padding:0 24px 24px}
    .opp{background:#1a1a1a;border:1px solid #2e2e2e;border-radius:8px;padding:16px;margin-top:12px;transition:border-color .2s}
    .opp:hover{border-color:#444}
    .opp.high-score{border-left:3px solid #B71C1C}
    .oh{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px}
    .oh-left{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .pl{font-size:11px;font-weight:600;text-transform:uppercase;padding:2px 8px;border-radius:4px}
    .pl.bluesky{background:rgba(32,139,254,.15);color:#208bfe}
    .pl.reddit{background:rgba(255,69,0,.15);color:#ff4500}
    .au{font-size:13px;color:#6b7994}
    .flw{font-size:11px;color:#6b7994;background:#1e1e1e;padding:1px 6px;border-radius:3px}
    .scores{display:flex;gap:8px;align-items:center}
    .sc{font-size:11px;padding:2px 6px;border-radius:3px;font-weight:600}
    .sc-total{background:rgba(183,28,28,.15);color:#B71C1C}
    .sc-detail{background:rgba(255,255,255,.05);color:#888}
    .tx{font-size:14px;line-height:1.6;margin:8px 0}
    .ents{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
    .ent{font-size:11px;background:rgba(183,28,28,.1);color:#B71C1C;padding:2px 8px;border-radius:4px}
    .rpl{background:#111;border:1px solid #2e2e2e;border-radius:6px;padding:12px;margin-top:10px;font-size:13px;line-height:1.5}
    .rl{font-size:11px;color:#6b7994;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em}
    .acts{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
    .acts button{padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;border:1px solid #2e2e2e}
    .bc{background:#B71C1C;color:#fff;border-color:#B71C1C}
    .bc:hover{background:#D32F2F}
    .bo{background:transparent;color:#d4d4d4}.bo:hover{background:#242424}
    .bd{background:transparent;color:#00E676;border-color:#00E676}.bd:hover{background:rgba(0,230,118,.08)}
    .bf{background:transparent;color:#FFD600;border-color:#FFD600}.bf:hover{background:rgba(255,214,0,.08)}
    .bs{background:transparent;color:#6b7994}.bs:hover{background:#242424}
    .empty{text-align:center;padding:60px;color:#6b7994}
    .time{font-size:11px;color:#555}
  </style>
</head>
<body>
  <div class="hdr"><h1>Social Monitor</h1><span class="badge">EPSTEIN FILES ARCHIVE</span></div>
  <div class="stats" id="stats"></div>
  <div class="flt">
    <button class="on" data-s="new">New</button>
    <button data-s="flagged">Flagged</button>
    <button data-s="replied">Replied</button>
    <button data-s="skipped">Skipped</button>
  </div>
  <div class="opps" id="opps"></div>
  <script>
    let cur='new';
    function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
    function ago(ts){const d=Date.now()-ts;if(d<60000)return Math.floor(d/1000)+'s ago';if(d<3600000)return Math.floor(d/60000)+'m ago';if(d<86400000)return Math.floor(d/3600000)+'h ago';return Math.floor(d/86400000)+'d ago'}
    function fmtF(n){if(!n||n<=0)return '';if(n>=1000000)return (n/1000000).toFixed(1)+'M';if(n>=1000)return (n/1000).toFixed(1)+'K';return n.toString()}

    async function ls(){
      const r=await(await fetch('/api/stats')).json();
      const el=document.getElementById('stats');
      el.textContent='';
      const items=[['New',r.new],['Flagged',r.flagged,'#FFD600'],['Replied',r.replied],['Last 24h',r.last24h],['Total',r.total],...r.byPlatform.map(p=>[p.platform,p.c])];
      for(const[l,v,c] of items){const d=document.createElement('div');d.className='st';d.innerHTML='<div class="l">'+esc(l)+'</div><div class="v"'+(c?' style="color:'+c+'"':'')+'>'+v+'</div>';el.appendChild(d)}
    }

    function buildCard(o){
      let e=[];try{e=JSON.parse(o.matched_entities)}catch{}
      const card=document.createElement('div');
      card.className='opp'+(o.total_score>=15?' high-score':'');
      const fl=fmtF(o.author_followers);

      // Build safe HTML — all dynamic text goes through esc()
      let h='<div class="oh"><div class="oh-left">'
        +'<span class="pl '+esc(o.platform)+'">'+esc(o.platform)+'</span>'
        +'<span class="au">@'+esc(o.author_handle||'?')+'</span>'
        +(fl?'<span class="flw">'+esc(fl)+' followers</span>':'')
        +'<span class="time">'+esc(ago(o.found_at))+'</span>'
        +'</div><div class="scores">'
        +'<span class="sc sc-total" title="Total score">'+o.total_score+'</span>'
        +'<span class="sc sc-detail" title="Content">C:'+o.content_score+'</span>'
        +'<span class="sc sc-detail" title="Engagement">E:'+o.engagement_score+'</span>'
        +'</div></div>'
        +'<div class="tx">'+esc(o.post_text.slice(0,500))+'</div>'
        +'<div class="ents">'+e.map(x=>'<span class="ent">'+esc(x.name)+' ('+x.doc_count.toLocaleString()+' docs)</span>').join('')+'</div>'
        +'<div class="rpl"><div class="rl">Suggested Reply</div>'+esc(o.suggested_reply)+'</div>'
        +'<div class="acts" data-id="'+o.id+'"></div>';
      card.innerHTML=h;

      // Add buttons with event listeners (no inline onclick with user data)
      const acts=card.querySelector('.acts');
      const mk=(cls,txt,fn)=>{const b=document.createElement('button');b.className=cls;b.textContent=txt;b.addEventListener('click',fn);acts.appendChild(b)};
      mk('bc','Copy Reply',async function(){await navigator.clipboard.writeText(o.suggested_reply);this.textContent='Copied!';setTimeout(()=>this.textContent='Copy Reply',2000)});
      mk('bo','Open Post',()=>window.open(o.post_url,'_blank'));
      if(cur!=='flagged')mk('bf','Flag for Later',()=>us(o.id,'flagged'));
      if(cur==='flagged')mk('bo','Unflag',()=>us(o.id,'new'));
      mk('bd','Replied',()=>us(o.id,'replied'));
      mk('bs','Skip',()=>us(o.id,'skipped'));
      return card;
    }

    async function lo(){
      const r=await(await fetch('/api/opportunities?status='+cur+'&limit=50')).json();
      const el=document.getElementById('opps');
      el.textContent='';
      if(!r.length){const d=document.createElement('div');d.className='empty';d.textContent='No '+cur+' opportunities yet.';el.appendChild(d);return}
      for(const o of r)el.appendChild(buildCard(o));
    }

    async function us(id,st){await fetch('/api/update',{method:'POST',body:JSON.stringify({id,status:st})});lo();ls()}
    document.querySelectorAll('.flt button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.flt button').forEach(x=>x.classList.remove('on'));b.classList.add('on');cur=b.dataset.s;lo()}));
    ls();lo();setInterval(()=>{ls();lo()},30000);
  </script>
</body>
</html>`
}

// ─── Main ───
async function main () {
  const args = process.argv.slice(2)
  const searchOnly = args.includes('--search-only')
  const blueskyOnly = args.includes('--bluesky-only')

  console.log('=== Social Monitor for Epstein Files Archive ===')
  console.log(`Site: ${SITE_URL}`)
  console.log(`Groq: ${GROQ_API_KEY ? 'configured' : 'not set (using template replies)'}`)

  loadEntityIndex()
  startDashboard()

  if (!searchOnly) {
    startFirehose()
  }

  console.log('[search] Running initial search...')
  await searchBluesky()
  if (!blueskyOnly) {
    await searchReddit()
  }
  console.log('[search] Initial search complete')

  setInterval(async () => {
    console.log('[search] Running periodic search...')
    await searchBluesky()
    if (!blueskyOnly) {
      await searchReddit()
    }
    console.log('[search] Periodic search complete')
  }, SEARCH_INTERVAL_MS)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
