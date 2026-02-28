'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { getActivity, type ActivityData } from '@/lib/api'

export interface ActivityEvent {
  id: string
  message: string
  icon: 'file-plus' | 'mic' | 'brain' | 'dollar-sign' | 'map-pin' | 'tags' | 'search' | 'radio' | 'database' | 'shield'
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function generateDeltaEvents(data: ActivityData): ActivityEvent[] {
  const events: ActivityEvent[] = []
  const d = data.deltas
  if (!d) return events

  if (d.documentsAdded > 0) {
    events.push({ id: `doc-${data.ts}`, message: `Found ${d.documentsAdded} new document${d.documentsAdded > 1 ? 's' : ''}`, icon: 'file-plus' })
  }
  if (d.transcriptsAdded > 0) {
    events.push({ id: `tr-${data.ts}`, message: `Transcribed ${d.transcriptsAdded} audio file${d.transcriptsAdded > 1 ? 's' : ''}`, icon: 'mic' })
  }
  if (d.entitiesExtracted > 0) {
    events.push({ id: `ent-${data.ts}`, message: `Connecting the dots\u2026 extracted entities from ${d.entitiesExtracted} document${d.entitiesExtracted > 1 ? 's' : ''}`, icon: 'brain' })
  }
  if (d.financialsScanned > 0) {
    events.push({ id: `fin-${data.ts}`, message: `Following the money\u2026 scanned ${d.financialsScanned} financial doc${d.financialsScanned > 1 ? 's' : ''}`, icon: 'dollar-sign' })
  }
  if (d.geoLocated > 0) {
    events.push({ id: `geo-${data.ts}`, message: `Mapped ${d.geoLocated} new location${d.geoLocated > 1 ? 's' : ''} from metadata`, icon: 'map-pin' })
  }
  if (d.keywordsAdded > 0) {
    events.push({ id: `kw-${data.ts}`, message: `Tagged ${d.keywordsAdded} image${d.keywordsAdded > 1 ? 's' : ''} with visual keywords`, icon: 'tags' })
  }

  // Text extraction delta
  if (d.documentsAdded === 0 && data.pending) {
    const prev = data.pending.textExtracted
    if (prev > 0) {
      events.push({ id: `text-${data.ts}`, message: `Text extraction: ${formatCount(prev)} done, ${formatCount(data.pending.textPending)} to go`, icon: 'search' })
    }
  }

  return events
}

function formatPct(n: number, total: number): string {
  if (total === 0) return '0%'
  return `${((n / total) * 100).toFixed(1)}%`
}

function generateAmbientEvents(data: ActivityData): ActivityEvent[] {
  const t = data.totals
  const p = data.pending
  const events: ActivityEvent[] = [
    { id: 'amb-indexed', message: `${formatCount(t.indexed)} documents indexed and counting\u2026`, icon: 'search' },
    { id: 'amb-docs', message: `${formatCount(t.documents)} documents in the archive`, icon: 'database' },
  ]

  // Text extraction progress — show when there's remaining work
  if (p && p.textPending > 0) {
    events.push({
      id: 'amb-text-progress',
      message: `Extracting text\u2026 ${formatCount(p.textExtracted)}/${formatCount(p.textTotal)} (${formatPct(p.textExtracted, p.textTotal)}) \u2014 ${formatCount(p.textPending)} remaining`,
      icon: 'search'
    })
  } else if (p && p.textTotal > 0) {
    events.push({ id: 'amb-text-done', message: `Text extraction complete: ${formatCount(p.textExtracted)} documents processed`, icon: 'search' })
  }

  // Transcription progress
  if (p && p.avPending > 0) {
    events.push({
      id: 'amb-av-progress',
      message: `Transcribing\u2026 ${formatCount(p.avTranscribed)}/${formatCount(p.avTotal)} (${formatPct(p.avTranscribed, p.avTotal)}) \u2014 ${formatCount(p.avPending)} remaining`,
      icon: 'mic'
    })
  } else if (p && p.avTotal > 0) {
    events.push({ id: 'amb-av-done', message: `All ${formatCount(p.avTotal)} audio/video files transcribed`, icon: 'mic' })
  }

  events.push(
    { id: 'amb-motto', message: 'Every document is searchable. Every page is indexed.', icon: 'shield' },
    { id: 'amb-sleep', message: 'The archive never sleeps.', icon: 'radio' },
  )

  if (data.status.peerCount > 0) {
    events.push({ id: 'amb-peers', message: `${data.status.peerCount} peer${data.status.peerCount > 1 ? 's' : ''} keeping the archive alive`, icon: 'radio' })
  }
  if (t.entities > 0) {
    events.push({ id: 'amb-ent', message: `${formatCount(t.entities)} entities mapped across the archive`, icon: 'brain' })
  }
  if (t.transcripts > 0) {
    events.push({ id: 'amb-tr', message: `${formatCount(t.transcripts)} audio files transcribed`, icon: 'mic' })
  }
  if (data.latestDoc) {
    const title = data.latestDoc.title.length > 50
      ? data.latestDoc.title.slice(0, 47) + '\u2026'
      : data.latestDoc.title
    events.push({ id: 'amb-latest', message: `Just found: ${title}`, icon: 'file-plus' })
  }
  return events
}

export function useActivityFeed(pollInterval = 8000, cycleInterval = 5000) {
  const [current, setCurrent] = useState<ActivityEvent | null>(null)
  const queueRef = useRef<ActivityEvent[]>([])
  const ambientRef = useRef<ActivityEvent[]>([])
  const ambientIndexRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const cycle = useCallback(() => {
    if (queueRef.current.length > 0) {
      setCurrent(queueRef.current.shift()!)
      return
    }
    if (ambientRef.current.length > 0) {
      const idx = ambientIndexRef.current % ambientRef.current.length
      setCurrent(ambientRef.current[idx])
      ambientIndexRef.current = idx + 1
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const data = await getActivity()
        if (cancelled) return
        const delta = generateDeltaEvents(data)
        if (delta.length > 0) {
          queueRef.current.push(...delta)
        }
        ambientRef.current = generateAmbientEvents(data)
      } catch {
        // silently ignore
      }
    }

    poll()
    const pollTimer = setInterval(poll, pollInterval)

    // Start cycling after first poll has a chance to return
    const initTimer = setTimeout(() => {
      cycle()
      timerRef.current = setInterval(cycle, cycleInterval)
    }, 500)

    return () => {
      cancelled = true
      clearInterval(pollTimer)
      clearTimeout(initTimer)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [pollInterval, cycleInterval, cycle])

  return current
}
