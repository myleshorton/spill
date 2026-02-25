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

export function dataSetName(ds: number): string {
  const names: Record<number, string> = {
    1: 'DS 1 — FBI Interview Summaries (Part 1)',
    2: 'DS 2 — FBI Interview Summaries (Part 2)',
    3: 'DS 3 — Palm Beach Police Reports (Part 1)',
    4: 'DS 4 — Palm Beach Police Reports (Part 2)',
    5: 'DS 5 — Grand Jury Materials',
    6: 'DS 6 — Victim Statements & Depositions',
    7: 'DS 7 — Search Warrants & Seizure Records',
    8: 'DS 8 — Prosecution Memoranda',
    9: 'DS 9 — Emails & DOJ Correspondence',
    10: 'DS 10 — Seized Images & Videos',
    11: 'DS 11 — Financial Records & Flight Logs',
    12: 'DS 12 — Supplemental Productions',
  }
  return names[ds] || `Data Set ${ds}`
}

export function dataSetDescription(ds: number): string {
  const desc: Record<number, string> = {
    1: 'FBI interview summaries from the Palm Beach investigation (2005-2008). Witness statements and investigative notes.',
    2: 'Continuation of FBI interview summaries. Additional witness accounts and cross-references.',
    3: 'Palm Beach Police Department reports from the initial investigation. Incident reports, officer statements.',
    4: 'Additional Palm Beach police documentation. Surveillance records and patrol reports.',
    5: 'Grand jury materials including testimony transcripts and evidentiary exhibits.',
    6: 'Victim impact statements, depositions, and related court filings.',
    7: 'Search warrant applications, execution records, and property seizure inventories.',
    8: 'Internal DOJ prosecution memoranda, case strategy documents, and legal analysis.',
    9: 'Email correspondence between DOJ officials, the non-prosecution agreement, and related communications. ~181GB.',
    10: 'Approximately 180,000 images and 2,000 videos seized from Epstein properties. ~78.6GB.',
    11: 'Financial ledgers, bank records, flight manifests (including Lolita Express logs), and property seizure records. ~25.5GB.',
    12: 'Late-produced supplemental items, errata, and additional materials. ~114MB.',
  }
  return desc[ds] || ''
}
