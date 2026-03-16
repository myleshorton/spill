# We Found Hidden Text Behind the Redaction Bars in 686 Epstein Documents

One document changed everything. EFTA00143287 — 118 pages, looks like total garbage when you open it. Black bars everywhere, raw HTML source code printed across the pages, OCR text that reads like someone fell asleep on a keyboard.

But the PDF's text layer told a different story. Under those black bars, the full text of an email thread was sitting there untouched. Whoever did the redaction blacked out the visual content but forgot to strip the text data underneath. The thread ran from October 2024 to January 2025, named dozens of people, and made detailed allegations about JP Morgan and the Epstein trafficking network. None of it shows up when you view the PDF. All of it was right there in the data.

So: how many of the other 1.44 million documents in the archive have the same problem?

## Scanning 1.44 Million Documents in 5 Minutes

We couldn't afford to run AI on every file. Instead we wrote a scoring script — eight regex checks, no AI, no API calls. Things like: does the text layer contain HTML tags? Are there email headers? Is the file huge but the extracted text tiny?

It ran through all 1,435,616 documents in 5.6 minutes. Almost every document triggered something — 99.5% scored above zero. A million of them landed in the 30-39 point range, mostly because they're email PDFs that naturally have `From:` and `To:` headers. Useless for our purposes.

Only 6,487 scored above 50. That's where things got interesting.

## Three Wrong Turns

### Wrong Turn 1: "Just use AI to clean up the text"

The text behind redactions is rough. Names are garbled, HTML is fused with words, half the characters are noise. Obvious idea: send it through an LLM to clean it up.

We used Groq with Llama 3.3 70B. Prompt: clean up this OCR text, fix names, remove artifacts. It looked great in testing.

Then we checked the output for a document that was actually an email from someone named Barbro Ehnbom sending Epstein photos of a young woman. The "cleaned" version? A detailed email thread between Keir Starmer and Rebecca Long-Bailey discussing Brexit strategy, with Emily Thornberry asking to join a meeting.

Keir Starmer does not appear anywhere in the original document. Not once. The LLM invented an entire fake email exchange and dropped it into an archive of legal evidence.

We killed LLM text cleanup immediately. Groq now only generates metadata — summaries, people mentioned, document type — and those are clearly labeled as AI-generated. The actual document text is never touched by an LLM.

Messy but real beats clean but fabricated. Every time.

### Wrong Turn 2: "Let's make nice PDFs"

We wanted the extracted text to look good, so we generated formatted PDFs using fpdf2 with Unicode fonts. Title pages, proper formatting, page numbers. The files looked right — correct page count, reasonable file size, title page rendered fine.

Pages 2 through 164 were completely blank.

No errors. No warnings. Each line worked individually. Combined into one document, everything after page 1 vanished. We tried different fonts. We tried PyMuPDF's own PDF writer. Same thing.

We never figured out why. We just gave up on PDF generation and stored everything as plain text files. Less polished, actually works.

### Wrong Turn 3: "HTML in the text layer means hidden content"

We figured: if a document's text layer is mostly HTML source code, that HTML probably isn't visible when viewing the PDF. We flagged everything with >30% HTML content and >20KB of text. That gave us 1,641 documents.

Then we looked at them. Tons of false positives. Many were PDFs where the raw email source code was literally printed on the page as visible text. The pages showed `<div>`, `<blockquote>`, `From:` headers — you could see it all just by opening the file. The text layer matched the visual content. Nothing was hidden.

## What Actually Distinguishes Hidden Content

The answer was embarrassingly physical. The documents with hidden content have black bars on them. The documents without hidden content don't.

We wrote a pixel scanner. Render a few pages from each PDF, walk across the image looking for long horizontal stretches of near-black pixels. Redaction bars are just big dark rectangles. Count them.

EFTA00143287 (truly hidden content): 107 dark runs on page 1, average 35.7 per page.
EFTA02715081 (content is visible): 9 on page 1, average 2.0.

Threshold of 15 dark runs per page. That cut our set from 1,641 down to 686 documents.

## What About the Images?

Someone asked whether the PDFs contained hidden embedded images — photos or attachments tucked into the file data that don't show up when viewing the document.

We checked. The "images" in these PDFs are page scans — one per page, full resolution, and completely visible when you open the file. They're what you see. We also searched all 1,641 hidden-content documents for `data:image` base64 content and `cid:` inline attachment references. Zero documents had embedded base64 images. Nine had `cid:` references, but those just point to email attachments that weren't included in the PDF.

No hidden images. The hidden content in this archive is text, not pictures.

## The Final Pipeline

Here's what actually runs:

1. Score all 1.44M docs with regex heuristics (5 min, no AI)
2. Flag docs where text layer is >30% HTML, >20KB
3. Render sample pages, count dark pixel runs, skip anything without redaction bars
4. Check if another document with the same filename was already extracted (dedup)
5. Pull the full text layer with PyMuPDF
6. Programmatic cleanup — strip HTML tags, MIME headers, base64 blocks, garbled-tag remnants, image filename clusters, lines that are mostly non-word characters
7. One Groq call for metadata (summary, people, doc type) — labeled as AI-generated
8. Save as .txt, link back to original, store metadata

686 documents. About 12 minutes end to end. Two dollars in API costs.

## The Text Is Still Ugly

We're not going to pretend otherwise. Here's what extracted text from behind redaction bars looks like:

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

You can read it if you squint. Someone threatening to sue, saying they've been torched physically and mentally, accusing people of intimidation, begging for help. It's interspersed with OCR garbage because the scanner tried to read through the black bars and picked up fragments mixed with visual noise.

We can't clean this up programmatically — the garbage is fused with the real text at the character level. And we can't use AI to clean it, because that's how you get fake Keir Starmer emails in your evidence archive.

It's searchable though. "Attorney," "sue," "allegations," "evidence" — those all work. The AI-generated summary gives you the gist. The raw text is there for anyone who wants to dig through it.

## What's Left to Find

686 is the high-confidence set. There could be more hiding in ways we haven't checked:

- PDF attachments embedded in the file data
- Metadata fields nobody looks at
- Text layers positioned off-screen
- White text on white background

Each would need its own detector. The pipeline's modular enough to add them. But for now, 686 documents of previously invisible content is a start.

## Stack

PyMuPDF does all the heavy lifting — text extraction, page rendering, image analysis, redaction detection. Node.js and SQLite handle the pipeline and storage. Groq provides metadata summaries at a fraction of a cent per document. The whole thing runs on one server with no GPU.
