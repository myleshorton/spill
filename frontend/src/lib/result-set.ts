export type RSType = 'search' | 'dataset' | 'featured-photos' | 'featured-videos' | 'recs' | 'similar'

export interface ResultSetContext {
  type: RSType
  pos: number    // 0-based position in result set
  total: number  // total results
  // search-specific
  q?: string
  filter?: string
  // dataset-specific
  ds?: number
  // similar-specific
  docId?: string
}

export function buildResultSetParams(ctx: ResultSetContext): string {
  const p = new URLSearchParams()
  p.set('rs', ctx.type)
  p.set('pos', String(ctx.pos))
  p.set('t', String(ctx.total))
  if (ctx.q) p.set('q', ctx.q)
  if (ctx.filter) p.set('f', ctx.filter)
  if (ctx.ds != null) p.set('ds', String(ctx.ds))
  if (ctx.docId) p.set('did', ctx.docId)
  return p.toString()
}

export function parseResultSetParams(params: URLSearchParams): ResultSetContext | null {
  const type = params.get('rs') as RSType | null
  if (!type) return null
  return {
    type,
    pos: parseInt(params.get('pos') || '0', 10),
    total: parseInt(params.get('t') || '0', 10),
    q: params.get('q') || undefined,
    filter: params.get('f') || undefined,
    ds: params.has('ds') ? Number(params.get('ds')) : undefined,
    docId: params.get('did') || undefined,
  }
}

export function docHrefWithContext(docId: string, ctx: ResultSetContext): string {
  return `/doc/${docId}?${buildResultSetParams(ctx)}`
}

const STORAGE_PREFIX = 'rs:'

export function storeResultList(key: string, ids: string[]): void {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(ids))
  } catch {}
}

export function getResultList(key: string): string[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
