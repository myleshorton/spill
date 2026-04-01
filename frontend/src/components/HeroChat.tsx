'use client'

import { useState, useEffect } from 'react'
import { Search, Send } from 'lucide-react'

const PROMPTS = [
  'What payments went between Epstein and Les Wexner after 2007?',
  'What do the financial records show about Hyperion Air?',
  'What financial transactions involve Towers Financial or Hoffenberg?',
  'What documents are in Data Sets 6, 7, and 12?',
  'What do the AT&T phone records show about calls to government officials?',
  'What did the Palm Beach police reports say about witness intimidation?',
  'What did the Bureau of Prisons Inspector General find about the night Epstein died?',
  'Who is Marc Weinstein and what is his connection to Epstein?',
  'What role did Nick Tartaglione play as Epstein\'s cellmate?',
  'What were the terms of the 2007 non-prosecution agreement?',
  'What passport documents exist and what names appear on them?',
  'What connections exist between Epstein and Southern District of Florida prosecutors?',
  'What do the FBI 302 interviews reveal about what victims told the FBI?',
  'What do the financial records show about real estate near Zorro Ranch?',
  'What documents reference Israel or intelligence agencies?',
  'What do the Deutsche Bank compliance records say about suspicious activity reports?',
  'What do the JPMorgan records reveal about Epstein\'s accounts?',
  'Who were Epstein\'s unnamed Co-Conspirators besides Ghislaine Maxwell?',
  'What did Peter Skinner do in connection with the case?',
  'What do the flight logs show?',
]

export default function HeroChat() {
  const [promptIndex, setPromptIndex] = useState(0)
  const [fade, setFade] = useState(true)

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

  return (
    <form action="/search" method="get" className="relative w-full">
      <Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-spill-text-secondary" />
      <input
        type="text"
        name="q"
        autoFocus
        placeholder={PROMPTS[promptIndex]}
        className={`w-full border border-spill-divider bg-spill-surface py-4 pl-14 pr-14 text-lg rounded-xl font-body text-spill-text-primary focus:border-spill-accent/50 focus:outline-none focus:ring-1 focus:ring-spill-accent/30 transition-all ${
          fade ? 'placeholder:opacity-100' : 'placeholder:opacity-0'
        } placeholder:text-spill-text-secondary/50 placeholder:transition-opacity placeholder:duration-300`}
      />
      <button
        type="submit"
        className="absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-lg bg-spill-accent text-white hover:bg-spill-accent-hover transition-colors"
      >
        <Send className="h-4 w-4" />
      </button>
    </form>
  )
}
