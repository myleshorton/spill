'use client'

import { useState, useEffect, useCallback } from 'react'
import { Download, ExternalLink, Copy, Check, Star, MessageSquare, Pencil, Trash2, Send, Shield, ThumbsUp, ThumbsDown, Share2, Link as LinkIcon } from 'lucide-react'
import Link from 'next/link'
import {
  type Document, type Entity, type FinancialRecord, type Comment,
  contentUrl, streamUrl, previewUrl, getDocumentText, getDocumentTranscript,
  getDocumentEntities, getDocumentFinancials, formatFileSize,
  toggleStar, getStarStatus, getComments, addComment, updateComment, deleteComment,
  requestMagicLink, vote, getVoteStatus, type VoteStatus
} from '@/lib/api'
import { siteConfig } from '@/config/site.config'

interface DocumentViewerProps {
  doc: Document
}

export default function DocumentViewer({ doc }: DocumentViewerProps) {
  const [extractedText, setExtractedText] = useState<string | null>(null)
  const [showText, setShowText] = useState(false)
  const [entities, setEntities] = useState<Entity[]>([])
  const [financials, setFinancials] = useState<FinancialRecord[]>([])
  const [copied, setCopied] = useState(false)
  const [starred, setStarred] = useState(false)
  const [starCount, setStarCount] = useState(0)
  const [voteStatus, setVoteStatus] = useState<VoteStatus>({ userVote: 0, upvotes: 0, downvotes: 0, score: 0 })
  const [comments, setComments] = useState<Comment[]>([])
  const [commentTotal, setCommentTotal] = useState(0)
  const [commentBody, setCommentBody] = useState('')
  const [commentName, setCommentName] = useState('')
  const [commentError, setCommentError] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editBody, setEditBody] = useState('')
  const [emailForVerify, setEmailForVerify] = useState('')
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const url = contentUrl(doc.id)

  const isMedia = doc.contentType === 'audio' || doc.contentType === 'video'

  useEffect(() => {
    getStarStatus(doc.id).then(s => { setStarred(s.starred); setStarCount(s.count) }).catch(() => {})
    getVoteStatus(doc.id).then(setVoteStatus).catch(() => {})
  }, [doc.id])

  const loadComments = useCallback((offset = 0) => {
    getComments(doc.id, 50, offset).then(data => {
      if (offset === 0) {
        setComments(data.comments)
      } else {
        setComments(prev => [...prev, ...data.comments])
      }
      setCommentTotal(data.total)
    }).catch(() => {})
  }, [doc.id])

  useEffect(() => { loadComments() }, [loadComments])

  // Auto-submit pending comment after returning from email verification
  useEffect(() => {
    try {
      const pending = localStorage.getItem('pendingComment')
      if (!pending) return
      const { docId, body, name } = JSON.parse(pending)
      if (docId !== doc.id) return
      localStorage.removeItem('pendingComment')
      // Pre-fill the form then try to submit
      setCommentBody(body)
      setCommentName(name)
      addComment(doc.id, body, name).then(() => {
        setCommentBody('')
        loadComments()
      }).catch(() => {
        // Leave the form filled so user can retry manually
      })
    } catch {}
  }, [doc.id, loadComments])

  async function handleToggleStar() {
    const prev = starred
    const prevCount = starCount
    setStarred(!prev)
    setStarCount(prev ? prevCount - 1 : prevCount + 1)
    try {
      const result = await toggleStar(doc.id)
      setStarred(result.starred)
      setStarCount(result.count)
    } catch {
      setStarred(prev)
      setStarCount(prevCount)
    }
  }

  async function handleVote(value: 1 | -1) {
    const newValue = voteStatus.userVote === value ? 0 : value
    // Optimistic update
    const prev = voteStatus
    setVoteStatus({
      ...prev,
      userVote: newValue,
      upvotes: prev.upvotes + (newValue === 1 ? 1 : 0) - (prev.userVote === 1 ? 1 : 0),
      downvotes: prev.downvotes + (newValue === -1 ? 1 : 0) - (prev.userVote === -1 ? 1 : 0),
      score: prev.score + newValue - prev.userVote,
    })
    try {
      const result = await vote(doc.id, newValue as 1 | -1 | 0)
      setVoteStatus(result)
    } catch {
      setVoteStatus(prev)
    }
  }

  async function handleAddComment() {
    setCommentError('')
    if (!commentBody.trim() || !commentName.trim()) {
      setCommentError('Name and comment are required')
      return
    }
    try {
      await addComment(doc.id, commentBody.trim(), commentName.trim())
      setCommentBody('')
      loadComments()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add comment'
      setCommentError(msg)
    }
  }

  async function handleUpdateComment(id: number) {
    if (!editBody.trim()) return
    try {
      await updateComment(id, editBody.trim())
      setEditingId(null)
      setEditBody('')
      loadComments()
    } catch {}
  }

  async function handleDeleteComment(id: number) {
    try {
      await deleteComment(id)
      loadComments()
    } catch {}
  }

  async function handleRequestMagicLink() {
    if (!emailForVerify.includes('@')) return
    setVerifyStatus('sending')
    try {
      // Save pending comment so it can be auto-submitted after verification
      if (commentBody.trim() && commentName.trim()) {
        localStorage.setItem('pendingComment', JSON.stringify({
          docId: doc.id,
          body: commentBody.trim(),
          name: commentName.trim()
        }))
      }
      await requestMagicLink(emailForVerify)
      setVerifyStatus('sent')
    } catch {
      setVerifyStatus('idle')
    }
  }

  useEffect(() => {
    if (showText && extractedText === null) {
      // For media files, load transcript as the extracted text
      const loader = isMedia
        ? getDocumentTranscript(doc.id)
        : getDocumentText(doc.id)
      loader.then(setExtractedText).catch(() => setExtractedText(''))
    }
  }, [showText, doc.id, extractedText, isMedia])

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
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <h1 className="font-headline text-2xl font-bold text-spill-text-primary flex-1">
              {doc.title}
            </h1>
            <div className="mt-1 flex shrink-0 items-center gap-1">
              <button
                onClick={() => handleVote(1)}
                className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-spill-surface ${voteStatus.userVote === 1 ? 'text-green-400' : 'text-spill-text-secondary'}`}
                title="Upvote"
              >
                <ThumbsUp className={`h-4 w-4 ${voteStatus.userVote === 1 ? 'fill-green-400/30' : ''}`} />
                {voteStatus.upvotes > 0 && <span className="text-xs">{voteStatus.upvotes}</span>}
              </button>
              <button
                onClick={() => handleVote(-1)}
                className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-spill-surface ${voteStatus.userVote === -1 ? 'text-red-400' : 'text-spill-text-secondary'}`}
                title="Downvote"
              >
                <ThumbsDown className={`h-4 w-4 ${voteStatus.userVote === -1 ? 'fill-red-400/30' : ''}`} />
                {voteStatus.downvotes > 0 && <span className="text-xs">{voteStatus.downvotes}</span>}
              </button>
              <span className="mx-0.5 text-spill-divider">|</span>
              <button
                onClick={handleToggleStar}
                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-spill-surface"
                title={starred ? 'Unstar' : 'Star'}
              >
                <Star className={`h-4 w-4 ${starred ? 'fill-yellow-400 text-yellow-400' : 'text-spill-text-secondary'}`} />
                {starCount > 0 && <span className="text-xs text-spill-text-secondary">{starCount}</span>}
              </button>
            </div>
          </div>

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

          {/* Comments section */}
          <div className="mt-8 border-t border-spill-divider pt-6">
            <h2 className="flex items-center gap-2 font-headline text-lg font-semibold text-spill-text-primary">
              <MessageSquare className="h-5 w-5" />
              Comments {commentTotal > 0 && <span className="text-sm font-normal text-spill-text-secondary">({commentTotal})</span>}
            </h2>

            {/* Comment form or verify prompt */}
            <div className="mt-4 rounded-lg border border-spill-divider bg-spill-surface p-4">
              {commentError && commentError.includes('Email verification') ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-spill-text-secondary">
                    <Shield className="h-4 w-4" />
                    Verify your email to comment
                  </div>
                  {verifyStatus === 'sent' ? (
                    <p className="text-sm text-spill-success">Check your email for the verification link.</p>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={emailForVerify}
                        onChange={e => setEmailForVerify(e.target.value)}
                        placeholder="your@email.com"
                        className="flex-1 rounded-md border border-spill-divider bg-spill-bg px-3 py-1.5 text-sm text-spill-text-primary placeholder:text-spill-text-secondary/60 focus:border-spill-accent/50 focus:outline-none"
                      />
                      <button
                        onClick={handleRequestMagicLink}
                        disabled={verifyStatus === 'sending'}
                        className="rounded-md bg-spill-accent px-3 py-1.5 text-sm font-medium text-spill-bg hover:bg-spill-accent-hover disabled:opacity-50 transition-colors"
                      >
                        {verifyStatus === 'sending' ? 'Sending...' : 'Send Link'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={commentName}
                    onChange={e => setCommentName(e.target.value)}
                    placeholder="Display name"
                    className="w-full rounded-md border border-spill-divider bg-spill-bg px-3 py-1.5 text-sm text-spill-text-primary placeholder:text-spill-text-secondary/60 focus:border-spill-accent/50 focus:outline-none"
                  />
                  <textarea
                    value={commentBody}
                    onChange={e => setCommentBody(e.target.value)}
                    placeholder="Write a comment..."
                    rows={3}
                    className="w-full rounded-md border border-spill-divider bg-spill-bg px-3 py-2 text-sm text-spill-text-primary placeholder:text-spill-text-secondary/60 focus:border-spill-accent/50 focus:outline-none resize-none"
                  />
                  {commentError && !commentError.includes('Email verification') && (
                    <p className="text-xs text-red-400">{commentError}</p>
                  )}
                  <div className="flex justify-end">
                    <button
                      onClick={handleAddComment}
                      className="flex items-center gap-1.5 rounded-md bg-spill-accent px-3 py-1.5 text-sm font-medium text-spill-bg hover:bg-spill-accent-hover transition-colors"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Comment
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Comment list */}
            {comments.length > 0 && (
              <div className="mt-4 space-y-3">
                {comments.map(c => (
                  <div key={c.id} className="rounded-lg border border-spill-divider bg-spill-surface p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-spill-text-primary">{c.displayName}</span>
                        <span className="text-xs text-spill-text-secondary">
                          {formatRelativeTime(c.createdAt)}
                          {c.updatedAt && ' (edited)'}
                        </span>
                      </div>
                      {c.isOwn && editingId !== c.id && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setEditingId(c.id); setEditBody(c.body) }}
                            className="rounded p-1 text-spill-text-secondary hover:text-spill-text-primary transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteComment(c.id)}
                            className="rounded p-1 text-spill-text-secondary hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    {editingId === c.id ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          value={editBody}
                          onChange={e => setEditBody(e.target.value)}
                          rows={3}
                          className="w-full rounded-md border border-spill-divider bg-spill-bg px-3 py-2 text-sm text-spill-text-primary focus:border-spill-accent/50 focus:outline-none resize-none"
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded-md px-3 py-1 text-sm text-spill-text-secondary hover:text-spill-text-primary transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleUpdateComment(c.id)}
                            className="rounded-md bg-spill-accent px-3 py-1 text-sm font-medium text-spill-bg hover:bg-spill-accent-hover transition-colors"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-spill-text-secondary">{c.body}</p>
                    )}
                  </div>
                ))}
                {comments.length < commentTotal && (
                  <button
                    onClick={() => loadComments(comments.length)}
                    className="w-full rounded-md border border-spill-divider bg-spill-surface px-3 py-2 text-sm text-spill-text-secondary hover:text-spill-text-primary transition-colors"
                  >
                    Load more comments
                  </button>
                )}
              </div>
            )}
          </div>
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
                    href={`/entity/${e.id}`}
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

          <ShareLinks doc={doc} />

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

function formatRelativeTime(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

function ShareLinks({ doc }: { doc: Document }) {
  const [linkCopied, setLinkCopied] = useState(false)
  const pageUrl = `${siteConfig.siteUrl}/doc/${doc.id}`
  const text = `${doc.title} — ${siteConfig.name}`

  function copyLink() {
    navigator.clipboard.writeText(pageUrl)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  return (
    <div className="rounded-lg border border-spill-divider bg-spill-surface p-4">
      <h3 className="flex items-center gap-1.5 font-headline text-sm font-semibold text-spill-text-primary">
        <Share2 className="h-3.5 w-3.5" />
        Share
      </h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a
          href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 rounded-md border border-spill-divider bg-spill-bg px-3 py-2 text-xs text-spill-text-secondary hover:text-spill-text-primary hover:border-spill-accent/30 transition-colors"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
          Post
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 rounded-md border border-spill-divider bg-spill-bg px-3 py-2 text-xs text-spill-text-secondary hover:text-spill-text-primary hover:border-spill-accent/30 transition-colors"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
          Share
        </a>
        <a
          href={`https://www.reddit.com/submit?url=${encodeURIComponent(pageUrl)}&title=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 rounded-md border border-spill-divider bg-spill-bg px-3 py-2 text-xs text-spill-text-secondary hover:text-spill-text-primary hover:border-spill-accent/30 transition-colors"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" /></svg>
          Reddit
        </a>
        <button
          onClick={copyLink}
          className="flex items-center justify-center gap-1.5 rounded-md border border-spill-divider bg-spill-bg px-3 py-2 text-xs text-spill-text-secondary hover:text-spill-text-primary hover:border-spill-accent/30 transition-colors"
        >
          {linkCopied ? <Check className="h-3.5 w-3.5 text-spill-success" /> : <LinkIcon className="h-3.5 w-3.5" />}
          {linkCopied ? 'Copied!' : 'Copy Link'}
        </button>
      </div>
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
