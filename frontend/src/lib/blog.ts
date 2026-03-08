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
