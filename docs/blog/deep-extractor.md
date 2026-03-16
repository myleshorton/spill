# Unredacting 1.44 Million Documents: What We Found Behind the Black Bars

## The Discovery

It started with a single document. EFTA00143287 is a 118-page PDF from the Epstein archive that, when you open it, looks like a wall of redacted garbage — heavy black bars over most of the content, fragments of raw HTML source code printed on the pages, garbled OCR text everywhere.

But someone noticed that the PDF's text layer — the invisible data that sits behind the visual content — contained far more than what was visible on the pages. Behind those black redaction bars, the full text of an email conversation was preserved. The redaction covered the visual rendering, but nobody had stripped the underlying text data.

The email thread spanned October 2024 to January 2025, referenced dozens of named individuals, and contained detailed allegations about JP Morgan litigation and the Epstein trafficking network. None of it was visible when viewing the PDF. All of it was sitting in the text layer, waiting to be read.

This raised an obvious question: how many of the other 1.44 million documents in the archive have content hiding behind redaction bars?

## Phase 1: Finding the Needles (5.6 Minutes, No AI)

We needed to scan all 1.44 million documents, but running an LLM on each one would cost thousands of dollars and take days. Instead, we built a heuristic triage scanner — pure regex and arithmetic, no AI — that scores every document's "extraction potential."

Eight signals, each worth a point value:

| Signal | Points | What It Detects |
|---|---|---|
| HTML tags in extracted text | +25 | Raw email source code embedded in text layer |
| Email headers | +20 | `From:`, `To:`, `Subject:` patterns |
| High file-size-to-text ratio | +15 | Large file, suspiciously little text |
| Multi-page with short text | +10 | 10+ pages but only a few KB of text |
| Embedded image references | +10 | `cid:`, `data:image` inline attachments |
| Known email filename pattern | +10 | `EFTA*`, `MAIL*` prefixes |
| Attachment references | +5 | Mentions of attachments |
| Very long text (100K+) | +5 | Likely bundled email threads |

The triage scanner processed all 1,435,616 documents in 5.6 minutes. Results:

- **1,428,065 documents** had at least one signal firing (99.5%)
- Score distribution peaked heavily at 30-39 (over a million documents — mostly DS9 emails with email headers and attachment references)
- Only **6,487 documents** scored 50+ (the interesting ones)

The first surprise: nearly every document in the archive triggers at least one heuristic. That's too many. We needed a better filter.

## The Hidden Content Signal

Scoring high on heuristics doesn't mean content is actually hidden. Most of the flagged documents were ordinary email PDFs where the email headers are clearly visible when viewing the file. We needed to distinguish between "has email content" and "has email content *that you can't see*."

We added a new detection: **hidden HTML content**. If a document's text layer is more than 30% HTML source code by character count, with more than 20KB of text, then the text layer likely contains raw email HTML that isn't visible in the rendered PDF. This flagged **1,641 documents**.

But even 1,641 was too many. When we ran deep extraction on all of them and spot-checked the results, many were false positives — the raw email source code WAS visible on the pages. The PDF showed the HTML source as printed text, and our text extraction just picked up what was already readable.

## Detecting Actual Redactions

The key difference between EFTA00143287 (truly hidden) and the false positives was physical: EFTA00143287 had heavy black redaction bars covering the content on the page images. The false positives didn't.

We built a pixel-level redaction detector. For each PDF, we render a few sample pages, scan the page images for long horizontal runs of dark pixels (redaction bars), and count them:

- **EFTA00143287** (hidden content): 107 dark runs on page 1, average 35.7 across sampled pages
- **EFTA02715081** (visible content): 9 dark runs on page 1, average 2.0 across sampled pages

The threshold: if a document averages more than 15 dark runs per sampled page, it has redaction bars — and therefore likely has content behind them that the text layer preserves.

This reduced our extraction set from 1,641 to **686 documents** — the ones where redaction bars are actually hiding text.

## What We Tried That Failed

### Attempt 1: LLM Text Cleanup (Hallucination Disaster)

Our original plan was to use Groq (Llama 3.3 70B) to clean up the garbled OCR text. The raw text from behind redactions is messy — names are mangled, HTML artifacts are fused with words, formatting is broken.

We sent chunks of text to Groq with a prompt asking it to "clean up this OCR text, fix garbled names, remove HTML artifacts." It worked beautifully on test cases. Then we spot-checked the results.

One document — EFTA02715081, an email from Barbro Ehnbom to Jeffrey Epstein's gmail account forwarding a CV and photos — came back with the cleaned text containing a multi-email thread between **Keir Starmer** and **Rebecca Long-Bailey** about **Brexit strategy**, followed by **Emily Thornberry** asking to join a meeting.

None of these people appeared anywhere in the original document. The LLM had wholesale fabricated an entirely plausible-looking email conversation and inserted it into the extracted text. The original document was about someone sending Epstein photos of a young woman, and the "cleaned" version was about UK Labour Party politics.

We verified: zero mentions of "Starmer" in the original text. The LLM hallucinated the entire thing.

We immediately removed all LLM text cleanup. The garbled OCR text is messy, but at least it's real. We now only use Groq for structured metadata extraction (summary, people mentioned, document classification) where the outputs are clearly labeled as AI-generated and don't replace the source text.

**Lesson: Never let an LLM rewrite source documents in an archive. Summaries and metadata are fine. Replacing the actual text is not.**

### Attempt 2: PDF Generation with fpdf2 (Silently Blank Pages)

We originally generated formatted PDFs from the extracted text using fpdf2 (a Python PDF library) with DejaVu Unicode fonts. The PDFs looked right — correct page counts, proper file sizes, title pages rendered correctly.

But every page after page 1 was blank.

We spent considerable time debugging. Each line rendered correctly when tested individually. The font existed and supported the characters. No errors were thrown. But when all lines were combined into a single document, pages 2-164 were empty — both visually and when extracting text back out with PyMuPDF.

We tested with Helvetica instead of DejaVu — same result. We tested with PyMuPDF's own PDF generation — also blank. The issue appears to be a deep fpdf2 bug where `multi_cell()` silently stops rendering after a certain amount of Unicode text content.

We solved this by abandoning PDF generation entirely. The extracted text is now stored as plain `.txt` files. The document viewer renders them in an iframe. It's less pretty, but it actually works.

**Lesson: Test generated documents by extracting their content back out, not just by checking file size and page count.**

### Attempt 3: HTML Percentage as Hidden Content Signal (Too Many False Positives)

Our first hidden content heuristic — text layer is >30% HTML with >20KB text — flagged 1,641 documents. But many of these were PDFs where the raw email source code was printed visually on the pages as text. The content wasn't hidden; it was just ugly.

For example, EFTA02715081 is a 58-page PDF where every page is a full-page scan showing raw email headers and HTML source code. The text layer matches what's on the page. Nothing is hidden. But it scored high on our HTML percentage heuristic because the text layer was full of HTML.

The fix was adding the pixel-level redaction bar detector. If the page images don't have black bars, the content isn't hidden — it's just a document that happens to contain HTML source code as its visible content.

**Lesson: "Contains HTML" and "has hidden content behind redactions" are very different things. You need to check the visual rendering, not just the text layer.**

## What Actually Works

The final pipeline:

1. **Heuristic triage** (5.6 min, all 1.44M docs, no LLM) — scores documents with 8 regex-based signals
2. **Hidden content detection** — flags documents where >30% of text layer is HTML with >20KB text
3. **Redaction bar detection** — renders sample pages, counts dark pixel runs, skips documents where content is already visible
4. **Filename deduplication** — skips documents that share a filename with one already extracted (handles re-uploads)
5. **PyMuPDF text extraction** — extracts the full text layer content
6. **Deep programmatic cleanup** — strips HTML tags, MIME headers, base64 data, image filename clusters, and lines with too many non-word characters
7. **Groq metadata extraction** — one API call per document for summary, people mentioned, document type classification (clearly labeled as AI-generated, never replaces source text)
8. **Store as .txt** — saves cleaned text as a plain text file, creates bidirectional links between extraction and source, stores structured metadata

The result: **686 documents** with genuinely hidden content extracted from behind redaction bars. Each extraction is linked to its source document, searchable, and annotated with AI-generated metadata.

## The Extracted Text Is Still Messy

We should be honest: the extracted text from behind redaction bars is not clean. It looks like this:

```
Sabin HATERHAL EMAIL] SOS mum EMERGENCY, KEIR SURMA IT RADAR Elan
MUMS HOUSE OTT RUTIN AND XI HUNGER GAMES UN KEW HEAD:WARIER:5 ATE =III

If I WU ONE EVEN CM CONVLISMION HAS BEEN IIAD ADOOT ME. WITHOW MY
KNOWLEDGE OR WITHOUT AN ATTORNEY AND Of3f11ONS HAVE BEEN MADE ON MY
WHALE WITHOUT MY KNOWLEDGE OR AN ATTORNEY PRESENT I WIU. SUE EACH OF YOU

PLEASE CAN SOMEONE ASK

KAPUT. TORCHED PHYSICALLY AND MENTALLY AND NOT INE PERSON HAS OFFERED
THE LEAST YOU COULD HAVE COIM IS MD ESPECIALLY AFTER OVERA YEAR OF
BEGGING AND PLEADING EVIDENCE TO RACY M ALL MY ALLEGATIONS?
```

The readable parts are there — someone threatening to sue, references to being torched physically and mentally, accusations of intimidation. But they're interspersed with OCR artifacts, garbled characters, and noise from the redaction process. The OCR engine tried to read through the black bars and captured fragments of the text underneath, mixed with the visual noise of the bars themselves.

We can't clean this up further without an LLM, and we learned the hard way that LLMs hallucinate replacement content when given garbled input. The messy-but-real text is more valuable than clean-but-fabricated text.

The content is still searchable. Keywords like "attorney," "sue," "allegations," "evidence" all work. Entity extraction picks up the names. The metadata summary provides a readable overview. The raw text is there for anyone who wants to read it carefully.

## The Numbers

| Metric | Value |
|---|---|
| Documents scanned | 1,435,616 |
| Triage time | 5.6 minutes |
| Documents with hidden HTML content | 1,641 |
| Documents with actual redaction bars | 686 |
| Extraction time (686 docs) | ~6 minutes |
| Success rate | 100% |
| LLM cost (Groq, metadata only) | ~$2 |
| Total pipeline time | ~12 minutes |

## What's Next

The 686 extracted documents are the high-confidence set — documents where we can prove content was hidden behind redaction bars. There may be other types of hidden content we're not detecting yet:

- **Embedded file attachments** within PDFs that aren't rendered
- **Metadata fields** with information not shown in the document body
- **Invisible text layers** placed outside the visible page area
- **White-on-white text** or other visual hiding techniques

Each would need its own detection heuristic. The pipeline is designed to be extensible — add a new check to `extract-pdf-gen.py`, add a flag to the triage scanner, and the deep extractor will pick it up.

## Technical Stack

- **PyMuPDF (fitz)** — PDF text extraction, page rendering, image extraction, redaction detection
- **Node.js + better-sqlite3** — pipeline orchestration, document database, metadata storage
- **Groq (Llama 3.3 70B)** — metadata extraction only (summary, people, classification)
- **p-limit** — concurrency control for parallel processing
- **fpdf2** — we tried it for PDF generation; it didn't work (see "What We Tried That Failed")

The entire pipeline runs on a single server. No GPU required. No expensive AI APIs for the core extraction. The only LLM spend is one Groq call per document for metadata, which costs fractions of a cent per document.
