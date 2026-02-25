/**
 * Meilisearch integration for full-text search over Epstein archive documents.
 */
const { MeiliSearch } = require('meilisearch')

const INDEX_NAME = 'documents'

class SearchIndex {
  constructor (options = {}) {
    const host = options.host || process.env.MEILI_HOST || 'http://localhost:7700'
    const apiKey = options.apiKey || process.env.MEILI_API_KEY || ''

    this.client = new MeiliSearch({ host, apiKey })
    this.indexName = INDEX_NAME
  }

  async setup () {
    const index = this.client.index(this.indexName)

    await index.updateSettings({
      searchableAttributes: [
        'title',
        'fileName',
        'extractedText',
        'transcript'
      ],
      filterableAttributes: [
        'dataSet',
        'contentType',
        'category'
      ],
      sortableAttributes: [
        'dataSet',
        'fileSize',
        'createdAt'
      ],
      rankingRules: [
        'words',
        'typo',
        'proximity',
        'attribute',
        'sort',
        'exactness'
      ],
      displayedAttributes: [
        'id', 'title', 'fileName', 'dataSet', 'contentType', 'category',
        'fileSize', 'pageCount', 'driveKey', 'fileKey', 'sourceUrl',
        'createdAt', 'indexedAt', 'hasContent', 'hasThumbnail'
      ],
      faceting: {
        maxValuesPerFacet: 100
      },
      pagination: {
        maxTotalHits: 100000
      },
      typoTolerance: {
        enabled: true,
        minWordSizeForTypos: {
          oneTypo: 4,
          twoTypos: 8
        }
      }
    })

    console.log('[search] Meilisearch index configured')
    return index
  }

  async addDocuments (docs) {
    const index = this.client.index(this.indexName)
    const formatted = docs.map(doc => ({
      id: doc.id,
      title: doc.title,
      fileName: doc.file_name || doc.fileName,
      dataSet: doc.data_set || doc.dataSet,
      contentType: doc.content_type || doc.contentType,
      category: doc.category || null,
      fileSize: doc.file_size || doc.fileSize || 0,
      pageCount: doc.page_count || doc.pageCount || null,
      driveKey: doc.drive_key || doc.driveKey || null,
      fileKey: doc.file_key || doc.fileKey || null,
      sourceUrl: doc.source_url || doc.sourceUrl || null,
      createdAt: doc.created_at || doc.createdAt || 0,
      indexedAt: Date.now(),
      extractedText: (doc.extracted_text || doc.extractedText || '').slice(0, 100000),
      transcript: (doc.transcript || '').slice(0, 100000),
      hasContent: !!(doc.file_path || doc.filePath),
      hasThumbnail: !!(doc.thumb_path || doc.thumbPath)
    }))

    const task = await index.addDocuments(formatted, { primaryKey: 'id' })
    return task
  }

  async search (query, options = {}) {
    const index = this.client.index(this.indexName)

    const searchParams = {
      limit: options.limit || 40,
      offset: options.offset || 0,
      attributesToHighlight: ['title', 'extractedText'],
      highlightPreTag: '<mark>',
      highlightPostTag: '</mark>',
      attributesToCrop: ['extractedText'],
      cropLength: 200,
      facets: ['dataSet', 'contentType', 'category'],
      showRankingScore: false,
    }

    if (options.filter) {
      searchParams.filter = options.filter
    }

    if (options.sort) {
      searchParams.sort = options.sort
    }

    const result = await index.search(query, searchParams)

    return {
      hits: result.hits.map(hit => ({
        id: hit.id,
        title: hit.title,
        fileName: hit.fileName,
        dataSet: hit.dataSet,
        contentType: hit.contentType,
        category: hit.category,
        fileSize: hit.fileSize,
        pageCount: hit.pageCount,
        driveKey: hit.driveKey,
        fileKey: hit.fileKey,
        sourceUrl: hit.sourceUrl,
        createdAt: hit.createdAt,
        indexedAt: hit.indexedAt,
        hasContent: hit.hasContent,
        hasThumbnail: hit.hasThumbnail,
        _highlight: hit._formatted
      })),
      query: result.query,
      processingTimeMs: result.processingTimeMs,
      estimatedTotalHits: result.estimatedTotalHits || 0,
      facetDistribution: result.facetDistribution
    }
  }

  async getStats () {
    const index = this.client.index(this.indexName)
    return index.getStats()
  }

  async deleteAll () {
    const index = this.client.index(this.indexName)
    return index.deleteAllDocuments()
  }
}

module.exports = SearchIndex
