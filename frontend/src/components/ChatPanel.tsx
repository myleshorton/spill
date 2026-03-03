'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Send, Square, AlertCircle, FileText, Loader2 } from 'lucide-react'
import { streamChat, type ChatMessage, type ChatSource } from '@/lib/api'

function CitationText({ text, sources }: { text: string; sources: ChatSource[] }) {
  const sourceMap = new Map(sources.map(s => [s.id, s]))

  // Split on [DOC:...] citations
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

function SourceList({ sources }: { sources: ChatSource[] }) {
  if (sources.length === 0) return null

  return (
    <div className="mt-3 border-t border-spill-divider pt-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-spill-text-secondary/60">
        Sources ({sources.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map(s => (
          <Link
            key={s.id}
            href={`/doc/${s.id}`}
            className="flex items-center gap-1.5 rounded-md border border-spill-divider bg-spill-surface px-2 py-1 text-xs text-spill-text-secondary hover:border-spill-accent/30 hover:text-spill-text-primary transition-colors"
          >
            <FileText className="h-3 w-3 shrink-0" />
            <span className="max-w-[200px] truncate">{s.title}</span>
            {s.category && (
              <span className="rounded bg-spill-surface-light px-1 py-0.5 text-[10px] text-spill-text-secondary/60">
                {s.category}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function ChatPanel({ initialQuery }: { initialQuery?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [streamingSources, setStreamingSources] = useState<ChatSource[]>([])
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingText, scrollToBottom])

  // Auto-submit initialQuery on mount
  const initialSubmitted = useRef(false)
  useEffect(() => {
    if (initialQuery && !initialSubmitted.current) {
      initialSubmitted.current = true
      setInput(initialQuery)
      // Defer so state is settled before submit logic runs
      setTimeout(() => {
        submitMessage(initialQuery)
      }, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery])

  async function submitMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return

    const userMessage: ChatMessage = { role: 'user', content: trimmed }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setError(null)
    setIsStreaming(true)
    setStreamingText('')
    setStreamingSources([])

    const controller = new AbortController()
    abortRef.current = controller

    let fullText = ''
    let sources: ChatSource[] = []

    try {
      await streamChat(
        trimmed,
        messages, // conversation history
        (s) => {
          sources = s
          setStreamingSources(s)
        },
        (delta) => {
          fullText += delta
          setStreamingText(fullText)
        },
        () => {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: fullText,
            sources
          }])
          setStreamingText('')
          setStreamingSources([])
          setIsStreaming(false)
        },
        (err) => {
          setError(err)
          if (fullText) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: fullText,
              sources
            }])
          }
          setStreamingText('')
          setStreamingSources([])
          setIsStreaming(false)
        },
        controller.signal
      )
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        if (fullText) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: fullText,
            sources
          }])
        }
      } else {
        setError('Failed to connect. Please try again.')
      }
      setStreamingText('')
      setStreamingSources([])
      setIsStreaming(false)
    }
  }

  async function handleSubmit() {
    if (!input.trim() || isStreaming) return
    submitMessage(input)
  }

  function handleStop() {
    abortRef.current?.abort()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 150) + 'px'
    }
  }, [input])

  return (
    <div className="flex flex-1 flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {messages.length === 0 && !isStreaming && (
            <div className="py-16 text-center">
              <h2 className="font-serif text-2xl text-spill-text-primary">
                Ask the Archive
              </h2>
              <p className="mt-3 text-sm text-spill-text-secondary">
                Ask questions about the documents. Answers are grounded in real evidence with clickable citations.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-2">
                {[
                  'Who should be prosecuted and based on what evidence?',
                  'What do the flight logs show?',
                  'Financial connections between entities',
                  'What did the FBI know?',
                ].map(q => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); textareaRef.current?.focus() }}
                    className="rounded-lg border border-spill-divider bg-spill-surface px-3 py-2 text-left text-sm text-spill-text-secondary hover:border-spill-accent/30 hover:text-spill-text-primary transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={msg.role === 'user' ? 'flex justify-end' : ''}>
              {msg.role === 'user' ? (
                <div className="max-w-[80%] rounded-2xl rounded-br-md bg-spill-accent/15 px-4 py-3 text-sm text-spill-text-primary">
                  {msg.content}
                </div>
              ) : (
                <div className="rounded-2xl rounded-bl-md bg-spill-surface px-4 py-3">
                  <div className="prose-sm text-sm leading-relaxed text-spill-text-primary whitespace-pre-wrap">
                    <CitationText text={msg.content} sources={msg.sources || []} />
                  </div>
                  <SourceList sources={msg.sources || []} />
                </div>
              )}
            </div>
          ))}

          {/* Streaming message */}
          {isStreaming && (
            <div className="rounded-2xl rounded-bl-md bg-spill-surface px-4 py-3">
              {streamingText ? (
                <div className="prose-sm text-sm leading-relaxed text-spill-text-primary whitespace-pre-wrap">
                  <CitationText text={streamingText} sources={streamingSources} />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-spill-text-secondary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching documents...
                </div>
              )}
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-spill-error/30 bg-spill-error/5 px-4 py-3 text-sm text-spill-error">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-spill-divider bg-spill-bg px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about the documents..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-spill-divider bg-spill-surface px-4 py-3 text-sm text-spill-text-primary placeholder:text-spill-text-secondary/60 focus:border-spill-accent/50 focus:outline-none focus:ring-1 focus:ring-spill-accent/30 transition-colors"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              onClick={handleStop}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-spill-accent/15 text-spill-accent hover:bg-spill-accent/25 transition-colors"
              title="Stop generating"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-spill-accent text-white hover:bg-spill-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-spill-text-secondary/40">
          Answers are generated from archive documents. Always verify claims against original sources.
        </p>
      </div>
    </div>
  )
}
