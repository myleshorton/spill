'use client'

import { useEffect, useState } from 'react'
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

  const content = (
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
        {display.message}
      </span>
    </div>
  )

  if (display.url) {
    return (
      <a href={display.url} target="_blank" rel="noopener noreferrer" className="block hover:opacity-80 transition-opacity">
        {content}
      </a>
    )
  }

  return content
}
