'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ArrowRight, Loader2 } from 'lucide-react'
import { useDebounce } from '@/lib/hooks'
import { searchDocuments, type Document } from '@/lib/api'

interface SearchBarProps {
  large?: boolean
  initialQuery?: string
  autoFocus?: boolean
}

export default function SearchBar({ large, initialQuery = '', autoFocus }: SearchBarProps) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)
  const [suggestions, setSuggestions] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debouncedQuery = useDebounce(query, 250)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setSuggestions([])
      return
    }

    let cancelled = false
    setLoading(true)

    searchDocuments(debouncedQuery, { limit: 6 })
      .then((result) => {
        if (!cancelled) {
          setSuggestions(result.hits)
          setShowSuggestions(true)
        }
      })
      .catch(() => {
        if (!cancelled) setSuggestions([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [debouncedQuery])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim()) {
      setShowSuggestions(false)
      router.push(`/search?q=${encodeURIComponent(query.trim())}`)
    }
  }

  const inputSize = large
    ? 'py-4 pl-14 pr-14 text-lg rounded-xl'
    : 'py-2.5 pl-10 pr-10 text-sm rounded-lg'
  const iconSize = large ? 'h-5 w-5' : 'h-4 w-4'
  const iconPos = large ? 'left-5' : 'left-3'

  return (
    <div ref={wrapperRef} className="relative w-full">
      <form onSubmit={handleSubmit}>
        <Search className={`absolute ${iconPos} top-1/2 -translate-y-1/2 text-spill-text-secondary ${iconSize}`} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          autoFocus={autoFocus}
          placeholder="Search 1.4M+ files — names, places, dates, keywords..."
          className={`w-full border border-spill-divider bg-spill-surface font-body text-spill-text-primary placeholder:text-spill-text-secondary/50 focus:border-spill-accent/50 focus:outline-none focus:ring-1 focus:ring-spill-accent/30 transition-all ${inputSize}`}
        />
        {loading ? (
          <Loader2 className={`absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-spill-text-secondary ${iconSize}`} />
        ) : query.trim() ? (
          <button type="submit" className={`absolute right-4 top-1/2 -translate-y-1/2 text-spill-accent hover:text-spill-accent-hover transition-colors`}>
            <ArrowRight className={iconSize} />
          </button>
        ) : null}
      </form>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-spill-divider bg-spill-surface shadow-2xl shadow-black/40">
          {suggestions.map((doc) => (
            <button
              key={doc.id}
              onClick={() => {
                setShowSuggestions(false)
                router.push(`/doc/${doc.id}`)
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-spill-surface-light transition-colors"
            >
              <span className="shrink-0 rounded bg-spill-accent/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-spill-accent">
                {doc.contentType}
              </span>
              <span className="truncate text-sm text-spill-text-primary">{doc.title}</span>
              <span className="ml-auto shrink-0 text-xs text-spill-text-secondary">DS {doc.dataSet}</span>
            </button>
          ))}
          <button
            onClick={() => {
              setShowSuggestions(false)
              router.push(`/search?q=${encodeURIComponent(query.trim())}`)
            }}
            className="flex w-full items-center justify-center gap-2 border-t border-spill-divider px-4 py-2.5 text-sm text-spill-accent hover:bg-spill-surface-light transition-colors"
          >
            View all results <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
