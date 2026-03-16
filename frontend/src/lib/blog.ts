export interface BlogPost {
  slug: string
  title: string
  date: string
  tag?: string
  excerpt: string
  html: string
}

/**
 * Blog posts are defined inline here. Simple and dependency-free —
 * no markdown parser needed. Add new posts to the top of the array.
 */
const posts: BlogPost[] = [
  {
    slug: 'hidden-text-behind-redaction-bars',
    title: 'We Found Hidden Text Behind the Redaction Bars in 686 Epstein Documents',
    date: 'March 16, 2026',
    tag: 'INVESTIGATION',
    excerpt:
      'Whoever redacted these documents blacked out the visual content but forgot to strip the text data underneath. We scanned all 1.44 million files to find which ones have content hiding behind the black bars.',
    html: `
<p>One document changed everything. <a href="/doc/b8cf180ba0ea133b990013efab2746aa">EFTA00143287</a> &mdash; 118 pages, looks like total garbage when you open it. Black bars everywhere, raw HTML source code printed across the pages, OCR text that reads like someone fell asleep on a keyboard.</p>

<p>But the PDF's text layer told a different story. Under those black bars, the full text of an email thread was sitting there untouched. Whoever did the redaction blacked out the visual content but forgot to strip the text data underneath. The thread ran from October 2024 to January 2025, named dozens of people, and made detailed allegations about JP Morgan and the Epstein trafficking network. None of it shows up when you view the PDF. All of it was right there in the data.</p>

<p>So: how many of the other 1.44 million documents in the archive have the same problem?</p>

<h2>Scanning 1.44 Million Documents in 5 Minutes</h2>

<p>We couldn't afford to run AI on every file. Instead we wrote a scoring script &mdash; eight regex checks, no AI, no API calls. Things like: does the text layer contain HTML tags? Are there email headers? Is the file huge but the extracted text tiny?</p>

<p>It ran through all 1,435,616 documents in 5.6 minutes. Almost every document triggered something &mdash; 99.5% scored above zero. A million of them landed in the 30-39 point range, mostly because they're email PDFs that naturally have <code>From:</code> and <code>To:</code> headers. Useless for our purposes.</p>

<p>Only 6,487 scored above 50. That's where things got interesting.</p>

<h2>Three Wrong Turns</h2>

<h3>Wrong Turn 1: "Just use AI to clean up the text"</h3>

<p>The text behind redactions is rough. Names are garbled, HTML is fused with words, half the characters are noise. Obvious idea: send it through an LLM to clean it up.</p>

<p>We used Groq with Llama 3.3 70B. Prompt: clean up this OCR text, fix names, remove artifacts. It looked great in testing.</p>

<p>Then we checked the output for a document that was actually an email from someone named Barbro Ehnbom sending Epstein photos of a young woman. The "cleaned" version? A detailed email thread between Keir Starmer and Rebecca Long-Bailey discussing Brexit strategy, with Emily Thornberry asking to join a meeting.</p>

<p>Keir Starmer does not appear anywhere in the original document. Not once. The LLM invented an entire fake email exchange and dropped it into an archive of legal evidence.</p>

<p>We killed LLM text cleanup immediately. Groq now only generates metadata &mdash; summaries, people mentioned, document type &mdash; and those are clearly labeled as AI-generated. The actual document text is never touched by an LLM.</p>

<p>Messy but real beats clean but fabricated. Every time.</p>

<h3>Wrong Turn 2: "Let's make nice PDFs"</h3>

<p>We wanted the extracted text to look good, so we generated formatted PDFs using fpdf2 with Unicode fonts. Title pages, proper formatting, page numbers. The files looked right &mdash; correct page count, reasonable file size, title page rendered fine.</p>

<p>Pages 2 through 164 were completely blank.</p>

<p>No errors. No warnings. Each line worked individually. Combined into one document, everything after page 1 vanished. We tried different fonts. We tried PyMuPDF's own PDF writer. Same thing.</p>

<p>We never figured out why. We just gave up on PDF generation and stored everything as plain text files. Less polished, actually works.</p>

<h3>Wrong Turn 3: "HTML in the text layer means hidden content"</h3>

<p>We figured: if a document's text layer is mostly HTML source code, that HTML probably isn't visible when viewing the PDF. We flagged everything with &gt;30% HTML content and &gt;20KB of text. That gave us 1,641 documents.</p>

<p>Then we looked at them. Tons of false positives. Many were PDFs where the raw email source code was literally printed on the page as visible text. The pages showed <code>&lt;div&gt;</code>, <code>&lt;blockquote&gt;</code>, <code>From:</code> headers &mdash; you could see it all just by opening the file. The text layer matched the visual content. Nothing was hidden.</p>

<h2>What Actually Distinguishes Hidden Content</h2>

<p>The answer was embarrassingly physical. The documents with hidden content have black bars on them. The documents without hidden content don't.</p>

<p>We wrote a pixel scanner. Render a few pages from each PDF, walk across the image looking for long horizontal stretches of near-black pixels. Redaction bars are just big dark rectangles. Count them.</p>

<p>EFTA00143287 (truly hidden content): 107 dark runs on page 1, average 35.7 per page.<br/>
EFTA02715081 (content is visible): 9 on page 1, average 2.0.</p>

<p>Threshold of 15 dark runs per page. That cut our set from 1,641 down to 686 documents.</p>

<h2>What About the Images?</h2>

<p>Someone asked whether the PDFs contained hidden embedded images &mdash; photos or attachments tucked into the file data that don't show up when viewing the document.</p>

<p>We checked. The "images" in these PDFs are page scans &mdash; one per page, full resolution, and completely visible when you open the file. They're what you see. We also searched all 1,641 hidden-content documents for <code>data:image</code> base64 content and <code>cid:</code> inline attachment references. Zero documents had embedded base64 images. Nine had <code>cid:</code> references, but those just point to email attachments that weren't included in the PDF.</p>

<p>No hidden images. The hidden content in this archive is text, not pictures.</p>

<h2>The Final Pipeline</h2>

<ol>
<li>Score all 1.44M docs with regex heuristics (5 min, no AI)</li>
<li>Flag docs where text layer is &gt;30% HTML, &gt;20KB</li>
<li>Render sample pages, count dark pixel runs, skip anything without redaction bars</li>
<li>Check if another document with the same filename was already extracted (dedup)</li>
<li>Pull the full text layer with PyMuPDF</li>
<li>Programmatic cleanup &mdash; strip HTML tags, MIME headers, base64 blocks, garbled-tag remnants, image filename clusters, lines that are mostly non-word characters</li>
<li>One Groq call for metadata (summary, people, doc type) &mdash; labeled as AI-generated</li>
<li>Save as .txt, link back to original, store metadata</li>
</ol>

<p>686 documents. About 12 minutes end to end. Two dollars in API costs.</p>

<h2>The Text Is Still Ugly</h2>

<p>We're not going to pretend otherwise. Here's what extracted text from behind redaction bars looks like:</p>

<pre><code>Sabin HATERHAL EMAIL] SOS mum EMERGENCY, KEIR SURMA IT RADAR Elan
MUMS HOUSE OTT RUTIN AND XI HUNGER GAMES UN KEW HEAD:WARIER:5 ATE =III

If I WU ONE EVEN CM CONVLISMION HAS BEEN IIAD ADOOT ME. WITHOW MY
KNOWLEDGE OR WITHOUT AN ATTORNEY AND Of3f11ONS HAVE BEEN MADE ON MY
WHALE WITHOUT MY KNOWLEDGE OR AN ATTORNEY PRESENT I WIU. SUE EACH OF YOU

PLEASE CAN SOMEONE ASK

KAPUT. TORCHED PHYSICALLY AND MENTALLY AND NOT INE PERSON HAS OFFERED
THE LEAST YOU COULD HAVE COIM IS MD ESPECIALLY AFTER OVERA YEAR OF
BEGGING AND PLEADING EVIDENCE TO RACY M ALL MY ALLEGATIONS?</code></pre>

<p>You can read it if you squint. Someone threatening to sue, saying they've been torched physically and mentally, accusing people of intimidation, begging for help. It's interspersed with OCR garbage because the scanner tried to read through the black bars and picked up fragments mixed with visual noise.</p>

<p>We can't clean this up programmatically &mdash; the garbage is fused with the real text at the character level. And we can't use AI to clean it, because that's how you get fake Keir Starmer emails in your evidence archive.</p>

<p>It's searchable though. "Attorney," "sue," "allegations," "evidence" &mdash; those all work. The AI-generated summary gives you the gist. The raw text is there for anyone who wants to dig through it.</p>

<h2>What's Left to Find</h2>

<p>686 is the high-confidence set. There could be more hiding in ways we haven't checked:</p>

<ul>
<li>PDF attachments embedded in the file data</li>
<li>Metadata fields nobody looks at</li>
<li>Text layers positioned off-screen</li>
<li>White text on white background</li>
</ul>

<p>Each would need its own detector. The pipeline's modular enough to add them. But for now, 686 documents of previously invisible content is a start.</p>

<h2>Stack</h2>

<p>PyMuPDF does all the heavy lifting &mdash; text extraction, page rendering, image analysis, redaction detection. Node.js and SQLite handle the pipeline and storage. Groq provides metadata summaries at a fraction of a cent per document. The whole thing runs on one server with no GPU.</p>

<p class="signature">&mdash; The Archive Collective</p>
`,
  },
  {
    slug: 'welcome-to-the-archive',
    title: 'Welcome to the Archive: What We Built and Why',
    date: 'March 7, 2026',
    tag: 'ANNOUNCEMENT',
    excerpt:
      'We are an anonymous collective devoted to truth and transparency. This is the story of why we built a censorship-resistant, AI-powered archive of every document the DOJ released on Jeffrey Epstein — and how it works.',
    html: `
<p>In 2025, the U.S. Department of Justice quietly released over 370 gigabytes of documents related to the Jeffrey Epstein investigation. Approximately 1.4 million files spanning 3.5 million pages — FBI interview summaries, police reports, emails, financial records, flight manifests, seized photographs and videos, and more.</p>

<p>They released them as raw data dumps. Twelve massive zip files with no search, no index, no way for an ordinary person to make sense of what was inside. Functionally, the documents were public but practically invisible.</p>

<p>We decided to change that.</p>

<h2>Who We Are</h2>

<p>We are an anonymous collective of engineers, researchers, and citizens devoted to truth and transparency. We have no institutional backing, no corporate sponsors, no political affiliation. We believe that public records should be genuinely public — not just technically available, but actually accessible, searchable, and permanent.</p>

<p>We don't trust any single institution to preserve this material. Governments change. Servers go offline. Platforms cave to legal pressure. So we built something that doesn't depend on any single point of failure.</p>

<h2>What We Built</h2>

<p>The Epstein Files Archive is a fully searchable, AI-enhanced, censorship-resistant archive of every document the DOJ released — and more. Here's what it does:</p>

<h3>Full-Text Search Across 1.4 Million Files</h3>

<p>Every document has been OCR'd, text-extracted, and indexed. You can search across all 3.5 million pages with typo-tolerant, sub-200ms results. Filter by data set, file type, or category.</p>

<p>Try it yourself: search for <a href="/search?q=passport">"passport"</a> and see what turns up. Or <a href="/search?q=wire%20transfer">"wire transfer"</a>. Or <a href="/search?q=flight%20manifest">"flight manifest"</a>. The search works across PDFs, emails, scanned handwritten notes — everything.</p>

<h3>AI-Powered Investigation</h3>

<p>We've integrated AI directly into the research workflow. On the homepage, you can <a href="/chat">ask the AI assistant</a> any question about the documents and get answers grounded in the actual evidence. The AI retrieves relevant passages from the archive and constructs answers with citations you can click to verify.</p>

<p>Ask it anything: <a href="/chat?q=What%20do%20the%20flight%20logs%20show%3F">"What do the flight logs show?"</a> or <a href="/chat?q=What%20did%20the%20FBI%20know%20and%20when%3F">"What did the FBI know and when?"</a> — it searches through the documents and synthesizes what it finds.</p>

<h3>Automatic Entity Extraction</h3>

<p>We run every document through AI-powered entity extraction that identifies people, organizations, and locations mentioned across the archive. The system has already identified over 21,000 entities and mapped the relationships between them.</p>

<p>Visit the <a href="/analysis/entities">Entity Network</a> to explore the web of connections visually. Click any <a href="/entities">person or organization</a> to see every document they appear in, who they're connected to, and AI-generated investigative questions specific to that entity — questions designed to surface things that might not yet be discovered.</p>

<h3>AI Image Analysis</h3>

<p>The archive contains approximately 180,000 seized photographs. Every image is analyzed by AI vision models that identify and describe what's in each photo — people, objects, locations, visible text, signage, and context. These descriptions become searchable keywords, meaning you can find images by what's <em>in</em> them, not just by filename. Search for <a href="/search?q=passport">"passport"</a> and you'll find not just documents mentioning passports, but actual photographs of passports.</p>

<h3>Audio and Video Transcription</h3>

<p>The archive contains thousands of audio and video files — interview recordings, surveillance footage, seized media. We automatically transcribe audio and video files using Whisper, making their contents searchable alongside every other document. Files that were previously opaque — you'd have to listen to hours of tape — are now fully text-searchable.</p>

<h3>Continuous Web Crawling</h3>

<p>The archive doesn't stop at the DOJ release. We operate a web crawler that continuously discovers new Epstein-related documents from court dockets (PACER), government transparency portals, the Internet Archive, news publications, and investigative journalism outlets. New content is automatically scored for relevance, deduplicated against existing records, and added to the searchable index.</p>

<p>This means the archive grows over time. As new court filings emerge, as FOIA requests are fulfilled, as journalists publish new findings — the crawler picks them up and folds them in.</p>

<h3>Document Processing Pipeline</h3>

<p>Every file that enters the archive goes through a processing pipeline:</p>

<ol>
<li><strong>Type detection</strong> — files are classified by extension and magic bytes</li>
<li><strong>Text extraction</strong> — PDFs processed with PyMuPDF, scanned pages OCR'd with Tesseract, emails and spreadsheets parsed</li>
<li><strong>Thumbnail generation</strong> — visual previews for PDFs, images, and video frames</li>
<li><strong>Full-text indexing</strong> — all text indexed in Meilisearch with filterable facets</li>
<li><strong>Entity extraction</strong> — AI identifies people, organizations, locations, and relationships</li>
<li><strong>Image analysis</strong> — AI vision models describe the contents of every photograph, making images searchable by what's in them</li>
<li><strong>Transcription</strong> — audio and video files transcribed with Whisper</li>
<li><strong>Virus scanning</strong> — every uploaded file scanned with ClamAV before processing</li>
<li><strong>P2P distribution</strong> — content published to the Spill network for decentralized replication</li>
</ol>

<h2>Censorship Resistance: The Spill P2P Network</h2>

<p>This is perhaps the most important thing we built. The archive is distributed via the <a href="https://github.com/myleshorton/spill">Spill P2P network</a>, built on Hyperswarm and Hyperdrive. Every document, every index, every piece of the archive is replicated across peer nodes worldwide.</p>

<p>What this means in practice:</p>

<ul>
<li><strong>If this server goes offline, the archive survives.</strong> Other peer nodes retain full copies of the data.</li>
<li><strong>No single entity can take it down.</strong> There is no kill switch, no single hosting provider to pressure, no domain registrar to bully.</li>
<li><strong>Connections are encrypted end-to-end</strong> using the Noise protocol. Peers communicate directly without intermediaries.</li>
<li><strong>Anyone can run a peer node</strong> and help replicate the archive. The more nodes, the more resilient it becomes.</li>
</ul>

<p>We built this because we've seen what happens to archives that depend on a single server, a single company, a single jurisdiction. They disappear. We are determined that these documents will not disappear.</p>

<h2>Community Uploads</h2>

<p>The archive accepts <a href="/upload">public uploads</a>. If you have documents related to the Epstein case — court filings, FOIA responses, photographs, records — you can upload them directly. Every upload is virus-scanned with ClamAV, processed through our pipeline, and added to the searchable archive.</p>

<h2>Privacy</h2>

<p>We don't require accounts. We don't set tracking cookies. We don't log search queries. No analytics service is used. The site is served over HTTPS with a Let's Encrypt certificate, and the P2P layer uses end-to-end encryption. We built this to serve the public, not to surveil it.</p>

<h2>What Comes Next</h2>

<p>Entity extraction is ongoing — we're processing the full 1.4 million documents through AI to map every person, organization, and location. As this completes, the entity network will grow dramatically, revealing connections that are invisible when reading documents one at a time.</p>

<p>We're also expanding the crawler's reach to more court systems and government archives, and working on deeper financial analysis tools to trace the money flows documented in these records.</p>

<p>The truth is in the documents. We're just making it findable.</p>

<p class="signature">— The Archive Collective</p>
`,
  },
]

export function getAllPosts(): BlogPost[] {
  return posts
}

export function getPost(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug)
}
