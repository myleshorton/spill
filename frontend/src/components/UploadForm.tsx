'use client'

import { useState, useCallback, useRef } from 'react'
import { FileUp, Loader2, CheckCircle, XCircle, Shield, FileSearch, Database, Upload } from 'lucide-react'
import { getUploadStatus, formatFileSize, type UploadJob } from '@/lib/api'
import { siteConfig } from '@/config/site.config'
import Link from 'next/link'

type FileJob = UploadJob & {
  fileName: string
  uploadProgress?: number // 0-100, only during upload phase
}

const STATUS_LABELS: Record<string, { label: string; icon: typeof Loader2; color: string }> = {
  uploading: { label: 'Uploading', icon: Upload, color: 'text-spill-accent' },
  pending: { label: 'Queued', icon: Loader2, color: 'text-spill-text-secondary' },
  scanning: { label: 'Scanning for viruses', icon: Shield, color: 'text-amber-400' },
  extracting: { label: 'Extracting text', icon: FileSearch, color: 'text-blue-400' },
  indexing: { label: 'Indexing for search', icon: Database, color: 'text-purple-400' },
  complete: { label: 'Complete', icon: CheckCircle, color: 'text-emerald-400' },
  failed: { label: 'Failed', icon: XCircle, color: 'text-red-400' },
}

export default function UploadForm() {
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [jobs, setJobs] = useState<FileJob[]>([])
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const maxSize = (siteConfig as any).upload?.maxSizeMB || 500
  const allowedTypes = (siteConfig as any).upload?.allowedTypes || []

  const handleFiles = useCallback(async (files: File[]) => {
    setError(null)
    setJobs([])

    // Client-side validation
    const valid: File[] = []
    for (const file of files) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      if (allowedTypes.length > 0 && !allowedTypes.includes(ext)) {
        setError(`File type ${ext} is not allowed.`)
        return
      }
      if (file.size > maxSize * 1024 * 1024) {
        setError(`File too large: ${file.name}. Maximum size is ${maxSize}MB.`)
        return
      }
      valid.push(file)
    }

    setUploading(true)

    // Initialize all files as "uploading" with 0% progress
    const initial: FileJob[] = valid.map((f, i) => ({
      jobId: `pending-${i}`,
      status: 'uploading' as any,
      fileName: f.name,
      uploadProgress: 0,
    }))
    setJobs(initial)

    // Mutable ref for building up results so XHR callbacks can update state
    const current = [...initial]

    const uploadOne = (file: File, idx: number): Promise<FileJob> =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        const form = new FormData()
        form.append('file', file)

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100)
            current[idx] = { ...current[idx], uploadProgress: pct }
            setJobs([...current])
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const result = JSON.parse(xhr.responseText)
            const job: FileJob = { ...result, fileName: file.name }
            current[idx] = job
            setJobs([...current])
            resolve(job)
          } else {
            try {
              const err = JSON.parse(xhr.responseText)
              reject(new Error(err.error || `Upload failed: ${xhr.status}`))
            } catch {
              reject(new Error(`Upload failed: ${xhr.status}`))
            }
          }
        })

        xhr.addEventListener('error', () => reject(new Error(`Network error`)))
        xhr.open('POST', '/api/upload')
        xhr.send(form)
      })

    // Upload all files in parallel
    const settled = await Promise.allSettled(
      valid.map((file, i) => uploadOne(file, i))
    )

    // Update any that failed
    settled.forEach((s, i) => {
      if (s.status === 'rejected') {
        current[i] = { jobId: `error-${i}`, status: 'failed', error: s.reason?.message, fileName: valid[i].name }
      }
    })
    setJobs([...current])
    setUploading(false)

    // Poll for processing status of successfully uploaded jobs
    const hasPollable = current.some(r => r.status !== 'failed')
    if (hasPollable) {
      if (pollRef.current) clearInterval(pollRef.current)
      const pollResults = [...current]
      pollRef.current = setInterval(async () => {
        try {
          const updated = await Promise.all(
            pollResults.map(r =>
              r.status === 'failed' || r.status === 'complete'
                ? r
                : getUploadStatus(r.jobId).then(u => ({ ...u, fileName: r.fileName } as FileJob)).catch(() => r)
            )
          )
          // Sync back
          updated.forEach((u, i) => { pollResults[i] = u })
          setJobs([...pollResults])
          if (updated.every(j => j.status === 'complete' || j.status === 'failed')) {
            if (pollRef.current) clearInterval(pollRef.current)
          }
        } catch {}
      }, 1500)
    }
  }, [maxSize, allowedTypes])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) handleFiles(files)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) handleFiles(files)
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`
          relative cursor-pointer rounded-xl border-2 border-dashed p-12
          transition-all duration-200
          ${dragOver
            ? 'border-spill-accent bg-spill-accent/5 scale-[1.01]'
            : 'border-spill-divider bg-spill-surface/30 hover:border-spill-accent/40 hover:bg-spill-surface/50'
          }
          ${uploading ? 'pointer-events-none opacity-60' : ''}
        `}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          onChange={handleInputChange}
          className="hidden"
          accept={allowedTypes.join(',')}
        />

        <div className="flex flex-col items-center gap-4 text-center">
          <div className={`
            flex h-16 w-16 items-center justify-center rounded-2xl transition-colors
            ${dragOver ? 'bg-spill-accent/20' : 'bg-spill-surface'}
          `}>
            {uploading ? (
              <Loader2 className="h-7 w-7 animate-spin text-spill-accent" />
            ) : (
              <FileUp className={`h-7 w-7 ${dragOver ? 'text-spill-accent' : 'text-spill-text-secondary'}`} />
            )}
          </div>

          <div>
            <p className="font-headline text-sm font-medium text-spill-text-primary">
              {uploading ? 'Uploading...' : 'Drop files here or click to browse'}
            </p>
            {!uploading && (
              <p className="mt-1 text-xs text-spill-text-secondary">
                PDF, images, videos, audio, documents — up to {maxSize}MB
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 shrink-0 text-red-400" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* Per-file status cards */}
      {jobs.map((job) => {
        const isUploading = (job.status as string) === 'uploading'
        const statusInfo = STATUS_LABELS[job.status] || STATUS_LABELS.pending
        const StatusIcon = statusInfo.icon
        const shouldSpin = isUploading || (job.status !== 'complete' && job.status !== 'failed')

        return (
          <div key={job.jobId} className="rounded-lg border border-spill-divider bg-spill-surface/50 px-5 py-4">
            <div className="flex items-center gap-3">
              <StatusIcon className={`h-5 w-5 ${statusInfo.color} ${shouldSpin ? 'animate-spin' : ''}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-spill-text-primary truncate">
                  {job.fileName}
                </p>
                <p className={`text-xs ${statusInfo.color}`}>
                  {isUploading ? `Uploading — ${job.uploadProgress ?? 0}%` : statusInfo.label}
                </p>
                {job.status === 'failed' && job.error && (
                  <p className="mt-0.5 text-xs text-red-300/70">{job.error}</p>
                )}
                {job.status === 'complete' && job.documentId && (
                  <Link
                    href={`/doc/${job.documentId}`}
                    className="mt-1 inline-block text-xs text-spill-accent hover:underline"
                  >
                    View document →
                  </Link>
                )}
              </div>
            </div>

            {/* Progress bar — upload phase or processing pipeline */}
            {job.status !== 'failed' && (
              <div className="mt-3 flex items-center gap-1">
                {isUploading ? (
                  <div className="h-1 w-full overflow-hidden rounded-full bg-spill-surface">
                    <div
                      className="h-full rounded-full bg-spill-accent transition-all duration-300"
                      style={{ width: `${job.uploadProgress ?? 0}%` }}
                    />
                  </div>
                ) : (
                  ['scanning', 'extracting', 'indexing', 'complete'].map((step, i) => {
                    const steps = ['scanning', 'extracting', 'indexing', 'complete']
                    const currentIdx = steps.indexOf(job.status)
                    const done = i <= currentIdx
                    return (
                      <div
                        key={step}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          done ? 'bg-spill-accent' : 'bg-spill-surface'
                        }`}
                      />
                    )
                  })
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
