'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, AlertCircle, FileText, Loader2, MessageSquare } from 'lucide-react'
import { streamChat, type ChatSource } from '@/lib/api'

function CitationText({ text, sources }: { text: string; sources: ChatSource[] }) {
  const sourceMap = new Map(sources.map(s => [s.id, s]))
  const parts = text.split(/(\[DOC:[^\]]+\])/)

  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\[DOC:([^\]]+)\]$/)
        if (match) {
          const docId = match[1]
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

const COLLAPSED_HEIGHT = 160 // px

export default function AIAnswerCard({ query }: { query: string }) {
  const [aiText, setAiText] = useState('')
  const [aiSources, setAiSources] = useState<ChatSource[]>([])
  const [aiStreaming, setAiStreaming] = useState(false)
  const [aiDone, setAiDone] = useState(false)
  const [aiExpanded, setAiExpanded] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const lastQueryRef = useRef('')
  const contentRef = useRef<HTMLDivElement>(null)

  const runQuery = useCallback((q: string) => {
    abortRef.current?.abort()

    setAiText('')
    setAiSources([])
    setAiStreaming(true)
    setAiDone(false)
    setAiExpanded(false)
    setAiError(null)
    setIsOverflowing(false)

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
      controller.signal
    ).catch(() => { setAiStreaming(false); setAiDone(true) })
  }, [])

  useEffect(() => {
    if (query && query !== lastQueryRef.current) {
      lastQueryRef.current = query
      runQuery(query)
    }
    return () => { abortRef.current?.abort() }
  }, [query, runQuery])

  // Check overflow whenever text changes
  useEffect(() => {
    if (contentRef.current && !aiExpanded) {
      setIsOverflowing(contentRef.current.scrollHeight > COLLAPSED_HEIGHT)
    }
  }, [aiText, aiExpanded])

  if (!query) return null

  return (
    <div className="rounded-xl border border-spill-divider bg-spill-surface overflow-hidden">
      <div className="flex items-center gap-2 border-b border-spill-divider px-4 py-2.5">
        <MessageSquare className="h-4 w-4 text-spill-accent" />
        <span className="text-xs font-semibold uppercase tracking-wider text-spill-accent">AI Answer</span>
        {aiStreaming && <Loader2 className="h-3 w-3 animate-spin text-spill-text-secondary" />}
      </div>

      <div className="relative">
        <div
          ref={contentRef}
          className="px-4 py-3 overflow-hidden transition-[max-height] duration-300"
          style={{ maxHeight: aiExpanded ? contentRef.current?.scrollHeight ?? 'none' : COLLAPSED_HEIGHT }}
        >
          {aiError && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {aiError}
            </div>
          )}

          {aiText ? (
            <div className="prose-sm text-sm leading-relaxed text-spill-text-primary whitespace-pre-wrap">
              <CitationText text={aiText} sources={aiSources} />
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

        {/* Fade overlay when collapsed and overflowing */}
        {!aiExpanded && isOverflowing && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-spill-surface to-transparent" />
        )}
      </div>

      {/* Footer: show more / sources count */}
      {(isOverflowing || aiExpanded || aiSources.length > 0) && aiText && (
        <div className="border-t border-spill-divider px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {(isOverflowing || aiExpanded) && (
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

      <p className="border-t border-spill-divider px-4 py-1.5 text-[10px] text-spill-text-secondary/40">
        AI-generated from archive documents. Verify claims against original sources.
      </p>
    </div>
  )
}
