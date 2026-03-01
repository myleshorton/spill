'use client'

import { useState, useEffect } from 'react'
import { Download, ExternalLink, Copy, Check, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  type Document, type Entity, type FinancialRecord,
  contentUrl, streamUrl, previewUrl, getDocumentText, getDocumentTranscript,
  getDocumentEntities, getDocumentFinancials, formatFileSize
} from '@/lib/api'
import { siteConfig } from '@/config/site.config'

interface DocumentViewerProps {
  doc: Document
}

export default function DocumentViewer({ doc }: DocumentViewerProps) {
  const router = useRouter()
  const [extractedText, setExtractedText] = useState<string | null>(null)
  const [showText, setShowText] = useState(false)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const [entities, setEntities] = useState<Entity[]>([])
  const [financials, setFinancials] = useState<FinancialRecord[]>([])
  const [copied, setCopied] = useState(false)
  const url = contentUrl(doc.id)

  const isMedia = doc.contentType === 'audio' || doc.contentType === 'video'

  useEffect(() => {
    if (showText && extractedText === null) {
      getDocumentText(doc.id).then(setExtractedText).catch(() => setExtractedText(''))
    }
  }, [showText, doc.id, extractedText])

  useEffect(() => {
    if (showTranscript && transcript === null) {
      getDocumentTranscript(doc.id).then(setTranscript).catch(() => setTranscript(''))
    }
  }, [showTranscript, doc.id, transcript])

  useEffect(() => {
    getDocumentEntities(doc.id).then(setEntities).catch(() => {})
    getDocumentFinancials(doc.id).then(setFinancials).catch(() => {})
  }, [doc.id])

  function copyText() {
    if (extractedText) {
      navigator.clipboard.writeText(extractedText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-spill-text-secondary hover:bg-spill-surface hover:text-spill-text-primary transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <h1 className="font-headline text-2xl font-bold text-spill-text-primary">
            {doc.title}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded bg-spill-accent/10 px-2 py-0.5 font-mono text-xs uppercase text-spill-accent">
              {doc.contentType}
            </span>
            <span className="rounded bg-spill-surface-light px-2 py-0.5 text-xs text-spill-text-secondary">
              {siteConfig.dataSets.find((d) => d.id === doc.dataSet)?.name ?? `Data Set ${doc.dataSet}`}
            </span>
            {doc.pageCount && (
              <span className="text-xs text-spill-text-secondary">
                {doc.pageCount} page{doc.pageCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="mt-6">
            <ContentRenderer doc={doc} url={url} />
          </div>

          {/* Extracted Text toggle */}
          <div className="mt-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowText(!showText)}
                className="rounded-md border border-spill-divider bg-spill-surface px-3 py-1.5 text-sm text-spill-text-secondary hover:text-spill-text-primary transition-colors"
              >
                {showText ? 'Hide' : 'Show'} Extracted Text
              </button>
              {showText && extractedText && (
                <button
                  onClick={copyText}
                  className="flex items-center gap-1.5 rounded-md border border-spill-divider bg-spill-surface px-3 py-1.5 text-sm text-spill-text-secondary hover:text-spill-text-primary transition-colors"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-spill-success" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>

            {showText && (
              <div className="mt-3 max-h-[600px] overflow-auto rounded-lg border border-spill-divider bg-spill-bg p-4">
                <pre className="whitespace-pre-wrap font-body text-sm leading-relaxed text-spill-text-secondary">
                  {extractedText || 'Loading...'}
                </pre>
              </div>
            )}
          </div>

          {/* Transcript toggle (audio/video only) */}
          {isMedia && (
            <div className="mt-4">
              <button
                onClick={() => setShowTranscript(!showTranscript)}
                className="rounded-md border border-spill-divider bg-spill-surface px-3 py-1.5 text-sm text-spill-text-secondary hover:text-spill-text-primary transition-colors"
              >
                {showTranscript ? 'Hide' : 'Show'} Transcript
              </button>

              {showTranscript && (
                <div className="mt-3 max-h-[600px] overflow-auto rounded-lg border border-spill-divider bg-spill-bg p-4">
                  <pre className="whitespace-pre-wrap font-body text-sm leading-relaxed text-spill-text-secondary">
                    {transcript === null ? 'Loading...' : transcript || 'No transcript available'}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-spill-divider bg-spill-surface p-4">
            <h3 className="font-headline text-sm font-semibold text-spill-text-primary">File Details</h3>
            <dl className="mt-3 space-y-2.5 text-sm">
              <DetailRow label="File Name" value={doc.fileName} />
              <DetailRow label="Data Set" value={`DS ${doc.dataSet}`} />
              <DetailRow label="Type" value={doc.contentType.toUpperCase()} />
              {doc.category && <DetailRow label="Category" value={doc.category.replace(/_/g, ' ')} />}
              {doc.fileSize > 0 && <DetailRow label="Size" value={formatFileSize(doc.fileSize)} />}
              {doc.pageCount && <DetailRow label="Pages" value={String(doc.pageCount)} />}
            </dl>
          </div>

          {/* Entity tags */}
          {entities.length > 0 && (
            <div className="rounded-lg border border-spill-divider bg-spill-surface p-4">
              <h3 className="font-headline text-sm font-semibold text-spill-text-primary">Entities</h3>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {entities.map((e) => (
                  <Link
                    key={`${e.type}-${e.id}`}
                    href={`/search?q=${encodeURIComponent(e.name)}`}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      e.type === 'person'
                        ? 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25'
                        : e.type === 'organization'
                        ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                        : 'bg-orange-500/15 text-orange-400 hover:bg-orange-500/25'
                    }`}
                  >
                    {e.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Financial records */}
          {financials.length > 0 && (
            <div className="rounded-lg border border-spill-divider bg-spill-surface p-4">
              <h3 className="font-headline text-sm font-semibold text-spill-text-primary">Financial Records</h3>
              <div className="mt-3 space-y-2 max-h-[300px] overflow-auto">
                {financials.map((r) => (
                  <div key={r.id} className="rounded bg-spill-bg p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono uppercase text-spill-accent">{r.type}</span>
                      {r.amount != null && (
                        <span className="font-medium text-spill-text-primary">
                          {r.currency} {r.amount.toLocaleString()}
                        </span>
                      )}
                    </div>
                    {r.date && <div className="text-spill-text-secondary mt-0.5">{r.date}</div>}
                    {(r.from || r.to) && (
                      <div className="text-spill-text-secondary mt-0.5">
                        {r.from && <span>{r.from}</span>}
                        {r.from && r.to && <span> → </span>}
                        {r.to && <span>{r.to}</span>}
                      </div>
                    )}
                    {r.description && <div className="text-spill-text-secondary/70 mt-0.5">{r.description}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <a
              href={url}
              download={doc.fileName}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-spill-accent px-4 py-2.5 font-headline text-sm font-semibold text-spill-bg hover:bg-spill-accent-hover transition-colors"
            >
              <Download className="h-4 w-4" />
              Download Original
            </a>
            {doc.sourceUrl && (
              <a
                href={doc.sourceUrl}
                target="_blank"
                rel="noopener"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-spill-divider bg-spill-surface px-4 py-2.5 text-sm text-spill-text-secondary hover:text-spill-text-primary transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                {siteConfig.documentViewer.sourceLabel}
              </a>
            )}
          </div>

          {doc.driveKey && (
            <div className="rounded-lg border border-spill-divider bg-spill-surface p-4">
              <h3 className="font-headline text-sm font-semibold text-spill-text-primary">P2P Distribution</h3>
              <p className="mt-2 text-xs text-spill-text-secondary">
                This file is distributed via the Spill P2P network and can be accessed even if this server goes offline.
              </p>
              <p className="mt-2 font-mono text-[10px] break-all text-spill-text-secondary/50">
                {doc.driveKey}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function HtmlRenderer({ doc, url }: { doc: Document, url: string }) {
  return (
    <div className="rounded-lg border border-spill-divider">
      <div className="flex items-center justify-between border-b border-spill-divider bg-spill-surface px-4 py-2">
        <span className="text-xs text-spill-text-secondary">Sanitized preview</span>
        <div className="flex items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener"
            className="text-xs text-spill-accent hover:text-spill-accent-hover transition-colors"
          >
            View raw HTML
          </a>
          {doc.sourceUrl && (
            <>
              <span className="text-spill-divider">|</span>
              <a
                href={doc.sourceUrl}
                target="_blank"
                rel="noopener"
                className="text-xs text-spill-accent hover:text-spill-accent-hover transition-colors"
              >
                View original page
              </a>
            </>
          )}
        </div>
      </div>
      <iframe
        src={previewUrl(doc.id)}
        sandbox="allow-same-origin"
        className="h-[75vh] w-full bg-white"
        title={doc.title}
      />
    </div>
  )
}

function ContentRenderer({ doc, url }: { doc: Document, url: string }) {
  if (doc.contentType === 'pdf') {
    return (
      <div className="overflow-hidden rounded-lg border border-spill-divider">
        <iframe
          src={`${url}#toolbar=1&navpanes=1`}
          className="h-[75vh] w-full bg-white"
          title={doc.title}
        />
      </div>
    )
  }

  if (doc.contentType === 'html') {
    return <HtmlRenderer doc={doc} url={url} />
  }

  if (doc.contentType === 'image') {
    return (
      <div className="overflow-hidden rounded-lg border border-spill-divider bg-spill-bg">
        <img src={url} alt={doc.title} className="mx-auto max-h-[80vh] object-contain" />
      </div>
    )
  }

  if (doc.contentType === 'video') {
    const ext = (doc.fileName || '').split('.').pop()?.toLowerCase()
    const needsTranscode = ext && !['mp4', 'webm', 'ogg'].includes(ext)
    const videoSrc = needsTranscode ? streamUrl(doc.id) : url
    return (
      <div className="overflow-hidden rounded-lg border border-spill-divider bg-black">
        <video src={videoSrc} controls className="mx-auto max-h-[75vh] w-full" />
      </div>
    )
  }

  if (doc.contentType === 'audio') {
    return (
      <div className="rounded-lg border border-spill-divider bg-spill-surface p-6">
        <audio src={url} controls className="w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-spill-divider bg-spill-surface py-16">
      <p className="text-sm text-spill-text-secondary">Preview not available for this file type</p>
      <a
        href={url}
        download={doc.fileName}
        className="mt-4 flex items-center gap-2 rounded-md bg-spill-accent px-4 py-2 text-sm font-semibold text-spill-bg"
      >
        <Download className="h-4 w-4" />
        Download to View
      </a>
    </div>
  )
}

function DetailRow({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-spill-text-secondary">{label}</dt>
      <dd className="text-right font-medium text-spill-text-primary truncate max-w-[180px]">{value}</dd>
    </div>
  )
}
