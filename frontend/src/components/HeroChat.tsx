'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, Send } from 'lucide-react'

const PROMPTS = [
  'Who should be prosecuted and based on what evidence?',
  'What do the flight logs show?',
  'What did the FBI know?',
  'Financial connections between entities',
  'What happened on Little St. James?',
  'Who are the key witnesses?',
  'Who were Epstein\'s unnamed "Co-Conspirators" besides Ghislaine Maxwell?',
]

export default function HeroChat() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [promptIndex, setPromptIndex] = useState(0)
  const [fade, setFade] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setPromptIndex((i) => (i + 1) % PROMPTS.length)
        setFade(true)
      }, 300)
    }, 3500)
    return () => clearInterval(interval)
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/chat?q=${encodeURIComponent(query.trim())}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative w-full">
      <MessageSquare className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-spill-text-secondary" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Tab' && !query) {
            e.preventDefault()
            setQuery(PROMPTS[promptIndex])
          }
        }}
        autoFocus
        placeholder={PROMPTS[promptIndex]}
        className={`w-full border border-spill-divider bg-spill-surface py-4 pl-14 pr-14 text-lg rounded-xl font-body text-spill-text-primary focus:border-spill-accent/50 focus:outline-none focus:ring-1 focus:ring-spill-accent/30 transition-all ${
          query ? '' : fade ? 'placeholder:opacity-100' : 'placeholder:opacity-0'
        } placeholder:text-spill-text-secondary/50 placeholder:transition-opacity placeholder:duration-300`}
      />
      <button
        type="submit"
        disabled={!query.trim()}
        className="absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-lg bg-spill-accent text-white hover:bg-spill-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <Send className="h-4 w-4" />
      </button>
    </form>
  )
}
