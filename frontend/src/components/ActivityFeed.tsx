'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  FilePlus, Mic, Brain, DollarSign, MapPin, Tags,
  Search, Radio, Database, Shield
} from 'lucide-react'
import { useActivityFeed, type ActivityEvent } from '@/hooks/useActivityFeed'

const ICON_MAP: Record<ActivityEvent['icon'], React.ComponentType<{ className?: string }>> = {
  'file-plus': FilePlus,
  'mic': Mic,
  'brain': Brain,
  'dollar-sign': DollarSign,
  'map-pin': MapPin,
  'tags': Tags,
  'search': Search,
  'radio': Radio,
  'database': Database,
  'shield': Shield,
}

export default function ActivityFeed() {
  const event = useActivityFeed()
  const [visible, setVisible] = useState(false)
  const [display, setDisplay] = useState<ActivityEvent | null>(null)

  useEffect(() => {
    if (!event) return
    setVisible(false)
    const timer = setTimeout(() => {
      setDisplay(event)
      setVisible(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [event])

  if (!display) {
    return (
      <div className="flex items-center justify-center gap-2.5 h-7">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="font-mono text-sm text-spill-text-secondary/60">{"Connecting\u2026"}</span>
      </div>
    )
  }

  const Icon = ICON_MAP[display.icon]

  // Render message text, turning key phrases into inline links when url is set
  const msg = display.message
  const url = display.url
  const isInternal = url?.startsWith('/')
  const linkClass = "text-spill-accent underline decoration-spill-accent/40 underline-offset-2 hover:decoration-spill-accent transition-colors"
  function renderMessage() {
    if (!url) return msg
    const linkPattern = isInternal
      ? /(connect\w*|entit\w+|names|orgs|connections\s+mapped|dots)/i
      : /(Spill P2P|Spill\s+peer[s]?|Spill\s+node[s]?)/
    const parts = msg.split(linkPattern)
    if (parts.length === 1) {
      // No keyword match — make the whole message a link
      return isInternal ? (
        <Link href={url} className={linkClass}>{msg}</Link>
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer" className={linkClass}>{msg}</a>
      )
    }
    return parts.map((part, i) =>
      linkPattern.test(part) ? (
        isInternal ? (
          <Link key={i} href={url} className={linkClass}>{part}</Link>
        ) : (
          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className={linkClass}>{part}</a>
        )
      ) : (
        <span key={i}>{part}</span>
      )
    )
  }

  return (
    <div
      className="flex items-center justify-center gap-2.5 transition-opacity duration-300 h-7"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <Icon className="h-3.5 w-3.5 shrink-0 text-spill-accent/70" />
      <span className="font-mono text-sm text-spill-text-secondary truncate">
        {renderMessage()}
      </span>
    </div>
  )
}
