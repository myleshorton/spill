'use client'

import { useEffect, useState } from 'react'
import { FileText, HardDrive, Users, Database } from 'lucide-react'
import { getStats, formatNumber, formatFileSize, type ArchiveStats } from '@/lib/api'

export default function StatsBar() {
  const [stats, setStats] = useState<ArchiveStats | null>(null)

  useEffect(() => {
    getStats().then(setStats).catch(() => {})
  }, [])

  if (!stats) return null

  const items = [
    { icon: FileText, label: 'Documents', value: formatNumber(stats.totalDocuments) },
    { icon: HardDrive, label: 'Archive Size', value: formatFileSize(stats.totalSize) },
    { icon: Database, label: 'Data Sets', value: '12' },
    { icon: Users, label: 'P2P Peers', value: String(stats.peerCount) },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item, i) => (
        <div
          key={item.label}
          className="animate-slide-up rounded-lg border border-spill-divider bg-spill-surface px-4 py-3"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="flex items-center gap-2">
            <item.icon className="h-4 w-4 text-spill-accent" />
            <span className="text-xs text-spill-text-secondary">{item.label}</span>
          </div>
          <p className="mt-1 font-headline text-xl font-bold text-spill-text-primary">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  )
}
