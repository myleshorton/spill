import { fetchWithUser } from './user'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

export interface Document {
  id: string
  title: string
  fileName: string
  dataSet: number
  contentType: string
  category: string | null
  fileSize: number
  pageCount: number | null
  driveKey: string | null
  fileKey: string | null
  sourceUrl: string | null
  createdAt: number
  indexedAt: number
  hasContent: boolean
  hasThumbnail: boolean
  locationLatitude: number | null
  locationLongitude: number | null
  mediaDate: string | null
  documentDate: string | null
  _geo?: { lat: number; lng: number }
}

export interface SearchResult {
  hits: Document[]
  query: string
  processingTimeMs: number
  estimatedTotalHits: number
  facetDistribution?: {
    dataSet?: Record<string, number>
    contentType?: Record<string, number>
    category?: Record<string, number>
  }
}

export interface DataSetInfo {
  id: number
  name: string
  description: string
  fileCount: number
  totalSize: number
  magnetLink: string | null
  hasTorrent: boolean
}

export interface UploadJob {
  jobId: string
  status: 'pending' | 'scanning' | 'extracting' | 'indexing' | 'complete' | 'failed'
  documentId?: string
  error?: string
}

export interface Collection {
  id: number
  name: string
  description: string | null
  hasTorrent: boolean
  magnetLink: string | null
}

export interface ArchiveStats {
  totalDocuments: number
  totalSize: number
  byContentType: Record<string, number>
  byDataSet: Record<string, number>
  byCategory: Record<string, number>
  peerCount: number
  connected: boolean
}

export async function searchDocuments(
  query: string,
  options: {
    limit?: number
    offset?: number
    filter?: string
  } = {}
): Promise<SearchResult> {
  const params = new URLSearchParams({ q: query })
  if (options.limit) params.set('limit', String(options.limit))
  if (options.offset) params.set('offset', String(options.offset))
  if (options.filter) params.set('filter', options.filter)

  const res = await fetch(`${API_BASE}/documents/search?${params}`)
  if (!res.ok) throw new Error(`Search failed: ${res.status}`)
  return res.json()
}

export async function listDocuments(options: {
  limit?: number
  offset?: number
  dataSet?: number
  contentType?: string  // comma-separated for multiple types
  category?: string
} = {}): Promise<{ documents: Document[], total: number }> {
  const params = new URLSearchParams()
  if (options.limit) params.set('limit', String(options.limit))
  if (options.offset) params.set('offset', String(options.offset))
  if (options.dataSet) params.set('data_set', String(options.dataSet))
  if (options.contentType) params.set('content_type', options.contentType)
  if (options.category) params.set('category', options.category)

  const res = await fetch(`${API_BASE}/documents?${params}`)
  if (!res.ok) throw new Error(`List failed: ${res.status}`)
  return res.json()
}

export async function getDocument(id: string): Promise<Document> {
  const res = await fetch(`${API_BASE}/documents/${id}`)
  if (!res.ok) throw new Error(`Document not found: ${res.status}`)
  return res.json()
}

export async function getDocumentText(id: string): Promise<string> {
  const res = await fetch(`${API_BASE}/documents/${id}/text`)
  if (!res.ok) throw new Error(`Text not found: ${res.status}`)
  const data = await res.json()
  return data.text
}

export async function getStats(): Promise<ArchiveStats> {
  const res = await fetch(`${API_BASE}/stats`)
  if (!res.ok) throw new Error(`Stats failed: ${res.status}`)
  return res.json()
}

export async function getDataSets(): Promise<DataSetInfo[]> {
  const res = await fetch(`${API_BASE}/datasets`)
  if (!res.ok) throw new Error(`Datasets failed: ${res.status}`)
  return res.json()
}

export function contentUrl(id: string): string {
  return `${API_BASE}/documents/${id}/content`
}

export function streamUrl(id: string): string {
  return `${API_BASE}/documents/${id}/stream`
}

export function thumbnailUrl(id: string): string {
  return `${API_BASE}/documents/${id}/thumbnail`
}

export function previewUrl(id: string): string {
  return `${API_BASE}/documents/${id}/preview`
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

export function formatNumber(n: number): string {
  if (n == null || isNaN(n)) return '0'
  return n.toLocaleString('en-US')
}

export function contentTypeIcon(type: string): string {
  switch (type) {
    case 'pdf': return 'file-text'
    case 'image': return 'image'
    case 'video': return 'video'
    case 'audio': return 'headphones'
    case 'email': return 'mail'
    case 'spreadsheet': return 'table'
    default: return 'file'
  }
}

export function torrentUrl(datasetId: number): string {
  return `${API_BASE}/datasets/${datasetId}/torrent`
}

export async function getDataSet(id: number): Promise<DataSetInfo> {
  const res = await fetch(`${API_BASE}/datasets/${id}`)
  if (!res.ok) throw new Error(`Dataset not found: ${res.status}`)
  return res.json()
}

export async function uploadDocument(file: File): Promise<UploadJob> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Upload failed: ${res.status}` }))
    throw new Error(err.error || `Upload failed: ${res.status}`)
  }
  return res.json()
}

export async function getUploadStatus(jobId: string): Promise<UploadJob> {
  const res = await fetch(`${API_BASE}/upload/${jobId}/status`)
  if (!res.ok) throw new Error(`Status check failed: ${res.status}`)
  return res.json()
}

export async function listCollections(): Promise<Collection[]> {
  const res = await fetch(`${API_BASE}/collections`)
  if (!res.ok) throw new Error(`Collections failed: ${res.status}`)
  return res.json()
}

export interface Comment {
  id: number
  documentId: string
  displayName: string
  body: string
  createdAt: number
  updatedAt: number | null
  isOwn: boolean
}

export interface StarStatus {
  starred: boolean
  count: number
}

export interface SimilarDocument extends Document {
  similarityScore: number
}

export async function recordView(docId: string): Promise<void> {
  try {
    await fetchWithUser(`${API_BASE}/views/${docId}`, { method: 'POST' })
  } catch {
    // fire-and-forget
  }
}

export async function getSimilarDocuments(
  docId: string,
  limit = 8
): Promise<SimilarDocument[]> {
  const res = await fetch(`${API_BASE}/documents/${docId}/similar?limit=${limit}`)
  if (!res.ok) return []
  const data = await res.json()
  return data.documents || []
}

export async function getRecommendations(limit = 12): Promise<SimilarDocument[]> {
  const res = await fetchWithUser(`${API_BASE}/recommendations?limit=${limit}`)
  if (!res.ok) return []
  const data = await res.json()
  return data.documents || []
}

export async function requestMagicLink(email: string, returnTo?: string): Promise<{ ok: boolean }> {
  const res = await fetchWithUser(`${API_BASE}/auth/magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, returnTo: returnTo || window.location.pathname }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed' }))
    throw new Error(err.error || `Magic link failed: ${res.status}`)
  }
  return res.json()
}

export async function verifyMagicLink(
  token: string
): Promise<{ ok: boolean; userId: string; email: string }> {
  const res = await fetch(`${API_BASE}/auth/verify?token=${encodeURIComponent(token)}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Invalid token' }))
    throw new Error(err.error || `Verification failed: ${res.status}`)
  }
  return res.json()
}

// --- Featured Videos ---

export async function getFeaturedVideos(options: {
  limit?: number
  offset?: number
} = {}): Promise<{ documents: Document[], total: number }> {
  const params = new URLSearchParams()
  if (options.limit) params.set('limit', String(options.limit))
  if (options.offset) params.set('offset', String(options.offset))

  // Try dedicated endpoint first; fall back to generic video listing if archiver hasn't restarted yet
  const res = await fetch(`${API_BASE}/featured-videos?${params}`)
  if (res.ok) return res.json()

  // Fallback: list all videos
  const fallbackParams = new URLSearchParams()
  fallbackParams.set('content_type', 'video')
  if (options.limit) fallbackParams.set('limit', String(options.limit))
  if (options.offset) fallbackParams.set('offset', String(options.offset))

  const fallback = await fetch(`${API_BASE}/documents?${fallbackParams}`)
  if (!fallback.ok) return { documents: [], total: 0 }
  return fallback.json()
}

// --- Featured Photos ---

export async function getFeaturedPhotos(options: {
  limit?: number
  offset?: number
} = {}): Promise<{ documents: Document[], total: number }> {
  const params = new URLSearchParams()
  if (options.limit) params.set('limit', String(options.limit))
  if (options.offset) params.set('offset', String(options.offset))

  // Try dedicated endpoint first; fall back to Meilisearch nudity query if archiver hasn't restarted yet
  const res = await fetch(`${API_BASE}/featured-photos?${params}`)
  if (res.ok) return res.json()

  // Fallback: search for nudity keywords via Meilisearch
  const limit = options.limit || 12
  const offset = options.offset || 0
  const fallback = await fetch(`${API_BASE}/documents/search?q=nudity&filter=contentType%20%3D%20image&limit=${limit}&offset=${offset}`)
  if (!fallback.ok) return { documents: [], total: 0 }
  const data = await fallback.json()
  return { documents: data.hits || [], total: data.estimatedTotalHits || 0 }
}

// --- Activity Feed ---

export interface ActivityData {
  ts: number
  totals: {
    documents: number
    transcripts: number
    entities: number
    financials: number
    geoLocated: number
    withKeywords: number
    indexed: number
    totalBytes: number
    collections: number
    torrents: number
  }
  pending: {
    textExtracted: number
    textPending: number
    textTotal: number
    avTotal: number
    avTranscribed: number
    avPending: number
  }
  recent: {
    count: number
    byType: Record<string, number>
  }
  deltas: {
    documentsAdded: number
    transcriptsAdded: number
    entitiesExtracted: number
    financialsScanned: number
    geoLocated: number
    keywordsAdded: number
  } | null
  latestDoc: { title: string; contentType: string } | null
  status: {
    peerCount: number
    connected: boolean
    uptime: number
  }
}

export async function getActivity(): Promise<ActivityData> {
  const res = await fetch(`${API_BASE}/activity`)
  if (!res.ok) throw new Error(`Activity failed: ${res.status}`)
  return res.json()
}

// --- Feature 1: Transcription ---

export async function getDocumentTranscript(id: string): Promise<string> {
  const res = await fetch(`${API_BASE}/documents/${id}/transcript`)
  if (!res.ok) return ''
  const data = await res.json()
  return data.transcript || ''
}

// --- Feature 3: Entities ---

export interface Entity {
  id: number
  name: string
  type: string
  documentCount: number
  mentionCount?: number
}

export interface EntityEdge {
  source: number
  target: number
  sharedDocs: number
}

export interface EntityGraph {
  nodes: Entity[]
  edges: EntityEdge[]
}

export async function getDocumentEntities(id: string): Promise<Entity[]> {
  const res = await fetch(`${API_BASE}/documents/${id}/entities`)
  if (!res.ok) return []
  const data = await res.json()
  return data.entities || []
}

export async function getTopEntities(type?: string, limit?: number): Promise<Entity[]> {
  const params = new URLSearchParams()
  if (type) params.set('type', type)
  if (limit) params.set('limit', String(limit))
  const res = await fetch(`${API_BASE}/entities?${params}`)
  if (!res.ok) return []
  const data = await res.json()
  return data.entities || []
}

export interface EntityDetail {
  id: number
  name: string
  type: string
  normalizedName: string
  documentCount: number
  description: string | null
  aliases: string[]
  photoUrl: string | null
  externalUrls: Record<string, string>
}

export interface EntityRelationship {
  id: number
  relationshipType: string
  description: string | null
  sourceDocumentId: string | null
  direction: 'outgoing' | 'incoming'
  otherEntity: { id: number; name: string; type: string }
}

export interface RelatedEntity {
  id: number
  name: string
  type: string
  sharedDocuments: number
}

export async function getEntity(id: number): Promise<EntityDetail | null> {
  const res = await fetch(`${API_BASE}/entities/${id}`)
  if (!res.ok) return null
  return res.json()
}

export async function getRelatedEntities(entityId: number, limit = 20): Promise<RelatedEntity[]> {
  const res = await fetch(`${API_BASE}/entities/${entityId}/related?limit=${limit}`)
  if (!res.ok) return []
  const data = await res.json()
  return data.entities || []
}

export async function searchEntities(params: {
  q?: string
  type?: string
  limit?: number
  offset?: number
} = {}): Promise<{ entities: EntityDetail[]; total: number }> {
  const searchParams = new URLSearchParams()
  if (params.q) searchParams.set('q', params.q)
  if (params.type) searchParams.set('type', params.type)
  if (params.limit) searchParams.set('limit', String(params.limit))
  if (params.offset) searchParams.set('offset', String(params.offset))
  const res = await fetch(`${API_BASE}/entities/search?${searchParams}`)
  if (!res.ok) return { entities: [], total: 0 }
  return res.json()
}

export async function getEntityDocuments(entityId: number, limit = 50, offset = 0): Promise<{ documents: (Document & { mentionCount: number })[]; total: number }> {
  const res = await fetch(`${API_BASE}/entities/${entityId}/documents?limit=${limit}&offset=${offset}`)
  if (!res.ok) return { documents: [], total: 0 }
  return res.json()
}

export async function getEntityGraph(minShared = 2, limit = 100): Promise<EntityGraph> {
  const res = await fetch(`${API_BASE}/entities/graph?minShared=${minShared}&limit=${limit}`)
  if (!res.ok) return { nodes: [], edges: [] }
  return res.json()
}

export async function getEntityRelationships(entityId: number, limit = 50): Promise<EntityRelationship[]> {
  const res = await fetch(`${API_BASE}/entities/${entityId}/relationships?limit=${limit}`)
  if (!res.ok) return []
  const data = await res.json()
  return data.relationships || []
}

export async function getRelationshipTypes(): Promise<{ type: string; count: number }[]> {
  const res = await fetch(`${API_BASE}/entities/relationship-types`)
  if (!res.ok) return []
  const data = await res.json()
  return data.types || []
}

export async function getEntityQuestions(entityId: number): Promise<{ questions: string[]; generatedAt: number }> {
  const res = await fetch(`${API_BASE}/entities/${entityId}/questions`)
  if (!res.ok) return { questions: [], generatedAt: 0 }
  return res.json()
}

// --- Feature 4: Financial ---

export interface FinancialRecord {
  id: number
  documentId: string
  type: string
  amount: number | null
  currency: string
  date: string | null
  from: string | null
  to: string | null
  description: string | null
}

export interface FinancialSummary {
  totalRecords: number
  totalAmount: number
  topFromEntities: { name: string; total: number }[]
  topToEntities: { name: string; total: number }[]
  dateRange: { min: string | null; max: string | null }
}

export async function getDocumentFinancials(id: string): Promise<FinancialRecord[]> {
  const res = await fetch(`${API_BASE}/documents/${id}/financials`)
  if (!res.ok) return []
  const data = await res.json()
  return data.records || []
}

export async function getFinancialSummary(): Promise<FinancialSummary> {
  const res = await fetch(`${API_BASE}/analysis/financial/summary`)
  if (!res.ok) return { totalRecords: 0, totalAmount: 0, topFromEntities: [], topToEntities: [], dateRange: { min: null, max: null } }
  return res.json()
}

export async function getFinancialRecords(params: {
  entity?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
} = {}): Promise<{ records: FinancialRecord[]; total: number }> {
  const searchParams = new URLSearchParams()
  if (params.entity) searchParams.set('entity', params.entity)
  if (params.from) searchParams.set('from', params.from)
  if (params.to) searchParams.set('to', params.to)
  if (params.limit) searchParams.set('limit', String(params.limit))
  if (params.offset) searchParams.set('offset', String(params.offset))
  const res = await fetch(`${API_BASE}/analysis/financial/records?${searchParams}`)
  if (!res.ok) return { records: [], total: 0 }
  return res.json()
}

// --- Votes ---

export interface VoteStatus {
  userVote: number  // 1, -1, or 0
  upvotes: number
  downvotes: number
  score: number
}

export async function vote(docId: string, value: 1 | -1 | 0): Promise<VoteStatus> {
  const res = await fetchWithUser(`${API_BASE}/documents/${docId}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  })
  if (!res.ok) return { userVote: 0, upvotes: 0, downvotes: 0, score: 0 }
  return res.json()
}

export async function getVoteStatus(docId: string): Promise<VoteStatus> {
  const res = await fetchWithUser(`${API_BASE}/documents/${docId}/vote`)
  if (!res.ok) return { userVote: 0, upvotes: 0, downvotes: 0, score: 0 }
  return res.json()
}

// --- Stars & Comments ---

export async function toggleStar(docId: string): Promise<StarStatus> {
  const res = await fetchWithUser(`${API_BASE}/documents/${docId}/star`, { method: 'POST' })
  if (!res.ok) throw new Error(`Star toggle failed: ${res.status}`)
  return res.json()
}

export async function getStarStatus(docId: string): Promise<StarStatus> {
  const res = await fetchWithUser(`${API_BASE}/documents/${docId}/star`)
  if (!res.ok) return { starred: false, count: 0 }
  return res.json()
}

export async function getComments(docId: string, limit = 50, offset = 0): Promise<{ comments: Comment[]; total: number }> {
  const res = await fetchWithUser(`${API_BASE}/documents/${docId}/comments?limit=${limit}&offset=${offset}`)
  if (!res.ok) return { comments: [], total: 0 }
  return res.json()
}

export async function addComment(docId: string, body: string, displayName: string): Promise<Comment> {
  const res = await fetchWithUser(`${API_BASE}/documents/${docId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, displayName }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed' }))
    throw new Error(err.error || `Comment failed: ${res.status}`)
  }
  return res.json()
}

export async function updateComment(commentId: number, body: string): Promise<Comment> {
  const res = await fetchWithUser(`${API_BASE}/comments/${commentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed' }))
    throw new Error(err.error || `Update failed: ${res.status}`)
  }
  return res.json()
}

export async function deleteComment(commentId: number): Promise<void> {
  const res = await fetchWithUser(`${API_BASE}/comments/${commentId}`, { method: 'DELETE' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed' }))
    throw new Error(err.error || `Delete failed: ${res.status}`)
  }
}

export async function getStarredDocuments(limit = 50, offset = 0): Promise<{ documents: Document[] }> {
  const res = await fetchWithUser(`${API_BASE}/stars?limit=${limit}&offset=${offset}`)
  if (!res.ok) return { documents: [] }
  return res.json()
}

// --- Chat / RAG ---

export interface ChatSource {
  id: string
  title: string
  contentType: string
  category: string | null
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: ChatSource[]
}

export async function streamChat(
  query: string,
  history: ChatMessage[],
  onSources: (sources: ChatSource[]) => void,
  onDelta: (text: string) => void,
  onDone: (usage: Record<string, number>) => void,
  onError: (error: string) => void,
  signal?: AbortSignal,
  entityId?: number
): Promise<void> {
  const body: Record<string, unknown> = {
    query,
    history: history.map(m => ({ role: m.role, content: m.content }))
  }
  if (entityId) body.entityId = entityId
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Request failed' }))
    onError(data.error || `Request failed: ${res.status}`)
    return
  }

  // If response is JSON (no-docs case), handle it
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const data = await res.json()
    if (data.type === 'error') {
      onError(data.error)
    }
    return
  }

  // Parse SSE stream
  const reader = res.body?.getReader()
  if (!reader) {
    onError('No response body')
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const jsonStr = line.slice(6)
      if (!jsonStr) continue

      try {
        const event = JSON.parse(jsonStr)
        switch (event.type) {
          case 'sources':
            onSources(event.sources)
            break
          case 'delta':
            onDelta(event.text)
            break
          case 'done':
            onDone(event.usage || {})
            break
          case 'error':
            onError(event.error)
            break
        }
      } catch {
        // skip malformed JSON
      }
    }
  }
}
