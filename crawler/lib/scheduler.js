const pLimit = require('p-limit')
const path = require('path')
const fs = require('fs')

let archiveExtractor = null
try { archiveExtractor = require('./archive-extractor') } catch {}

class Scheduler {
  constructor ({ crawlDb, fetcher, processor, adapters, socialPoster, options = {} }) {
    this.crawlDb = crawlDb
    this.fetcher = fetcher
    this.processor = processor
    this.adapters = adapters
    this.socialPoster = socialPoster || null
    this.concurrency = options.concurrency || 5
    this.maxDepth = options.maxDepth || 3
    this.batchSize = options.batchSize || 20
    this.enabledAdapters = options.enabledAdapters || null // null = all
    this.running = false
    this.processed = 0
    this.indexed = 0
    this.failed = 0
    this.skipped = 0

    this._limit = pLimit(this.concurrency)
    this._domainTimers = new Map()
  }

  async start () {
    this.running = true
    console.log('[scheduler] Starting crawler (concurrency=%d, depth=%d)', this.concurrency, this.maxDepth)

    while (this.running) {
      const batch = this.crawlDb.nextBatch(this.batchSize, this.enabledAdapters)
      if (batch.length === 0) {
        console.log('[scheduler] Queue empty, waiting 30s...')
        await this._sleep(30000)

        // Run search discovery to find new URLs
        if (this._isAdapterEnabled('search-discovery') && this.adapters['search-discovery']) {
          try {
            const discovered = await this.adapters['search-discovery'].discover()
            if (discovered > 0) {
              console.log('[scheduler] Search discovery found %d new URLs', discovered)
              continue
            }
          } catch (err) {
            console.error('[scheduler] Search discovery error: %s', err.message)
          }
        }

        // If still empty after discovery, wait longer
        const recheckBatch = this.crawlDb.nextBatch(1)
        if (recheckBatch.length === 0) {
          console.log('[scheduler] Still empty after discovery, waiting 5m...')
          await this._sleep(300000)
        }
        continue
      }

      // Filter by depth
      const eligible = batch.filter(row => {
        if (row.depth > this.maxDepth) {
          this.crawlDb.markSkipped(row.id, 'max depth exceeded')
          this.skipped++
          return false
        }
        return true
      })

      if (eligible.length === 0) continue

      // Process batch with concurrency limiting and per-domain delays
      const tasks = eligible.map(row => this._limit(() => this._processUrl(row)))
      await Promise.allSettled(tasks)

      this._logProgress()
    }

    console.log('[scheduler] Crawler stopped')
  }

  stop () {
    this.running = false
  }

  async _processUrl (row) {
    if (!this.running) return

    // Per-domain rate limiting
    await this._waitForDomain(row.domain, row.min_delay_ms || 2000)

    this.crawlDb.markFetching(row.id)

    // Fetch
    const fetchResult = await this.fetcher.fetch(row.url)

    if (fetchResult.skipped) {
      this.crawlDb.markSkipped(row.id, fetchResult.error)
      this.skipped++
      return
    }

    if (fetchResult.error && !fetchResult.filePath) {
      this.crawlDb.markFailed(row.id, fetchResult.error)
      this.failed++
      return
    }

    this.crawlDb.markFetched(row.id, {
      status: 'fetched',
      contentType: fetchResult.contentType,
      httpStatus: fetchResult.status,
      domain: row.domain,
    })

    // Discover new URLs from this page via the appropriate adapter
    const adapter = this._getAdapter(row.source)
    if (adapter && fetchResult.filePath) {
      try {
        const discovered = await adapter.extractLinks(fetchResult, row)
        if (discovered && discovered.length > 0) {
          const newUrls = discovered
            .filter(u => u.url)
            .map(u => ({
              url: u.url,
              priority: u.priority || row.priority * 0.8,
              depth: row.depth + 1,
              source: u.source || row.source,
              parentUrl: row.url,
            }))
          if (newUrls.length > 0) {
            this.crawlDb.addUrlBatch(newUrls)
          }
        }
      } catch (err) {
        console.warn('[scheduler] Link extraction failed for %s: %s', row.url, err.message)
      }
    }

    // Handle HLS manifests — extract direct MP4 download URLs
    if (fetchResult.filePath && this._isHlsManifest(fetchResult)) {
      try {
        const videoUrls = this._parseHlsManifest(fetchResult)
        if (videoUrls.length > 0) {
          this.crawlDb.addUrlBatch(videoUrls.map(u => ({
            url: u.url,
            priority: u.priority || 0.95,
            depth: row.depth,
            source: row.source,
            parentUrl: row.url,
          })))
          console.log('[scheduler] HLS manifest %s → queued %d direct video URLs', row.url.slice(0, 80), videoUrls.length)
        }
        this.crawlDb.markProcessed(row.id, 0.5)
        this.processed++
        return
      } catch (err) {
        console.warn('[scheduler] HLS parsing failed for %s: %s', row.url, err.message)
      }
    }

    // Extract archives and process each contained file
    if (archiveExtractor && fetchResult.filePath && archiveExtractor.isArchiveFile(fetchResult.filePath)) {
      try {
        const extracted = await archiveExtractor.extractArchive(fetchResult.filePath)
        if (extracted.length > 0) {
          console.log('[scheduler] Extracted %d files from archive %s', extracted.length, path.basename(fetchResult.filePath))
          for (const file of extracted) {
            try {
              const syntheticFetch = {
                url: fetchResult.url + '#' + encodeURIComponent(file.fileName),
                finalUrl: fetchResult.finalUrl + '#' + encodeURIComponent(file.fileName),
                status: 200,
                contentType: archiveExtractor.guessContentType(file.filePath),
                filePath: file.filePath,
                size: file.size,
                headers: fetchResult.headers,
              }
              await this.processor.process(syntheticFetch, row)
              this.processed++
            } catch (err) {
              console.warn('[scheduler] Failed to process extracted file %s: %s', file.fileName, err.message)
            }
          }
          this.crawlDb.markProcessed(row.id, 0.5)
          return
        }
      } catch (err) {
        console.warn('[scheduler] Archive extraction failed for %s: %s', row.url, err.message)
      }
    }

    // Process content
    try {
      const result = await this.processor.process(fetchResult, row)

      if (result.skipped) {
        if (result.reason === 'duplicate') {
          this.crawlDb.markSkipped(row.id, 'duplicate: ' + result.existingId)
        } else if (result.reason === 'low relevance') {
          this.crawlDb.markProcessed(row.id, result.score || 0)
        } else {
          this.crawlDb.markSkipped(row.id, result.reason)
        }
        this.skipped++
        return
      }

      if (result.dryRun) {
        console.log('[dry-run] ' + result.score.toFixed(2) + ' ' + result.title.slice(0, 60) + ' — ' + result.url)
        this.crawlDb.markProcessed(row.id, result.score)
        this.processed++
        return
      }

      if (result.indexed) {
        this.crawlDb.markProcessed(row.id, result.score)
        this.crawlDb.bumpDomainRelevance(row.domain)
        this.indexed++
        console.log('[indexed] ' + result.score.toFixed(2) + ' [' + result.category + '] ' + result.title.slice(0, 60))

        // Fire-and-forget social posting for high-relevance docs
        if (this.socialPoster) {
          this.socialPoster.post(result).catch(err => {
            console.warn('[social] Post error: %s', err.message)
          })
        }
      }
      this.processed++
    } catch (err) {
      this.crawlDb.markFailed(row.id, err.message)
      this.failed++
      console.error('[scheduler] Process error for %s: %s', row.url, err.message)
    }
  }

  async _waitForDomain (domain, minDelay) {
    const lastFetch = this._domainTimers.get(domain) || 0
    const elapsed = Date.now() - lastFetch
    if (elapsed < minDelay) {
      await this._sleep(minDelay - elapsed)
    }
    this._domainTimers.set(domain, Date.now())
  }

  _getAdapter (source) {
    if (!source || !this.adapters) return this.adapters?.generic || null
    return this.adapters[source] || this.adapters.generic || null
  }

  _isAdapterEnabled (name) {
    if (!this.enabledAdapters) return true
    return this.enabledAdapters.includes(name)
  }

  _logProgress () {
    if (this.processed % 10 === 0 && this.processed > 0) {
      console.log('[scheduler] Progress — processed: %d, indexed: %d, skipped: %d, failed: %d',
        this.processed, this.indexed, this.skipped, this.failed)
    }
  }

  _isHlsManifest (fetchResult) {
    const ct = (fetchResult.contentType || '').toLowerCase()
    const url = (fetchResult.finalUrl || fetchResult.url || '').toLowerCase()
    return ct.includes('mpegurl') || ct.includes('x-mpegurl') ||
           url.endsWith('.m3u8') || url.includes('.m3u8?')
  }

  _parseHlsManifest (fetchResult) {
    const content = fs.readFileSync(fetchResult.filePath, 'utf8')
    const url = fetchResult.finalUrl || fetchResult.url
    const videoUrls = []

    // DW pattern: derive direct MP4 download URL from HLS manifest URL
    // HLS:    hlsvod.dw.com/i/dwtv_video/flv/je/je20260301_KHAMENEI11G_,AVC_480x270,...,AVC_1920x1080,.mp4.csmil/master.m3u8
    // Direct: tvdownloaddw-a.akamaihd.net/dwtv_video/flv/je/je20260301_KHAMENEI11G_AVC_1920x1080.mp4
    if (url.includes('hlsvod.dw.com') || url.includes('dw.com')) {
      const baseMatch = url.match(/\/i\/(.+?)_,/)
      if (baseMatch) {
        const basePath = baseMatch[1]
        const resolutions = url.match(/AVC_(\d+x\d+)/g) || []
        const bestRes = resolutions[resolutions.length - 1] || 'AVC_1920x1080'
        const directUrl = `https://tvdownloaddw-a.akamaihd.net/${basePath}_${bestRes}.mp4`
        videoUrls.push({ url: directUrl, priority: 0.95 })
      }
    }

    // DVIDS pattern: derive direct MP4 from HLS manifest
    // HLS master references: d34w7g4gy10iej.cloudfront.net/video/2603/DOD_111549920/DOD_111549920-1920x1080-12514k-hls_1.m3u8
    // Direct: d34w7g4gy10iej.cloudfront.net/video/2603/DOD_111549920/DOD_111549920.mp4
    if (url.includes('dvidshub.net') || content.includes('cloudfront.net/video/')) {
      const lines = content.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.includes('cloudfront.net/video/') && trimmed.includes('-hls_')) {
          // Extract base path: everything before the resolution suffix
          const cfMatch = trimmed.match(/(https:\/\/[^/]+\/video\/[^/]+\/([^/]+))\/\2-/)
          if (cfMatch) {
            const directUrl = `${cfMatch[1]}/${cfMatch[2]}.mp4`
            videoUrls.push({ url: directUrl, priority: 0.95 })
            break // Only need one
          }
        }
      }
    }

    // Generic: if we couldn't derive a direct URL, try to find any referenced MP4 in the manifest
    if (videoUrls.length === 0) {
      const lines = content.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.match(/https?:\/\/.*\.mp4(\?|$)/i)) {
          videoUrls.push({ url: trimmed.split('?')[0], priority: 0.9 })
          break
        }
      }
    }

    return videoUrls
  }

  _sleep (ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

module.exports = Scheduler
