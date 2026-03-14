# Deep Document Extractor — Design

## Problem

The archive contains 1.44M documents. 96% are PDFs. Many contain hidden structure the current text extraction misses — email threads rendered as HTML inside PDFs, embedded metadata, structured tables, and content garbled by OCR. The EFTA00143287 case demonstrated that a 118-page PDF of raw HTML email source contained a full reconstructable email conversation spanning Oct 2024 – Jan 2025 with dozens of named individuals, but the existing pipeline only captured noisy OCR text.

## Solution

A two-phase pipeline: a fast heuristic triage that scores every document's extraction potential, followed by a deep extraction pass that processes flagged documents in score order.

## Architecture: Two-Phase Pipeline

### Phase 1: Triage Scanner (`triage-scan.js`)

Scores every document's extraction potential using heuristics. No LLM. Expected runtime: 5-15 minutes for 1.44M docs.

#### Heuristic Signals

| Signal | Points | Detection |
|---|---|---|
| HTML tags in extracted text | +25 | Regex for `<div`, `<br`, `<table`, `<blockquote` |
| Email headers in text | +20 | Regex for `From:`, `To:`, `Subject:`, `Date:` patterns |
| High file-size-to-text ratio | +15 | fileSize > 500KB but extractedText < 2KB |
| Multi-page with short text | +10 | pageCount > 10 but text < 5KB |
| Embedded image references | +10 | `cid:`, `data:image`, `<img` in text |
| Known email filename pattern | +10 | `EFTA*`, `MAIL*`, DS9 patterns |
| Attachment references | +5 | `attachment`, inline filenames |
| Very long text (100K+) | +5 | Likely multi-thread email bundle |

#### Storage: `extraction_triage` table

```sql
CREATE TABLE extraction_triage (
  document_id TEXT PRIMARY KEY,
  score INTEGER,
  flags TEXT,        -- JSON: which signals fired
  triaged_at INTEGER,
  FOREIGN KEY (document_id) REFERENCES documents(id)
);
```

Execution: reads documents in batches of 1000, scores in-memory, writes results.

### Phase 2: Deep Extractor (`deep-extract.js`)

Processes triaged documents in score order (highest first). Minimum score threshold: 20 (configurable).

#### Pipeline per Document

1. **Load raw file** — PyMuPDF for PDFs, direct read for HTML/text
2. **Detect content type** — HTML email source, email thread, embedded metadata, structured tables
3. **Programmatic parse** (no LLM):
   - Strip HTML tags
   - Extract email headers (From, To, Cc, Date, Subject)
   - Identify message boundaries
   - Reconstruct chronological thread order
   - Extract referenced attachments/images
4. **Groq LLM pass** (single call per document):
   - Clean up garbled OCR
   - Identify people/orgs from mangled names
   - Classify document type
   - Generate 2-3 sentence summary
5. **Generate output PDF** — fpdf2 with title page, formatted content, page numbers
6. **Store results**:
   - Insert new document record (content_type: pdf)
   - Create bidirectional `document_links` (extraction <-> source)
   - Store structured metadata in `extraction_metadata`
   - Set `deep_extract_attempted = 1` on original document
   - Index new document in Meilisearch

#### Concurrency

p-limit with 5 parallel extractions. Groq calls rate-limited separately.

#### Skip Logic

Documents with `deep_extract_attempted = 1` are skipped.

#### Ingest Integration

After the existing text extraction step, check triage score and run deep extraction inline:

```js
if (triageScore(doc) >= MIN_SCORE) {
  await deepExtract(doc)
}
```

## Groq LLM Usage

All LLM tasks combined into a single prompt per document:

- Clean up garbled OCR text
- Identify people, organizations, locations
- Classify document type (email_thread, embedded_html, metadata_rich, structured_table)
- Generate 2-3 sentence summary

Response format: JSON.

Model: Groq with llama-3.3-70b (or current fast model).

Input: first ~6K chars of programmatically-parsed content (not raw OCR).

Estimated cost: ~60-100K flagged documents at ~$10-30 total.

| Step | LLM? |
|---|---|
| Triage scoring | No |
| HTML stripping | No |
| Email header parsing | No |
| Thread reconstruction | No |
| OCR degarbling | Yes (Groq) |
| Name identification | Yes (Groq) |
| Document classification | Yes (Groq) |
| Summary generation | Yes (Groq) |
| PDF generation | No |

## Structured Metadata

### `extraction_metadata` table

```sql
CREATE TABLE extraction_metadata (
  document_id TEXT PRIMARY KEY,
  extracted_doc_id TEXT,
  extraction_type TEXT,
  email_count INTEGER,
  senders TEXT,           -- JSON array
  recipients TEXT,        -- JSON array
  date_range_start TEXT,  -- ISO date
  date_range_end TEXT,    -- ISO date
  people_mentioned TEXT,  -- JSON array
  summary TEXT,
  confidence REAL,        -- 0.0-1.0
  extracted_at INTEGER,
  FOREIGN KEY (document_id) REFERENCES documents(id),
  FOREIGN KEY (extracted_doc_id) REFERENCES documents(id)
);
```

Separate table (not columns on `documents`) because only flagged documents get extracted.

After extraction, `people_mentioned` feeds into the existing entity scanner.

## DB Migrations (in `documents-db.js` `_migrate()`)

- `deep_extract_attempted INTEGER DEFAULT 0` column on `documents`
- `extraction_triage` table
- `extraction_metadata` table

## File Structure

```
ingest/
  triage-scan.js              # Phase 1: heuristic scoring
  deep-extract.js             # Phase 2: extraction pipeline
  lib/
    triage-heuristics.js      # Scoring functions
    deep-extractor.js         # Core extraction logic (PyMuPDF, regex)
    extract-pdf-gen.py        # Python: PyMuPDF text extraction + fpdf2 PDF generation
    extract-groq.js           # Groq LLM calls
    extract-metadata.js       # Metadata storage/retrieval
```

Python script called from Node via `execFile` (not exec, to avoid shell injection).

## Backfill Strategy

1. Run triage across all 1.44M documents (5-15 min, no LLM)
2. Review score distribution to calibrate threshold
3. Process flagged documents in score order (highest first, across all datasets)
4. DS9 (emails, 560K docs) expected to dominate the flagged set

## Existing Infrastructure Leveraged

- `document_links` table (already exists, used for EFTA00143287 extraction)
- `*_scan_attempted` flag pattern (entity, financial, image scans)
- p-limit concurrency pattern from existing scanners
- Meilisearch indexing for new documents
- Groq backend already configured in entity-extractor.js
