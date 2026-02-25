'use client'

import { useState } from 'react'
import { Download, Link2, Check, Info } from 'lucide-react'
import { torrentUrl, formatFileSize, type DataSetInfo } from '@/lib/api'

export default function TorrentDownload({ dataset }: { dataset: DataSetInfo }) {
  const [copied, setCopied] = useState(false)

  if (!dataset.hasTorrent) return null

  function copyMagnet() {
    if (!dataset.magnetLink) return
    navigator.clipboard.writeText(dataset.magnetLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="rounded-lg border border-spill-divider bg-spill-surface/50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/20">
          <Download className="h-4 w-4 text-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-headline text-sm font-semibold text-spill-text-primary">
            Download via BitTorrent
          </h3>
          {dataset.totalSize > 0 && (
            <p className="mt-0.5 text-xs text-spill-text-secondary">
              {formatFileSize(dataset.totalSize)} total
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={torrentUrl(dataset.id)}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/25 transition-colors hover:bg-emerald-500/25"
            >
              <Download className="h-3 w-3" />
              .torrent
            </a>

            {dataset.magnetLink && (
              <button
                onClick={copyMagnet}
                className="inline-flex items-center gap-1.5 rounded-md bg-spill-surface px-3 py-1.5 text-xs font-medium text-spill-text-secondary ring-1 ring-spill-divider transition-colors hover:text-spill-text-primary hover:ring-spill-accent/30"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Link2 className="h-3 w-3" />}
                {copied ? 'Copied' : 'Magnet link'}
              </button>
            )}
          </div>

          <div className="mt-3 flex items-start gap-1.5">
            <Info className="mt-0.5 h-3 w-3 shrink-0 text-spill-text-secondary/50" />
            <p className="text-[11px] leading-relaxed text-spill-text-secondary/60">
              Includes WebSeed — downloads work even with zero BitTorrent peers via HTTP fallback.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
