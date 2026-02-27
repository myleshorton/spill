'use client'

import { useRef, useEffect } from 'react'
import type { Document } from '@/lib/api'

interface TimelineViewProps {
  documents: Document[]
}

const TYPE_COLORS: Record<string, string> = {
  image: '#3b82f6',
  video: '#8b5cf6',
  audio: '#f59e0b',
  pdf: '#ef4444',
  email: '#06b6d4',
  spreadsheet: '#10b981',
  html: '#6b7280',
}

export default function TimelineView({ documents }: TimelineViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<unknown>(null)

  const datedDocs = documents.filter(d => d.documentDate && d.documentDate !== '_none')

  useEffect(() => {
    if (!containerRef.current || datedDocs.length === 0) return

    let cancelled = false

    async function init() {
      const { Timeline } = await import('vis-timeline/standalone')
      const { DataSet } = await import('vis-data/standalone')

      if (cancelled || !containerRef.current) return

      // Destroy previous instance
      if (timelineRef.current) {
        (timelineRef.current as { destroy: () => void }).destroy()
        timelineRef.current = null
      }

      // Build groups by content type
      const typeSet = new Set(datedDocs.map(d => d.contentType))
      const groups = new DataSet(
        Array.from(typeSet).map(type => ({
          id: type,
          content: type.charAt(0).toUpperCase() + type.slice(1),
          style: `color: ${TYPE_COLORS[type] || '#6b7994'}`,
        }))
      )

      // Build items
      const items = new DataSet(
        datedDocs.map(doc => ({
          id: doc.id,
          group: doc.contentType,
          start: new Date(doc.documentDate!),
          content: '',
          title: `${doc.title}\n${doc.contentType.toUpperCase()} · DS ${doc.dataSet}`,
          style: `background-color: ${TYPE_COLORS[doc.contentType] || '#6b7994'}; border-color: ${TYPE_COLORS[doc.contentType] || '#6b7994'}; color: #fff;`,
          type: 'point',
        }))
      )

      const timeline = new Timeline(containerRef.current!, items, groups, {
        height: '500px',
        stack: true,
        showCurrentTime: false,
        zoomMin: 1000 * 60 * 60 * 24 * 7,      // 1 week
        zoomMax: 1000 * 60 * 60 * 24 * 365 * 50, // 50 years
        tooltip: {
          followMouse: true,
          overflowMethod: 'cap',
        },
        orientation: 'top',
      })

      timeline.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } })

      timeline.on('select', (props: { items: string[] }) => {
        if (props.items.length > 0) {
          window.location.href = `/doc/${props.items[0]}`
        }
      })

      timelineRef.current = timeline
    }

    init()

    return () => {
      cancelled = true
      if (timelineRef.current) {
        (timelineRef.current as { destroy: () => void }).destroy()
        timelineRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datedDocs.length])

  if (datedDocs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <svg className="mb-4 h-12 w-12 text-spill-text-secondary/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <p className="font-headline text-lg text-spill-text-secondary">No dated documents in current results</p>
        <p className="mt-1 text-sm text-spill-text-secondary/60">Run the date extraction pipeline to populate document dates</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 text-sm text-spill-text-secondary">
        {datedDocs.length} dated document{datedDocs.length !== 1 ? 's' : ''}
      </div>
      <div
        ref={containerRef}
        className="vis-timeline-container h-[500px] w-full rounded-lg border border-spill-divider overflow-hidden"
      />
    </div>
  )
}
