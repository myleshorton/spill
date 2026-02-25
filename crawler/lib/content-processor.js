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

class ContentProcessor {
  constructor ({ docsDb, searchIndex, relevanceScorer, textExtract, thumbnails, fileUtils, transcriber, embedder, options = {} }) {
    this.docsDb = docsDb
    this.searchIndex = searchIndex
    this.scorer = relevanceScorer
    this.textExtract = textExtract
    this.thumbnails = thumbnails
    this.fileUtils = fileUtils
    this.transcriber = transcriber
    this.embedder = embedder
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
    const isPdf = (contentType || '').includes('pdf') || filePath.endsWith('.pdf')

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
    const isAudio = (contentType || '').includes('audio')
    const isVideo = (contentType || '').includes('video')
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
    }

    // 6. Score relevance
    const url = finalUrl || urlRow.url
    const relevanceScore = this.scorer.score(text, url, {
      documentType: this._inferDocumentType(urlRow.source, contentType),
      contentType: this._inferDocumentType(urlRow.source, contentType),
      anchorText: meta.anchorText,
    })

    if (relevanceScore < this.minRelevance) {
      return { skipped: true, reason: 'low relevance', score: relevanceScore }
    }

    if (this.dryRun) {
      return { dryRun: true, score: relevanceScore, title: title || url, url }
    }

    // 7. Determine file type and category
    const ext = path.extname(filePath)
    let fileType = { contentType: 'pdf', category: null }
    if (isHtml) {
      fileType = { contentType: 'html', category: SOURCE_CATEGORY_MAP[urlRow.source] || 'web_page' }
    } else if (this.fileUtils) {
      fileType = this.fileUtils.detectFileType(filePath)
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
    if (this.thumbnails && (isPdf || fileType.contentType === 'image')) {
      const thumbDest = path.join(this.thumbDir, 'crawled', `${docId}.jpg`)
      try {
        const ok = await this.thumbnails.generateThumbnail(filePath, thumbDest, fileType.contentType)
        if (ok) thumbPath = thumbDest
      } catch {}
    }

    // 10. Determine collection
    const collectionId = this._getCollectionId(urlRow.source)

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
      indexed_at: relevanceScore >= this.autoIndexThreshold ? Date.now() : null,
      collection_id: collectionId,
      sha256_hash: sha256,
    }

    // 12. Insert into documents DB
    this.docsDb.insert(doc)

    // 13. Index in Meilisearch if above auto-index threshold
    if (relevanceScore >= this.autoIndexThreshold && this.searchIndex) {
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

    return {
      indexed: true,
      id: docId,
      title: doc.title,
      score: relevanceScore,
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
