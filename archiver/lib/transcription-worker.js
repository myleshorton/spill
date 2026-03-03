/**
 * Background transcription worker.
 *
 * Periodically scans for audio/video documents missing transcripts
 * and transcribes them using whisper-cpp or OpenAI Whisper API.
 */
const path = require('path')

let transcribe = null
try {
  transcribe = require('../../ingest/lib/transcriber').transcribe
} catch (err) {
  console.warn('[transcription-worker] Transcriber module not available:', err.message)
}

const POLL_INTERVAL = 30_000 // 30s between scans
const BATCH_SIZE = 5

class TranscriptionWorker {
  constructor (docsDb, searchIndex) {
    this.docsDb = docsDb
    this.searchIndex = searchIndex
    this.running = false
    this.timer = null
    this.active = false // currently processing
  }

  start () {
    if (!transcribe) {
      console.warn('[transcription-worker] No transcriber available, worker disabled')
      return
    }

    const backend = process.env.WHISPER_CPP_PATH || process.env.OPENAI_API_KEY
    if (!backend) {
      console.warn('[transcription-worker] No transcription backend configured (WHISPER_CPP_PATH or OPENAI_API_KEY)')
      return
    }

    this.running = true
    console.log('[transcription-worker] Started (polling every %ds, batch size %d)', POLL_INTERVAL / 1000, BATCH_SIZE)
    // Initial run after short delay to let startup finish
    this.timer = setTimeout(() => this._tick(), 5000)
  }

  stop () {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
  }

  async _tick () {
    if (!this.running || this.active) return

    this.active = true
    try {
      const docs = this.docsDb.getAllUntranscribedMedia(BATCH_SIZE)
      if (docs.length > 0) {
        console.log('[transcription-worker] Found %d files to transcribe', docs.length)
      }

      for (const doc of docs) {
        if (!this.running) break
        try {
          const text = await transcribe(doc.file_path, doc.content_type)
          if (text && text.trim().length > 0) {
            this.docsDb.db.prepare('UPDATE documents SET transcript = ? WHERE id = ?').run(text, doc.id)
            // Update search index
            try {
              const updated = this.docsDb.get(doc.id)
              if (updated) await this.searchIndex.addDocuments([updated])
            } catch (err) {
              console.warn('[transcription-worker] Meilisearch update failed for %s: %s', doc.id, err.message)
            }
          } else {
            // Mark so we don't retry
            this.docsDb.db.prepare("UPDATE documents SET transcript = '_empty' WHERE id = ?").run(doc.id)
          }
        } catch (err) {
          console.warn('[transcription-worker] Error transcribing %s: %s', doc.id, err.message)
        }
      }
    } catch (err) {
      console.error('[transcription-worker] Tick error:', err.message)
    } finally {
      this.active = false
      if (this.running) {
        this.timer = setTimeout(() => this._tick(), POLL_INTERVAL)
      }
    }
  }
}

module.exports = TranscriptionWorker
