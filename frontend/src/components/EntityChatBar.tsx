'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, Send } from 'lucide-react'
import { getEntityQuestions } from '@/lib/api'

interface EntityChatBarProps {
  entityId: number
  entityName: string
}

export default function EntityChatBar({ entityId, entityName }: EntityChatBarProps) {
  const [questions, setQuestions] = useState<string[]>([])
  const [current, setCurrent] = useState(0)
  const [fade, setFade] = useState(true)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    getEntityQuestions(entityId).then(data => {
      if (data.questions.length > 0) {
        setQuestions(data.questions)
      } else {
        setQuestions([
          `What is ${entityName}'s connection to Jeffrey Epstein?`,
          `What financial transactions involve ${entityName}?`,
          `What evidence exists regarding ${entityName}?`,
        ])
      }
    }).catch(() => {})
  }, [entityId, entityName])

  useEffect(() => {
    if (questions.length <= 1) return
    const interval = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setCurrent(i => (i + 1) % questions.length)
        setFade(true)
      }, 300)
    }, 8000)
    return () => clearInterval(interval)
  }, [questions])

  const submit = useCallback(() => {
    const q = query.trim() || questions[current]
    if (!q) return
    router.push(`/chat?q=${encodeURIComponent(q)}&entity=${entityId}`)
  }, [query, questions, current, router])

  const placeholder = questions[current] || `Ask about ${entityName}...`

  return (
    <div className="relative">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-spill-text-secondary">
        <MessageSquare className="h-5 w-5" />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Tab' && !query) {
            e.preventDefault()
            setQuery(questions[current] || '')
          } else if (e.key === 'Enter') {
            submit()
          }
        }}
        className="w-full rounded-xl border border-spill-divider bg-spill-surface py-3.5 pl-12 pr-14 text-sm text-spill-text-primary placeholder:text-spill-text-secondary/50 focus:border-spill-accent focus:outline-none focus:ring-1 focus:ring-spill-accent transition-colors"
        placeholder=""
      />
      {!query && (
        <span
          className={`pointer-events-none absolute left-12 top-1/2 -translate-y-1/2 text-sm text-spill-text-secondary/50 transition-opacity duration-300 ${fade ? 'opacity-100' : 'opacity-0'}`}
        >
          {placeholder}
        </span>
      )}
      <button
        onClick={submit}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg bg-spill-accent/20 p-1.5 text-spill-accent hover:bg-spill-accent/30 transition-colors"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  )
}
