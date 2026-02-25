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
  contentType?: string
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

export function thumbnailUrl(id: string): string {
  return `${API_BASE}/documents/${id}/thumbnail`
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
