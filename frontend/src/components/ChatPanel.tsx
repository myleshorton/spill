'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Send, ChevronDown, ChevronUp, AlertCircle, FileText, Loader2, MessageSquare, Search, Headphones, Image, Video, Mail, Table, File } from 'lucide-react'
import { streamChat, searchDocuments, type ChatSource, type Document, thumbnailUrl, formatFileSize } from '@/lib/api'

// --- Citation rendering (reused from chat) ---

function CitationText({ text, sources }: { text: string; sources: ChatSource[] }) {
  const sourceMap = new Map(sources.map(s => [s.id, s]))
  const parts = text.split(/(\[DOC:[^\]]+\])/)

  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\[DOC:([^\]]+)\]$/)
        if (match) {
          const docId = match[1].trim()
          const source = sourceMap.get(docId)
          return (
            <Link
              key={i}
              href={`/doc/${docId}`}
              className="mx-0.5 inline-flex items-center gap-1 rounded bg-spill-accent/15 px-1.5 py-0.5 text-xs font-medium text-spill-accent hover:bg-spill-accent/25 transition-colors"
              title={source?.title || docId}
            >
              <FileText className="h-3 w-3" />
              {source?.title
                ? source.title.length > 30
                  ? source.title.slice(0, 30) + '...'
                  : source.title
                : docId}
            </Link>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

// --- Content type icons ---

function ContentTypeIcon({ type, className }: { type: string; className?: string }) {
  const props = { className: className || 'h-4 w-4' }
  switch (type) {
    case 'pdf': return <FileText {...props} />
    case 'image': return <Image {...props} />
    case 'video': return <Video {...props} />
    case 'audio': return <Headphones {...props} />
    case 'email': return <Mail {...props} />
    case 'spreadsheet': return <Table {...props} />
    default: return <File {...props} />
  }
}

// --- Main component ---

const AI_COLLAPSE_CHARS = 600

export default function ChatPanel({ initialQuery, initialEntityId }: { initialQuery?: string; initialEntityId?: number }) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Current query being displayed
  const [activeQuery, setActiveQuery] = useState('')

  // AI answer state
  const [aiText, setAiText] = useState('')
  const [aiSources, setAiSources] = useState<ChatSource[]>([])
  const [aiStreaming, setAiStreaming] = useState(false)
  const [aiDone, setAiDone] = useState(false)
  const [aiExpanded, setAiExpanded] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Search results state
  const [searchHits, setSearchHits] = useState<Document[]>([])
  const [searchTotal, setSearchTotal] = useState(0)
  const [searchLoading, setSearchLoading] = useState(false)

  // Track entity context (set from URL param, cleared on manual queries)
  const [entityId, setEntityId] = useState<number | undefined>(initialEntityId)

  // Run query — used for both initial and subsequent queries
  const runQuery = useCallback((q: string, eId?: number) => {
    // Abort any previous request
    abortRef.current?.abort()

    setActiveQuery(q)
    setAiText('')
    setAiSources([])
    setAiStreaming(true)
    setAiDone(false)
    setAiExpanded(false)
    setAiError(null)
    setSearchHits([])
    setSearchTotal(0)
    setSearchLoading(true)

    // Fire search and AI in parallel
    searchDocuments(q, { limit: 10 }).then(result => {
      setSearchHits(result.hits)
      setSearchTotal(result.estimatedTotalHits)
      setSearchLoading(false)
    }).catch(() => setSearchLoading(false))

    const controller = new AbortController()
    abortRef.current = controller
    let fullText = ''

    streamChat(
      q,
      [],
      (s) => { setAiSources(s) },
      (delta) => { fullText += delta; setAiText(fullText) },
      () => { setAiStreaming(false); setAiDone(true) },
      (err) => { setAiStreaming(false); setAiDone(true); setAiError(err) },
      controller.signal,
      eId
    ).catch(() => { setAiStreaming(false); setAiDone(true) })
  }, [])

  // Auto-run initialQuery on mount
  const initialSubmitted = useRef(false)
  useEffect(() => {
    if (initialQuery && !initialSubmitted.current) {
      initialSubmitted.current = true
      runQuery(initialQuery, initialEntityId)
    }
  }, [initialQuery, initialEntityId, runQuery])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = input.trim()
    if (!q) return
    // Manual queries clear entity context
    setEntityId(undefined)
    router.replace(`/chat?q=${encodeURIComponent(q)}`, { scroll: false })
    setInput('')
    runQuery(q)
  }

  // Truncation logic
  const needsTruncation = aiDone && aiText.length > AI_COLLAPSE_CHARS
  const displayText = (!aiExpanded && needsTruncation)
    ? aiText.slice(0, AI_COLLAPSE_CHARS)
    : aiText

  const hasResults = activeQuery.length > 0

  return (
    <div className="flex flex-1 flex-col">
      {/* Search input bar at top */}
      <div className="sticky top-0 z-20 border-b border-spill-divider bg-spill-bg/95 backdrop-blur-sm px-4 py-3 sm:px-6">
        <form onSubmit={handleSubmit} className="mx-auto max-w-3xl relative">
          <MessageSquare className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-spill-text-secondary" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask another question..."
            className="w-full border border-spill-divider bg-spill-surface py-2.5 pl-11 pr-11 text-sm rounded-xl font-body text-spill-text-primary focus:border-spill-accent/50 focus:outline-none focus:ring-1 focus:ring-spill-accent/30 transition-all placeholder:text-spill-text-secondary/50"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg bg-spill-accent text-white hover:bg-spill-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-5">
          {!hasResults && (
            <div className="py-16 text-center">
              <h2 className="font-serif text-2xl text-spill-text-primary">Ask the Archive</h2>
              <p className="mt-3 text-sm text-spill-text-secondary">
                Ask questions about the documents. Get an AI-powered answer with document search results.
              </p>
            </div>
          )}

          {hasResults && (
            <>
              {/* Query display */}
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-spill-accent/15">
                  <MessageSquare className="h-3.5 w-3.5 text-spill-accent" />
                </div>
                <h1 className="text-lg font-medium text-spill-text-primary pt-0.5">{activeQuery}</h1>
              </div>

              {/* AI Answer card */}
              <div className="rounded-xl border border-spill-divider bg-spill-surface overflow-hidden">
                <div className="flex items-center gap-2 border-b border-spill-divider px-4 py-2.5">
                  <MessageSquare className="h-4 w-4 text-spill-accent" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-spill-accent">AI Answer</span>
                  {aiStreaming && <Loader2 className="h-3 w-3 animate-spin text-spill-text-secondary" />}
                </div>

                <div className="px-4 py-3">
                  {aiError && (
                    <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-400">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      {aiError}
                    </div>
                  )}

                  {aiText ? (
                    <div className="prose-sm text-sm leading-relaxed text-spill-text-primary whitespace-pre-wrap">
                      <CitationText text={displayText} sources={aiSources} />
                      {!aiExpanded && needsTruncation && (
                        <span className="text-spill-text-secondary/60">...</span>
                      )}
                    </div>
                  ) : aiStreaming ? (
                    <div className="flex items-center gap-2 text-sm text-spill-text-secondary">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching documents...
                    </div>
                  ) : aiDone && !aiError ? (
                    <p className="text-sm text-spill-text-secondary">No AI answer available.</p>
                  ) : null}
                </div>

                {/* Footer: show more / sources count */}
                {aiText && (
                  <div className="border-t border-spill-divider px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {needsTruncation && (
                        <button
                          onClick={() => setAiExpanded(!aiExpanded)}
                          className="flex items-center gap-1 text-xs font-medium text-spill-accent hover:text-spill-accent-hover transition-colors"
                        >
                          {aiExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          {aiExpanded ? 'Show less' : 'Show more'}
                        </button>
                      )}
                      {aiSources.length > 0 && (
                        <span className="text-xs text-spill-text-secondary/60">
                          {aiSources.length} source{aiSources.length !== 1 ? 's' : ''} cited
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Expanded sources list */}
                {aiExpanded && aiSources.length > 0 && (
                  <div className="border-t border-spill-divider px-4 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {aiSources.map(s => (
                        <Link
                          key={s.id}
                          href={`/doc/${s.id}`}
                          className="flex items-center gap-1.5 rounded-md border border-spill-divider bg-spill-bg px-2 py-1 text-xs text-spill-text-secondary hover:border-spill-accent/30 hover:text-spill-text-primary transition-colors"
                        >
                          <FileText className="h-3 w-3 shrink-0" />
                          <span className="max-w-[200px] truncate">{s.title}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Search Results */}
              <div className="rounded-xl border border-spill-divider bg-spill-surface overflow-hidden">
                <div className="flex items-center justify-between border-b border-spill-divider px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-spill-text-secondary" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-spill-text-secondary">
                      Documents
                    </span>
                    {searchLoading && <Loader2 className="h-3 w-3 animate-spin text-spill-text-secondary" />}
                    {!searchLoading && searchTotal > 0 && (
                      <span className="text-xs text-spill-text-secondary/60">
                        {searchTotal.toLocaleString()} found
                      </span>
                    )}
                  </div>
                  {searchTotal > 10 && (
                    <Link
                      href={`/search?q=${encodeURIComponent(activeQuery)}`}
                      className="text-xs font-medium text-spill-accent hover:text-spill-accent-hover transition-colors"
                    >
                      View all &rarr;
                    </Link>
                  )}
                </div>

                {searchLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-spill-text-secondary" />
                  </div>
                ) : searchHits.length > 0 ? (
                  <div className="divide-y divide-spill-divider">
                    {searchHits.map((doc) => (
                      <SearchResultRow key={doc.id} doc={doc} />
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-spill-text-secondary">
                    No matching documents found.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="py-2 text-center text-[11px] text-spill-text-secondary/40">
        Answers are generated from archive documents. Always verify claims against original sources.
      </p>
    </div>
  )
}

// --- Search result row ---

function SearchResultRow({ doc }: { doc: Document }) {
  const [thumbError, setThumbError] = useState(false)

  return (
    <Link
      href={`/doc/${doc.id}`}
      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-spill-surface-light"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-spill-bg overflow-hidden">
        {doc.hasThumbnail && !thumbError ? (
          <img
            src={thumbnailUrl(doc.id)}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setThumbError(true)}
            loading="lazy"
          />
        ) : (
          <ContentTypeIcon type={doc.contentType} className="h-4 w-4 text-spill-text-secondary/40" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-spill-text-primary group-hover:text-spill-accent transition-colors">
          {doc.title}
        </p>
        <div className="flex items-center gap-2 text-xs text-spill-text-secondary/70">
          <span className="uppercase">{doc.contentType}</span>
          <span className="text-spill-divider">&middot;</span>
          <span>DS {doc.dataSet}</span>
          {doc.fileSize > 0 && (
            <>
              <span className="text-spill-divider">&middot;</span>
              <span>{formatFileSize(doc.fileSize)}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}
