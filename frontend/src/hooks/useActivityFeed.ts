'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { getActivity, type ActivityData } from '@/lib/api'

export interface ActivityEvent {
  id: string
  message: string
  icon: 'file-plus' | 'mic' | 'brain' | 'dollar-sign' | 'map-pin' | 'tags' | 'search' | 'radio' | 'database' | 'shield'
  url?: string
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatPct(n: number, total: number): string {
  if (total === 0) return '0%'
  return `${((n / total) * 100).toFixed(1)}%`
}

/** High-priority events from real-time deltas — shown immediately */
function generateDeltaEvents(data: ActivityData): ActivityEvent[] {
  const events: ActivityEvent[] = []
  const d = data.deltas
  if (!d) return events

  if (d.documentsAdded > 0) {
    events.push({ id: `doc-${data.ts}`, message: `+${d.documentsAdded} new document${d.documentsAdded > 1 ? 's' : ''} discovered`, icon: 'file-plus' })
  }
  if (d.transcriptsAdded > 0) {
    events.push({ id: `tr-${data.ts}`, message: `Transcribed ${d.transcriptsAdded} recording${d.transcriptsAdded > 1 ? 's' : ''}`, icon: 'mic' })
  }
  if (d.entitiesExtracted > 0) {
    events.push({ id: `ent-${data.ts}`, message: `Extracted ${d.entitiesExtracted} new entit${d.entitiesExtracted > 1 ? 'ies' : 'y'}`, icon: 'brain', url: '/analysis/entities' })
  }
  if (d.financialsScanned > 0) {
    events.push({ id: `fin-${data.ts}`, message: `Scanned ${d.financialsScanned} financial record${d.financialsScanned > 1 ? 's' : ''}`, icon: 'dollar-sign' })
  }
  if (d.geoLocated > 0) {
    events.push({ id: `geo-${data.ts}`, message: `Pinned ${d.geoLocated} new location${d.geoLocated > 1 ? 's' : ''}`, icon: 'map-pin' })
  }
  if (d.keywordsAdded > 0) {
    events.push({ id: `kw-${data.ts}`, message: `Tagged ${d.keywordsAdded} image${d.keywordsAdded > 1 ? 's' : ''}`, icon: 'tags' })
  }

  return events
}

/** Ambient rotation — mix of witty lines, live stats, and progress */
function generateAmbientEvents(data: ActivityData): ActivityEvent[] {
  const t = data.totals
  const p = data.pending
  const events: ActivityEvent[] = []

  // --- Witty / editorial ---
  events.push(
    { id: 'wit-redactions', message: 'Reading between the redactions\u2026', icon: 'search' },
    { id: 'wit-money', message: 'Following the money\u2026', icon: 'dollar-sign' },
    { id: 'wit-receipts', message: 'The receipts don\u2019t lie.', icon: 'database' },
    { id: 'wit-sleep', message: 'The archive never sleeps.', icon: 'radio' },
    { id: 'wit-stone', message: 'No stone unturned. No file unread.', icon: 'shield' },
    { id: 'wit-sunlight', message: 'Sunlight is the best disinfectant.', icon: 'shield' },
    { id: 'wit-paper', message: 'Every page tells a story.', icon: 'file-plus' },
    { id: 'wit-dots', message: 'Connecting the dots\u2026', icon: 'brain', url: '/analysis/entities' },
    { id: 'wit-fine-print', message: 'Reading the fine print so you don\u2019t have to.', icon: 'search' },
  )

  // --- Live stats (raw numbers) ---
  events.push(
    { id: 'stat-docs', message: `${formatCount(t.documents)} documents archived. And counting.`, icon: 'database' },
    { id: 'stat-indexed', message: `${formatCount(t.indexed)} documents indexed and searchable`, icon: 'search' },
  )

  if (t.transcripts > 0) {
    events.push({ id: 'stat-transcripts', message: `${formatCount(t.transcripts)} recordings transcribed to searchable text`, icon: 'mic' })
  }
  if (t.entities > 0) {
    events.push({ id: 'stat-entities', message: `${formatCount(t.entities)} names, orgs, and connections mapped`, icon: 'brain', url: '/analysis/entities' })
  }
  if (t.geoLocated > 0) {
    events.push({ id: 'stat-geo', message: `${t.geoLocated} documents pinned to locations on the map`, icon: 'map-pin' })
  }
  if (t.withKeywords > 0) {
    events.push({ id: 'stat-keywords', message: `${formatCount(t.withKeywords)} images analyzed and tagged`, icon: 'tags' })
  }

  // --- Progress (text extraction / transcription) ---
  if (p && p.textPending > 0) {
    events.push(
      { id: 'prog-text', message: `OCR in progress\u2026 ${formatCount(p.textExtracted)} of ${formatCount(p.textTotal)} documents (${formatPct(p.textExtracted, p.textTotal)})`, icon: 'search' },
      { id: 'prog-text-remaining', message: `${formatCount(p.textPending)} documents still being scanned for text`, icon: 'search' },
    )
  }
  if (p && p.avPending > 0) {
    events.push(
      { id: 'prog-av', message: `Transcribing audio\u2026 ${formatCount(p.avTranscribed)} of ${formatCount(p.avTotal)} (${formatPct(p.avTranscribed, p.avTotal)})`, icon: 'mic' },
      { id: 'prog-av-remaining', message: `${formatCount(p.avPending)} recordings waiting for transcription`, icon: 'mic' },
    )
  }

  // --- Crawl activity ---
  if (data.recent.count > 0) {
    events.push({ id: 'crawl-recent', message: `${data.recent.count} new document${data.recent.count > 1 ? 's' : ''} crawled in the last 5 minutes`, icon: 'radio' })
    const types = Object.entries(data.recent.byType)
    if (types.length > 0) {
      const summary = types.map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`).join(', ')
      events.push({ id: 'crawl-types', message: `Just crawled: ${summary}`, icon: 'file-plus' })
    }
  } else {
    events.push({ id: 'crawl-scanning', message: 'Scanning court records, FOIA releases, and public archives\u2026', icon: 'radio' })
  }

  // --- Spill P2P / BitTorrent ---
  const SPILL_URL = 'https://spill.network'
  const sizeGB = t.totalBytes ? (t.totalBytes / (1024 * 1024 * 1024)).toFixed(0) : null
  if (sizeGB) {
    events.push({ id: 'p2p-size', message: `${sizeGB}GB served over Spill P2P and BitTorrent. Censorship-resistant.`, icon: 'radio', url: SPILL_URL })
  }
  if (data.status.peerCount > 0) {
    events.push(
      { id: 'p2p-peers', message: `${data.status.peerCount} Spill peer${data.status.peerCount > 1 ? 's' : ''} seeding the archive right now`, icon: 'radio', url: SPILL_URL },
      { id: 'p2p-distributed', message: `Distributed across ${data.status.peerCount} Spill node${data.status.peerCount > 1 ? 's' : ''}. Can\u2019t be taken down.`, icon: 'shield', url: SPILL_URL },
    )
  } else if (data.status.connected) {
    events.push({ id: 'p2p-listening', message: 'Spill P2P swarm active. Listening for peers\u2026', icon: 'radio', url: SPILL_URL })
  }
  if (t.torrents > 0) {
    events.push({ id: 'p2p-torrents', message: `${t.collections} dataset${t.collections > 1 ? 's' : ''} available via BitTorrent. Download everything.`, icon: 'database' })
  }
  events.push(
    { id: 'p2p-censorship', message: 'Mirrored via Spill P2P and BitTorrent. No single point of failure.', icon: 'shield', url: SPILL_URL },
    { id: 'p2p-seed', message: 'Download a dataset. Seed it. Keep the archive alive.', icon: 'radio' },
    { id: 'p2p-spill', message: 'Powered by Spill P2P \u2014 decentralized, unstoppable.', icon: 'radio', url: SPILL_URL },
  )

  // --- Latest doc ---
  if (data.latestDoc) {
    const title = data.latestDoc.title.length > 50
      ? data.latestDoc.title.slice(0, 47) + '\u2026'
      : data.latestDoc.title
    events.push({ id: 'latest', message: `Latest: ${title}`, icon: 'file-plus' })
  }

  // Shuffle so it's not the same order every time
  for (let i = events.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[events[i], events[j]] = [events[j], events[i]]
  }

  return events
}

export function useActivityFeed(pollInterval = 8000, cycleInterval = 5000) {
  const [current, setCurrent] = useState<ActivityEvent | null>(null)
  const queueRef = useRef<ActivityEvent[]>([])
  const ambientRef = useRef<ActivityEvent[]>([])
  const ambientIndexRef = useRef(0)
  const lastIdRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const show = useCallback((event: ActivityEvent) => {
    lastIdRef.current = event.id
    setCurrent(event)
  }, [])

  const cycle = useCallback(() => {
    // Delta events take priority
    if (queueRef.current.length > 0) {
      const next = queueRef.current.shift()!
      show(next)
      return
    }
    // Otherwise cycle through ambient, skipping the current one
    const list = ambientRef.current
    if (list.length === 0) return
    if (list.length === 1) { show(list[0]); return }
    let idx = ambientIndexRef.current % list.length
    if (list[idx].id === lastIdRef.current) {
      idx = (idx + 1) % list.length
    }
    ambientIndexRef.current = idx + 1
    show(list[idx])
  }, [show])

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
