import type { Document, ArchiveStats } from './api'

const SERVER_API = process.env.ARCHIVER_URL || 'http://localhost:4000'

export async function getDocumentServer(id: string): Promise<Document | null> {
  try {
    const res = await fetch(`${SERVER_API}/api/documents/${id}`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function getDocumentCountServer(): Promise<number> {
  try {
    const res = await fetch(`${SERVER_API}/api/stats`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return 0
    const stats: ArchiveStats = await res.json()
    return stats.totalDocuments
  } catch {
    return 0
  }
}

export async function listDocumentsServer(options: {
  limit?: number
  offset?: number
}): Promise<{ documents: Document[]; total: number }> {
  try {
    const params = new URLSearchParams()
    if (options.limit) params.set('limit', String(options.limit))
    if (options.offset) params.set('offset', String(options.offset))
    const res = await fetch(`${SERVER_API}/api/documents?${params}`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return { documents: [], total: 0 }
    return res.json()
  } catch {
    return { documents: [], total: 0 }
  }
}
