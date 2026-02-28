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
    // Fade out
    setVisible(false)
    const timer = setTimeout(() => {
      setDisplay(event)
      setVisible(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [event])

  if (!display) return null

  const Icon = ICON_MAP[display.icon]

  return (
    <div className="rounded-lg border border-spill-divider bg-spill-surface/50 px-4 py-2.5">
      <div
        className="flex items-center gap-2.5 transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <Icon className="h-3.5 w-3.5 shrink-0 text-spill-text-secondary" />
        <span className="font-mono text-xs text-spill-text-secondary truncate">
          {display.message}
        </span>
      </div>
    </div>
  )
}
