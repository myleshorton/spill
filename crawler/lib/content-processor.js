const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const cheerio = require('cheerio')

const CONTENT_DIR = process.env.CONTENT_DIR || path.join(process.cwd(), '..', 'data', 'content')
const THUMB_DIR = process.env.THUMB_DIR || path.join(process.cwd(), '..', 'data', 'thumbnails')

// Categories mapped from adapter source + content type
const SOURCE_CATEGORY_MAP = {
  court: 'court_record',
  news: 'news_article',
  government: 'government_report',
  'archive-org': 'web_archive',
  generic: 'web_page',
  'search-discovery': 'web_page',
}

let entityExtractor = null
try {
  entityExtractor = require('../../ingest/lib/entity-extractor')
} catch {}

class ContentProcessor {
  constructor ({ docsDb, searchIndex, relevanceScorer, textExtract, thumbnails, fileUtils, transcriber, embedder, imageKeywords, options = {} }) {
    this.docsDb = docsDb
    this.searchIndex = searchIndex
    this.scorer = relevanceScorer
    this.textExtract = textExtract
    this.thumbnails = thumbnails
    this.fileUtils = fileUtils
    this.transcriber = transcriber
    this.embedder = embedder
    this.imageKeywords = imageKeywords
    this.minRelevance = options.minRelevance || 0.3
    this.autoIndexThreshold = options.autoIndexThreshold || 0.5
    this.dryRun = options.dryRun || false
    this.contentDir = options.contentDir || CONTENT_DIR
    this.thumbDir = options.thumbDir || THUMB_DIR
  }

  async process (fetchResult, urlRow) {
    const { filePath, contentType, finalUrl } = fetchResult
    if (!filePath || !fs.existsSync(filePath)) {
      return { skipped: true, reason: 'no file' }
    }

    // 1. Hash
    const fileBuffer = fs.readFileSync(filePath)
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex')

    // 2. Dedup
    const existing = this.docsDb.findByHash(sha256)
    if (existing) {
      return { skipped: true, reason: 'duplicate', existingId: existing.id }
    }

    // 3. Extract text
    let text = ''
    const isHtml = (contentType || '').includes('html')
    let isPdf = (contentType || '').includes('pdf') || filePath.endsWith('.pdf')

    if (isHtml) {
      text = this._extractHtmlText(filePath)
    } else if (isPdf && this.textExtract) {
      try {
        text = await this.textExtract.extractText(filePath)
      } catch (err) {
        console.warn('[processor] Text extraction failed for %s: %s', path.basename(filePath), err.message)
      }
    } else {
      // Try generic text extraction
      try {
        if (this.textExtract) text = await this.textExtract.extractText(filePath)
      } catch {}
    }

    // 4. Transcribe audio/video
    let transcript = ''
    const isAudio = (contentType || '').includes('audio') || /\.(mp3|wav|ogg|flac|aac|m4a|wma)$/i.test(filePath)
    const isVideo = (contentType || '').includes('video') || /\.(mp4|webm|mov|avi|mkv|wmv|mpg|mpeg|m4v|flv)$/i.test(filePath)
    if ((isAudio || isVideo) && this.transcriber) {
      try {
        const avType = isVideo ? 'video' : 'audio'
        transcript = await this.transcriber.transcribe(filePath, avType)
        if (transcript && !text) text = transcript
      } catch (err) {
        console.warn('[processor] Transcription failed for %s: %s', path.basename(filePath), err.message)
      }
    }

    // 5. Extract metadata from HTML
    let title = ''
    let meta = {}
    if (isHtml) {
      const htmlMeta = this._extractHtmlMeta(filePath)
      title = htmlMeta.title
      meta = htmlMeta
    } else if (isVideo || isAudio) {
      title = this._titleFromUrl(fetchResult.finalUrl || urlRow.url)
    }

    // 6. Score relevance
    const url = finalUrl || urlRow.url
    const relevanceScore = this.scorer.score(text, url, {
      documentType: this._inferDocumentType(urlRow.source, contentType),
      contentType: this._inferDocumentType(urlRow.source, contentType),
      anchorText: meta.anchorText,
    })

    // Video/audio files have no extractable text, so keyword scoring is near zero.
    // If a video was discovered from a relevant page, trust the link context and
    // apply a minimum relevance floor so it doesn't get silently dropped.
    const isMedia = isVideo || isAudio
    const effectiveScore = isMedia ? Math.max(relevanceScore, 0.5) : relevanceScore

    if (effectiveScore < this.minRelevance) {
      return { skipped: true, reason: 'low relevance', score: effectiveScore }
    }

    if (this.dryRun) {
      return { dryRun: true, score: effectiveScore, title: title || url, url }
    }

    // 7. Determine file type and category
    const ext = path.extname(filePath)
    let fileType = { contentType: 'unknown', category: null }
    if (isHtml) {
      fileType = { contentType: 'html', category: SOURCE_CATEGORY_MAP[urlRow.source] || 'web_page' }
    } else if (this.fileUtils) {
      fileType = this.fileUtils.detectFileType(filePath)
    }

    // Validate PDF classification by checking file magic bytes
    if (fileType.contentType === 'pdf' || isPdf) {
      try {
        const head = Buffer.alloc(5)
        const fd = fs.openSync(filePath, 'r')
        fs.readSync(fd, head, 0, 5, 0)
        fs.closeSync(fd)
        if (head.toString('ascii') !== '%PDF-') {
          console.warn('[processor] File classified as PDF but header is %s: %s', JSON.stringify(head.toString('ascii')), path.basename(filePath))
          fileType = { contentType: 'unknown', category: null }
          isPdf = false
        }
      } catch {}
    }

    const category = SOURCE_CATEGORY_MAP[urlRow.source] || fileType.category || 'web_page'

    // 8. Copy file to content directory
    const docId = crypto.createHash('sha256').update(url + sha256).digest('hex').slice(0, 32)
    const destDir = path.join(this.contentDir, 'crawled', urlRow.source || 'generic')
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
    const destFile = path.join(destDir, `${docId}${ext}`)
    fs.copyFileSync(filePath, destFile)

    // 9. Generate thumbnail
    let thumbPath = null
    if (this.thumbnails && (isPdf || isHtml || isVideo || fileType.contentType === 'image')) {
      const thumbDest = path.join(this.thumbDir, 'crawled', `${docId}.jpg`)
      try {
        const ok = await this.thumbnails.generateThumbnail(destFile, thumbDest, fileType.contentType)
        if (ok) thumbPath = thumbDest
      } catch (err) {
        console.warn('[processor] Thumbnail failed for %s: %s', docId, err.message)
      }
    }

    // 10. Determine collection
    const collectionId = this._getCollectionId(urlRow.source)

    // For media files with no extracted text, derive searchable text from the URL
    // and title so they appear in keyword searches.
    if ((isVideo || isAudio) && !text && title) {
      text = title
    }

    // 11. Build document
    const doc = {
      id: docId,
      title: title || path.basename(filePath, ext) || url,
      file_name: path.basename(destFile),
      data_set: collectionId,
      content_type: fileType.contentType,
      category,
      file_size: fileBuffer.length,
      page_count: null,
      file_path: destFile,
      thumb_path: thumbPath,
      extracted_text: text.slice(0, 500000),
      transcript: transcript || null,
      source_url: url,
      created_at: Date.now(),
      indexed_at: effectiveScore >= this.autoIndexThreshold ? Date.now() : null,
      collection_id: collectionId,
      sha256_hash: sha256,
      image_keywords: null,
    }

    // 12. Insert into documents DB
    this.docsDb.insert(doc)

    // 13. Index in Meilisearch if above auto-index threshold
    if (effectiveScore >= this.autoIndexThreshold && this.searchIndex) {
      try {
        await this.searchIndex.addDocuments([doc])
      } catch (err) {
        console.warn('[processor] Search indexing failed for %s: %s', docId, err.message)
      }
    }

    // 14. Generate embedding
    if (this.embedder) {
      try {
        const embText = [doc.title, text, transcript].filter(Boolean).join('\n\n')
        if (embText.length >= 20) {
          const emb = await this.embedder.embed(embText)
          if (emb) {
            this.docsDb.setEmbedding(docId, this.embedder.toBuffer(emb))
          }
        }
      } catch (err) {
        console.warn('[processor] Embedding failed for %s: %s', docId, err.message)
      }
    }

    // 15. Extract entities, relationships, and financial transactions via Ollama
    if (entityExtractor) {
      try {
        const ollamaReady = await entityExtractor.checkOllama()
        if (ollamaReady) {
          const allText = [text, transcript].filter(Boolean).join('\n\n')
          if (allText.trim().length >= 20) {
            const extraction = await entityExtractor.extractEntitiesAndFinancials(allText)
            entityExtractor.storeExtractionResults(this.docsDb, docId, extraction)
          }
        }
      } catch (err) {
        console.warn('[processor] Entity extraction failed for %s: %s', docId, err.message)
      }
    }

    // 16. Extract image keywords
    if (this.imageKeywords && fileType.contentType === 'image') {
      try {
        const keywords = await this.imageKeywords.extractKeywords(destFile)
        if (keywords) {
          this.docsDb.setImageKeywords(docId, keywords)
          doc.image_keywords = keywords
        }
      } catch (err) {
        console.warn('[processor] Image keywords failed for %s: %s', docId, err.message)
      }
    }

    return {
      indexed: true,
      id: docId,
      title: doc.title,
      score: effectiveScore,
      url,
      category,
      collection: collectionId,
    }
  }

  _extractHtmlText (filePath) {
    try {
      const html = fs.readFileSync(filePath, 'utf8')
      const $ = cheerio.load(html)

      // Remove non-content elements
      $('script, style, nav, header, footer, aside, .sidebar, .ad, .advertisement, .social-share').remove()

      // Try article body first
      let text = ''
      const article = $('article, [role="main"], .article-body, .story-body, .entry-content, .post-content, main')
      if (article.length) {
        text = article.text()
      } else {
        text = $('body').text()
      }

      // Clean up whitespace
      return text.replace(/\s+/g, ' ').trim()
    } catch {
      return ''
    }
  }

  _extractHtmlMeta (filePath) {
    try {
      const html = fs.readFileSync(filePath, 'utf8')
      const $ = cheerio.load(html)

      return {
        title: $('meta[property="og:title"]').attr('content') ||
               $('title').text().trim() ||
               $('h1').first().text().trim() || '',
        description: $('meta[name="description"]').attr('content') ||
                     $('meta[property="og:description"]').attr('content') || '',
        author: $('meta[name="author"]').attr('content') ||
                $('[rel="author"]').text().trim() || '',
        publishedDate: $('meta[property="article:published_time"]').attr('content') ||
                       $('time[datetime]').first().attr('datetime') || '',
      }
    } catch {
      return { title: '', description: '', author: '', publishedDate: '' }
    }
  }

  _inferDocumentType (source, contentType) {
    if (source === 'court') return 'court_filing'
    if (source === 'government') return 'government_report'
    if (source === 'news') return 'news_article'
    if ((contentType || '').includes('pdf')) return 'court_filing'
    return 'web_page'
  }

  _titleFromUrl (urlStr) {
    try {
      const u = new URL(urlStr)
      // Use the last meaningful path segment as the title base
      const segments = u.pathname.split('/').filter(Boolean)
      let raw = segments[segments.length - 1] || ''
      // Strip file extension
      raw = raw.replace(/\.[^.]+$/, '')
      // Decode URI components
      raw = decodeURIComponent(raw)
      // Replace underscores, hyphens, camelCase boundaries with spaces
      raw = raw.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
      // Strip resolution/codec suffixes (e.g. "AVC_1920x1080", "512kb", "hq")
      raw = raw.replace(/\b(AVC|avc)\s*\d+x\d+\b/g, '').replace(/\b\d+kb?\b/gi, '').replace(/\b(hq|lq|sd|hd)\b/gi, '')
      // Collapse whitespace
      raw = raw.replace(/\s+/g, ' ').trim()
      if (raw.length < 3) return ''
      // Capitalize first letter
      return raw.charAt(0).toUpperCase() + raw.slice(1)
    } catch {
      return ''
    }
  }

  _getCollectionId (source) {
    const map = {
      court: 2001,
      news: 2002,
      government: 2003,
      'archive-org': 2004,
      'search-discovery': 2005,
      generic: 2005,
    }
    return map[source] || 2005
  }
}

module.exports = ContentProcessor
