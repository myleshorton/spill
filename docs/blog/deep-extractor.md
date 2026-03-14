# Mining 1.44 Million Documents: How We Built a Deep Document Extractor

## The Discovery

While investigating the Spill Archive — a collection of 1.44 million documents, 96% of them PDFs — we stumbled on something interesting. A single 118-page PDF (EFTA00143287) looked like garbage at first glance: walls of raw HTML source code, mangled OCR text, broken formatting. Our standard text extraction pipeline captured it as noise.

But buried inside that noise was a complete email conversation spanning October 2024 to January 2025, with dozens of named individuals, detailed allegations, and a reconstructable chronological thread. The existing pipeline had missed all of it.

This raised an obvious question: how many of the other 1.44 million documents contain similarly hidden structure that our extraction is missing?

## The Problem

Standard PDF text extraction (what most document pipelines do) treats every page as a flat block of text. But real-world documents are messy:

- **Email threads rendered as HTML inside PDFs** — the raw `<div>`, `<blockquote>`, `From:` / `To:` headers are all there, but extraction flattens them into unreadable noise
- **OCR-garbled text** — names, dates, and key terms mangled beyond keyword search
- **Embedded metadata** — structured data hiding in document properties that never surfaces in search
- **Structured tables** — financial records and spreadsheets that lose all formatting when extracted as plain text

The EFTA00143287 case proved that ~90% of the extraction work is programmatic (PDF parsing, HTML stripping, regex-based header extraction, thread reconstruction) and only ~10% needs an LLM (cleaning up garbled names, classifying document type, generating summaries).

## The Design: Two Phases

We designed a two-phase pipeline that separates cheap heuristic scoring from expensive deep extraction.

### Phase 1: Triage (No LLM, 5-15 Minutes for All 1.44M Docs)

Every document gets a score based on eight heuristic signals:

| Signal | Points | What It Detects |
|---|---|---|
| HTML tags in text | +25 | Email source code trapped inside PDFs |
| Email headers | +20 | `From:`, `To:`, `Subject:` patterns indicating email content |
| High file-size-to-text ratio | +15 | Large files with suspiciously little extracted text — something's being missed |
| Multi-page, short text | +10 | Many pages but only a few KB of text — likely images or hidden content |
| Embedded image references | +10 | `cid:`, `data:image` — inline email attachments |
| Known email filename patterns | +10 | Files matching `EFTA*`, `MAIL*`, and other email-indicating patterns |
| Attachment references | +5 | Mentions of attachments that weren't extracted |
| Very long text (100K+) | +5 | Likely multi-thread email bundles |

No LLM. No API calls. Pure regex and arithmetic. This scores all 1.44 million documents in minutes and produces a ranked list of extraction candidates.

### Phase 2: Deep Extraction (LLM-Assisted, Score-Ordered)

Documents scoring above the threshold (default: 20) get processed in order, highest score first. Each document runs through a six-step pipeline:

1. **Load raw file** — PyMuPDF for PDFs, direct read for HTML/text
2. **Detect content type** — Is this an HTML email dump? An email thread? A structured table?
3. **Programmatic parse** — Strip HTML, extract email headers, identify message boundaries, reconstruct chronological thread order, extract attachment references. No LLM needed for any of this.
4. **LLM cleanup** — A single Groq API call per document handles four tasks at once: clean garbled OCR, identify people and organizations from mangled names, classify the document type, and generate a 2-3 sentence summary. Using Llama 3.3 70B via Groq keeps this fast and cheap.
5. **Generate output PDF** — Clean, formatted PDF with title page, properly structured content, and page numbers. Using fpdf2 with Unicode font support.
6. **Store and link** — The extracted document gets its own record in the archive, bidirectionally linked to the original. Structured metadata (senders, recipients, date ranges, people mentioned) is stored separately and feeds into entity scanning.

### Why Two Phases?

Cost. Running an LLM on 1.44 million documents would be expensive and slow. But running regex heuristics on 1.44 million documents is essentially free. We expect maybe 60-100K documents to score above threshold — and at Groq's pricing with Llama 3.3 70B, processing all of those costs roughly $10-30 total.

The triage phase also lets us calibrate. After scoring everything, we can look at the score distribution and adjust the threshold before committing to any LLM spend.

## The Architecture

```
Phase 1: Triage                    Phase 2: Deep Extraction
┌─────────────────┐                ┌─────────────────────────┐
│  1.44M documents │               │  Flagged docs (by score) │
│  ──────────────  │               │  ───────────────────────  │
│  8 heuristics    │──score > 20──▶│  PyMuPDF parse           │
│  No LLM          │               │  Regex extraction        │
│  ~10 min          │               │  Groq LLM cleanup        │
│  extraction_triage│               │  PDF generation          │
│  table            │               │  Link + index            │
└─────────────────┘                └─────────────────────────┘
```

Both phases integrate into the existing ingest pipeline. New documents get triaged and (if they score high enough) deep-extracted automatically as they're ingested.

## LLM Usage: Minimal by Design

We deliberately minimize LLM involvement. Here's what does and doesn't use an LLM:

| Step | LLM? |
|---|---|
| Triage scoring | No |
| HTML stripping | No |
| Email header parsing | No |
| Thread reconstruction | No |
| OCR cleanup | Yes (Groq) |
| Name identification | Yes (Groq) |
| Document classification | Yes (Groq) |
| Summary generation | Yes (Groq) |
| PDF generation | No |

The four LLM tasks are combined into a single API call per document. Input is the first ~6K characters of the *programmatically parsed* content (not the raw OCR garbage), which means the LLM gets clean-ish input and only needs to handle the parts that are genuinely ambiguous.

## What We Extract

For each processed document, we store structured metadata:

- **Extraction type** — email_thread, embedded_html, metadata_rich, structured_table
- **Email details** — count of emails, senders, recipients, date range
- **People mentioned** — feeds into the existing entity scanning system
- **Summary** — 2-3 sentence description of the document's actual content
- **Confidence score** — how reliable the extraction was

This metadata makes previously opaque documents searchable, browsable, and connected to the rest of the archive through entity relationships.

## Backfill Strategy

1. Run triage across all 1.44M documents (~10 minutes, no LLM, no cost)
2. Review score distribution to calibrate the threshold
3. Process flagged documents in score order (highest potential first, across all datasets)
4. The DS9 dataset (emails, 560K documents) is expected to dominate the flagged set

## The Lesson from EFTA00143287

The key insight from our initial manual extraction was this: most of the valuable work is parsing, not AI. PyMuPDF, regex, and HTML stripping did 90% of the heavy lifting. The LLM was only needed for the genuinely ambiguous parts — garbled names, document classification, and summarization.

That's why we designed the pipeline this way. Cheap heuristics to find the needles, programmatic tools to do the heavy extraction, and a single targeted LLM call to clean up what the tools can't handle. At scale, this means processing over a million documents for the cost of a few coffees.
