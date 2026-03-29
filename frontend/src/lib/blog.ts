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
const drafts: BlogPost[] = [
  {
    slug: 'hidden-text-behind-redaction-bars',
    title: 'How a Reddit Post Led Us to Unredact 686 Epstein Documents',
    date: 'March 17, 2026',
    tag: 'INVESTIGATION',
    excerpt:
      'A Redditor named Quick_Director_8191 showed that a 118-page PDF of apparent garbage actually contained a full email thread hidden behind redaction bars. We spent days trying to replicate their work at scale. Here is everything that went wrong and what finally worked.',
    html: `
<h2>Credit Where It's Due</h2>

<p>We need to start by tipping our hats to Reddit user <strong>u/Quick_Director_8191</strong> on <a href="https://reddit.com/r/Epstein">r/Epstein</a>. They did something genuinely impressive. They took <a href="/doc/b8cf180ba0ea133b990013efab2746aa">EFTA00143287</a> &mdash; a 118-page PDF that looks like absolute garbage when you open it, black bars everywhere, walls of raw HTML source code, OCR gibberish &mdash; and reconstructed a complete email thread from it. Over a dozen emails spanning October 2024 to January 2025, naming Keir Starmer, Cyril Ramaphosa, Putin, Xi, Trump, Elon Musk, David Boies, Alan Dershowitz, Jamie Dimon, Zelenskyy, Jeff Bezos, and Ghislaine Maxwell. Allegations about JP Morgan, the Epstein trafficking network, starvation, intimidation, and a lot more.</p>

<p>Their post was a revelation. They explained that the document was "completely scrambled" but that AI could "put everything back together." They were right. And when we read it, our first thought was: there are 1.44 million documents in this archive. How many others have the same kind of hidden content?</p>

<p>Our second thought was: how hard can it be to replicate what they did?</p>

<p>Very hard, as it turns out.</p>

<h2>What's Actually Going On in That PDF</h2>

<p>When someone redacts a PDF, they draw black rectangles over the sensitive content. If done properly, the underlying text data gets stripped too. But in hundreds of documents in this archive, whoever did the redaction only covered the visual layer. The text data underneath the black bars was left completely intact.</p>

<p>So when you view EFTA00143287 in a PDF reader, you see a mess of black bars and garbled HTML. But when you extract the text layer programmatically, you get the raw email source code &mdash; complete with From/To/Date headers, message bodies, and a nested reply chain spanning dozens of messages.</p>

<p>The catch: the extracted text is still garbled. OCR engines tried to read through the black bars and produced a mix of real text and noise. Names are mangled (SURMA instead of STARMER, PAMLY instead of FAMILY). HTML tags are fused with words. Half the characters are artifacts. u/Quick_Director_8191 used AI to untangle all of this into readable emails. We wanted to do the same thing, automatically, for every document in the archive.</p>

<h2>Attempt 1: Just Use AI to Clean It Up (Catastrophic Failure)</h2>

<p>Obvious first move. Take the garbled text, send it to an LLM, ask it to clean up the OCR errors. We used Groq with Llama 3.3 70B. "Clean up this OCR text, fix garbled names, remove HTML artifacts." Looked great in testing.</p>

<p>Then we spot-checked the results.</p>

<p>One document &mdash; actually an email from someone named Barbro Ehnbom sending Epstein photos of a young woman &mdash; came back "cleaned" with a detailed email thread between <strong>Keir Starmer and Rebecca Long-Bailey discussing Brexit strategy</strong>, with Emily Thornberry asking to join a meeting.</p>

<p>None of these people appear anywhere in the original document. The LLM invented an entire fake email exchange about UK Labour Party politics and dropped it into an evidence archive. We verified: zero mentions of "Starmer" in the original text of that document. The model hallucinated the whole thing.</p>

<p>We killed all LLM text cleanup immediately. Messy but real beats clean but fabricated.</p>

<h2>Attempt 2: Make Nice PDFs (Silently Blank)</h2>

<p>OK, so we can't use AI to clean the text. Fine. We'll at least make the extracted text look nice by generating formatted PDFs with title pages and page numbers. We used fpdf2 with Unicode fonts. The output looked right &mdash; correct page count, reasonable file size, title page rendered fine.</p>

<p>Pages 2 through 164 were completely blank. No errors, no warnings. Each line worked individually. Combined into one document, everything after page 1 vanished. We tried different fonts. Tried PyMuPDF's own PDF writer. Same result.</p>

<p>Never figured out why. Gave up and stored everything as plain text files.</p>

<h2>Attempt 3: Find Hidden Content by Looking for HTML (Too Many False Positives)</h2>

<p>We needed to find which of the 1.44 million documents had hidden content. We wrote a scoring script &mdash; eight regex heuristics, no AI &mdash; that ran through all 1,435,616 documents in 5.6 minutes. Then we added a "hidden HTML content" detector: if a document's text layer is more than 30% HTML source code with more than 20KB of text, it probably has hidden content. This flagged 1,641 documents.</p>

<p>Then we actually looked at them. Tons of false positives. Many were PDFs where the raw email source code was literally printed on the page as visible text. You could see the HTML tags and email headers just by opening the file. Nothing was hidden &mdash; it was just ugly.</p>

<h2>The Black Bars Are the Signal</h2>

<p>We were overcomplicating this. The documents with hidden content have black redaction bars on them. The documents without hidden content don't.</p>

<p>We wrote a pixel scanner. For each PDF, render a few sample pages, walk across the image counting long horizontal stretches of near-black pixels. Redaction bars are just big dark rectangles.</p>

<p>EFTA00143287 (truly hidden content): 107 dark runs on page 1, average 35.7 per page. EFTA02715081 (content already visible): 9 on page 1, average 2.0.</p>

<p>Threshold of 15. That cut our set from 1,641 down to <strong>686 documents</strong> with actual redaction bars hiding text.</p>

<h2>Attempt 4: Generic OCR Cleanup with GPT-4o (Getting Warmer)</h2>

<p>We had 686 documents. The programmatic cleanup (strip HTML, MIME headers, base64 data, garbled tag remnants) helped but still left the text pretty rough. We went back to AI, this time more carefully.</p>

<p>We tried sending chunks of text to GPT-4o asking it to "clean up this OCR text." Better than Llama, but the model kept summarizing instead of reconstructing. Or it would extract one or two sentences per email and mark everything else as "[Garbled and redacted content]." Or it would start looping, repeating the same email over and over with fabricated timestamps.</p>

<p>The fundamental problem: "clean up this text" is too open-ended. The model doesn't know what's noise and what's content, so it either plays it too safe (marking everything as illegible) or too loose (inventing content to fill gaps).</p>

<h2>What u/Quick_Director_8191 Actually Did</h2>

<p>Looking at their Reddit post more carefully, we realized the task they gave the AI was fundamentally different from ours. They didn't ask the AI to "clean up OCR text." They asked it to <strong>reconstruct an email thread from raw HTML source</strong>. That's a structured task. The AI can use the email reply chain structure &mdash; nested blockquotes, repeated headers, date patterns &mdash; to figure out where one email ends and the next begins, and to distinguish real content from quoted text in replies.</p>

<p>The other thing we realized: the reference to "Keir Starmer" we thought was hallucinated? It's real in <em>this</em> document. The subject line of the email thread literally says "KEIR STARMER." Our OCR read it as "KEIR SURMA" and we assumed the AI made it up. But it didn't &mdash; it correctly decoded the OCR error. The hallucination happened on a <em>different</em> document where Starmer genuinely doesn't appear.</p>

<h2>The Approach That Worked: Multi-Pass Windowed Extraction</h2>

<p>The breakthrough was splitting the problem up. These email PDFs are deeply nested &mdash; each reply quotes every previous message, so a 118-page document might only have 20 unique emails buried in mountains of repeated quoted text. Sending the whole thing to an LLM in one shot doesn't work because:</p>

<ol>
<li>The document is too big (758K characters for EFTA00143287)</li>
<li>The LLM can't tell unique content from repeated quotes</li>
<li>It runs out of output tokens and starts looping</li>
</ol>

<p>Our solution: process the PDF in overlapping page windows. For each window of 5-15 pages, send the text to GPT-4o with a specific prompt: "Extract the FULL body text of every unique email in this section. Here are emails already extracted from previous sections &mdash; do NOT repeat them." Then at the end, do one consolidation pass to deduplicate and order the final thread.</p>

<p>For EFTA00143287, this meant 15 API calls across overlapping windows, plus one consolidation call. The result: <strong>50 unique emails</strong> with full body text, proper dates, sender identification, and OCR errors corrected where the meaning was clear from context. References to Starmer, Cyril Ramaphosa, Putin, Trump, Elon Musk, Jeff Bezos, Alan Dershowitz, Jamie Dimon, Zelenskyy, David Boies, Bill Ackman, Larry Fink, Ghislaine Maxwell, Georgia Meloni, and more &mdash; all actually present in the source text.</p>

<p>Total cost for that one document: about $2.30.</p>

<h2>Scaling to All 686 Documents</h2>

<p>We estimated this would cost $50-80 for the top 32 highest-scoring documents. Actual cost: <strong>$0.88</strong>. Most documents are much smaller than the 118-page monster that started all this. A typical 20-page redacted PDF needs 3-4 API calls, not 15.</p>

<p>Across 32 documents, we extracted <strong>584 unique emails</strong> from behind redaction bars. The biggest single document yielded 203 emails. We're now running the same process across all 686 documents.</p>

<p><a href="/doc/1bf696f0667024e26fe7037520d1254f">Read the reconstructed EFTA00143287 email thread here.</a></p>

<h2>What We Learned</h2>

<p><strong>Cheap models hallucinate on messy input.</strong> Llama 3.3 70B via Groq fabricated entire fake email conversations when given garbled OCR text. GPT-4o is much better but still needs careful prompting and structured tasks.</p>

<p><strong>"Clean up this text" is the wrong prompt.</strong> "Reconstruct the email thread from this HTML source" works because it gives the model a structured task with clear success criteria. Open-ended cleanup invites fabrication.</p>

<p><strong>You have to split the work up.</strong> Sending a 758K-character document to an LLM in one shot doesn't work. Overlapping page windows with dedup context between passes does.</p>

<p><strong>The physical signal is the simplest one.</strong> We tried fancy heuristics based on HTML content percentages and text-to-filesize ratios. What actually works: count the black rectangles on the page. Redacted documents have black bars. Non-redacted documents don't.</p>

<p><strong>Check your "hallucinations" twice.</strong> We almost threw away the Keir Starmer connection because we assumed the AI made it up. It didn't &mdash; it correctly decoded "SURMA" to "STARMER" from the actual document. The hallucination was on a different file entirely.</p>

<p><strong>Some random person on Reddit is often way ahead of you.</strong> u/Quick_Director_8191 did this before we even knew it was possible. Their post is the reason 686 documents are now readable that weren't before. We just automated what they figured out by hand.</p>

<h2>The Pipeline</h2>

<ol>
<li>Score all 1.44M docs with regex heuristics (5 min, no AI)</li>
<li>Flag docs where text layer is &gt;30% HTML, &gt;20KB</li>
<li>Render sample pages, count dark pixel runs, skip anything without redaction bars</li>
<li>Deduplicate by filename</li>
<li>Pull the full text layer with PyMuPDF</li>
<li>Programmatic cleanup &mdash; strip HTML, MIME, base64, garbled tags</li>
<li>Multi-pass GPT-4o reconstruction &mdash; overlapping page windows with dedup context</li>
<li>Consolidation pass &mdash; deduplicate and order the final thread</li>
<li>Groq metadata extraction &mdash; summary, people, doc type (labeled as AI-generated)</li>
<li>Store as .txt, link to original, index for search</li>
</ol>

<p>686 documents. Under $20 total. Every extracted document is linked back to its original so you can always check the source.</p>

<p class="signature">&mdash; The Archive Collective</p>
`,
  },
]

const posts: BlogPost[] = [
  {
    slug: 'crawling-the-uncrawlable',
    title: 'Crawling the Uncrawlable: How We Index Epstein Content From Sites That Block Bots',
    date: 'March 25, 2026',
    tag: 'ENGINEERING',
    excerpt:
      'Reddit blocks datacenter IPs. The DOJ site has an age gate. News sites detect bots. We needed to crawl them all. Here is how we built a crawler that actually works.',
    html: `
<p>The Epstein archive doesn't stop at the 1.4 million documents the DOJ released. Every day, new court filings emerge, journalists publish investigations, Reddit users surface connections, and researchers post analyses. We built a crawler to find and index all of it.</p>

<p>The problem: most of these sites don't want to be crawled.</p>

<h2>The Wall</h2>

<p>Our crawler ran fine on archive.org and DocumentCloud. Then we tried Reddit, and got nothing. The DOJ's own Epstein files page returned an age verification gate instead of documents. The New York Times, Washington Post, and most major news sites detected our bot and blocked it. Even government sites like the FBI vault would intermittently refuse connections.</p>

<p>The standard approach &mdash; set a User-Agent header, respect robots.txt, be polite &mdash; doesn't work when sites actively block datacenter IP ranges. Our server runs on Hetzner in Germany. Reddit, in particular, blocks Hetzner IPs entirely. Doesn't matter how polite your bot is if the front door is locked.</p>

<h2>Enter Wick</h2>

<p>We switched our crawler to use <a href="https://getwick.dev">Wick</a>, a browser-grade web fetching tool designed for exactly this problem. Instead of making bare HTTP requests that scream "I'm a bot," Wick fetches pages the way a real browser does &mdash; TLS fingerprint, HTTP/2 negotiation, header ordering, the works.</p>

<p>The integration was straightforward. Wick runs as a CLI tool:</p>

<pre><code>wick fetch https://www.reddit.com/r/Epstein/ --no-robots --format html</code></pre>

<p>We wrapped it in a tiny HTTP proxy on the host machine, and our Docker-based crawler calls it for every HTML page fetch. Binary files (PDFs, images) still go through direct HTTP since they don't trigger bot detection.</p>

<h2>What Changed</h2>

<p>Before Wick, our crawler was stuck in a loop: discover URLs via search, try to fetch them, get blocked, repeat. The queue grew but nothing actually got downloaded.</p>

<p>After Wick:</p>

<ul>
<li><strong>Reddit</strong> &mdash; We now crawl r/Epstein, r/EpsteinAndFriends, and related subreddits. Individual posts, comment threads, linked documents. Over 30 Reddit threads indexed so far, including discussions about the unredacted black book, flight logs, victim impact statements, and document analysis.</li>
<li><strong>DOJ/Justice.gov</strong> &mdash; The age verification gate that blocked our crawler? Wick walks right through it. We're now indexing the DOJ's data set listing pages and following links to individual documents.</li>
<li><strong>News sites</strong> &mdash; Britannica, NY Post, PBS, NPR, AP News, NBC, CBS, USA Today. Articles about Prince Andrew's arrest, Howard Lutnick's island visit, Goldman Sachs lawyer resignations, Pam Bondi subpoenas. All indexed and searchable.</li>
<li><strong>Research sites</strong> &mdash; EpsteinWeb.org connection graphs, the Jmail Encyclopedia, Newsweek's full name list.</li>
</ul>

<p>Over 5,000 documents indexed from web sources, with new content arriving continuously.</p>

<h2>The Residential IP Problem</h2>

<p>Even Wick has limits. Some sites &mdash; Reddit in particular &mdash; don't just detect bot behavior, they block entire IP ranges belonging to cloud providers. No amount of browser emulation helps if the IP itself is blacklisted.</p>

<p>Wick solves this with <strong>wick-tunnel</strong>, which routes requests through a residential IP. You run <code>wick-tunnel init</code> on your server, then <code>wick-tunnel join</code> on a machine with a residential connection (your laptop, a home server). Traffic that needs a clean IP gets routed through the tunnel automatically.</p>

<p>This is how we plan to unlock the remaining blocked sources. The crawler runs 24/7 on our server, but requests that hit IP-based blocks get transparently routed through a residential connection.</p>

<h2>Deduplication</h2>

<p>When you crawl the same content from multiple sources &mdash; a Reddit post links to an archive.org PDF that's also on DocumentCloud and referenced in a court filing &mdash; you need to not index it four times.</p>

<p>We built two layers of dedup:</p>

<ol>
<li><strong>Pre-fetch filename check</strong> &mdash; Before downloading, extract the filename from the URL and check if a document with that name already exists in the archive. This catches the 600+ EFTA PDFs that the DOJ site links to but we already have from the original data dump. Zero bandwidth wasted.</li>
<li><strong>Post-fetch SHA256 hash</strong> &mdash; After downloading, hash the content and check for duplicates. Catches the same document hosted at different URLs.</li>
</ol>

<h2>What We're Crawling Now</h2>

<p>The crawler runs continuously with 46 search queries cycling through topics like "JPMorgan Epstein unsealed documents," "Prince Andrew arrest 2026," "Howard Lutnick Epstein island," and "Epstein redacted documents hidden text." It discovers new URLs, fetches them through Wick, scores their relevance using a local embedding model, and indexes anything scoring above 0.3.</p>

<p>The latest crawled documents show up on the <a href="/">home page</a> and are immediately searchable. You can see news articles from hours ago alongside the original DOJ documents from 2025.</p>

<h2>Stack</h2>

<ul>
<li><a href="https://getwick.dev">Wick Pro</a> &mdash; Browser-grade fetching with <code>--no-robots</code> and residential IP routing via wick-tunnel</li>
<li><strong>Node.js crawler</strong> with adapter pattern (court, government, news, archive-org, search-discovery)</li>
<li><strong>Xenova/bge-small-en-v1.5</strong> &mdash; Local 384-dim embedding model for relevance scoring, no API calls</li>
<li><strong>Meilisearch</strong> &mdash; Full-text indexing of crawled content alongside the 1.4M original documents</li>
<li><strong>Pre-fetch dedup</strong> &mdash; Filename and hash checks to avoid re-downloading the massive DOJ document set</li>
</ul>

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
