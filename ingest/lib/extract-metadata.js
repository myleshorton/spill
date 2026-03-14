'use strict'

function storeExtractionMetadata (db, sourceDocId, extractedDocId, groqResult, extractionType) {
  db.insertExtractionMetadata({
    documentId: sourceDocId,
    extractedDocId,
    extractionType: groqResult?.document_type || extractionType || 'unknown',
    emailCount: groqResult?.email_count || 0,
    senders: groqResult?.senders || [],
    recipients: groqResult?.recipients || [],
    dateRangeStart: groqResult?.date_range_start || null,
    dateRangeEnd: groqResult?.date_range_end || null,
    peopleMentioned: [...(groqResult?.people || []), ...(groqResult?.organizations || [])],
    summary: groqResult?.summary || null,
    confidence: groqResult?.confidence || 0
  })
}

function getExtractionMetadata (db, docId) {
  return db.db.prepare('SELECT * FROM extraction_metadata WHERE document_id = ? OR extracted_doc_id = ?').get(docId, docId)
}

module.exports = { storeExtractionMetadata, getExtractionMetadata }
