const pLimit = require('p-limit')

class Scheduler {
  constructor ({ crawlDb, fetcher, processor, adapters, options = {} }) {
    this.crawlDb = crawlDb
    this.fetcher = fetcher
    this.processor = processor
    this.adapters = adapters
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

  _sleep (ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

module.exports = Scheduler
