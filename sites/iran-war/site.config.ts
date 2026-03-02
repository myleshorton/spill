export const siteConfig = {
  name: 'Iran War Archive',
  subtitle: 'Public Record',
  badge: 'LIVE',

  meta: {
    title: 'Iran War Archive — Operation Epic Fury Document & Footage Repository',
    description:
      'Searchable archive of raw footage, military documents, and diplomatic records from the 2026 US-Israeli strikes on Iran. CENTCOM releases, news footage, IAEA reports, and protest documentation — indexed and freely accessible.',
    ogTitle: 'Iran War Archive',
    ogDescription:
      'Searchable public archive of the 2026 Iran conflict. Raw footage, strike documentation, diplomatic records, and protest evidence.',
  },

  hero: {
    heading: 'Iran War',
    headingAccent: 'Archive',
    description:
      'Searchable archive of the 2026 US-Israeli military operations against Iran. Raw combat footage, CENTCOM releases, diplomatic cables, IAEA reports, protest documentation, and news coverage — all indexed, transcribed, and freely accessible. Our crawler continuously discovers and archives new material as the conflict unfolds.',
  },

  search: {
    placeholderSmall: 'Search footage, documents, locations, operations...',
    placeholderLarge: 'Search all documents and footage — operations, locations, dates, keywords...',
  },

  sisterSites: [
    { name: 'Epstein Files', url: 'https://epstein.spill.network' },
  ] as { name: string; url: string }[],

  dataSets: [
    { id: 1, name: 'CENTCOM Releases', shortName: 'CENTCOM', description: 'Official U.S. Central Command press releases, strike footage, and operational updates from Operation Epic Fury.', size: 'Ongoing' },
    { id: 2, name: 'IDF / Israeli Military', shortName: 'IDF Releases', description: 'Israeli Defense Forces releases and Operation Roaring Lion documentation.', size: 'Ongoing' },
    { id: 3, name: 'Diplomatic Records', shortName: 'Diplomatic', description: 'Diplomatic cables, UN statements, IAEA reports, and the Oman negotiation records leading up to the strikes.', size: 'Ongoing' },
    { id: 4, name: 'Raw Combat Footage', shortName: 'Combat Footage', description: 'Verified raw footage from the conflict zone — drone feeds, strike footage, ground-level video, and satellite imagery.', size: 'Ongoing' },
    { id: 5, name: 'Iran Protest Documentation', shortName: 'Protests', description: 'Documentation of the December 2025 – January 2026 Iranian protests that preceded the strikes. Footage, reports, and human rights records.', size: 'Ongoing' },
    { id: 6, name: 'News Coverage', shortName: 'News', description: 'Investigative journalism, geolocation analysis, and news reports from major outlets covering the conflict.', size: 'Ongoing' },
    { id: 7, name: 'Congressional & Legislative', shortName: 'Congressional', description: 'Congressional statements, hearings, War Powers resolutions, and legislative responses to the strikes.', size: 'Ongoing' },
    { id: 8, name: 'Pre-War Intelligence', shortName: 'Intelligence', description: 'Pre-war intelligence assessments, State of the Union transcript, nuclear program analyses, and policy documents.', size: 'Ongoing' },
    { id: 2001, name: 'Web Archive', shortName: 'Web Archive', description: 'Archived web pages and documents from the Internet Archive and Wayback Machine.', size: 'Ongoing' },
    { id: 2002, name: 'Search Discoveries', shortName: 'Search Discoveries', description: 'Additional content discovered via automated web search and crawling.', size: 'Ongoing' },
    { id: 2003, name: 'Government Records', shortName: 'Gov Records', description: 'Government documents, CENTCOM releases, and official reports discovered by the crawler.', size: 'Ongoing' },
    { id: 2004, name: 'Archive.org', shortName: 'Archive.org', description: 'Documents and media from the Internet Archive collections.', size: 'Ongoing' },
    { id: 2005, name: 'Crawled Content', shortName: 'Crawled', description: 'Additional content discovered and indexed by the web crawler.', size: 'Ongoing' },
  ],

  dataSetsIntro: {
    heading: 'Collections',
    description: 'The archive organizes material into {count} collections covering every facet of the conflict — from pre-war diplomacy through active military operations.',
    browseHeading: 'Browse by Collection',
    browseSummary: '{count} collections, continuously updated',
  },

  featuredSearches: [
    { label: 'Strike Footage', query: 'strike footage explosion', iconName: 'Video' as const },
    { label: 'CENTCOM Releases', query: 'CENTCOM Operation Epic Fury', iconName: 'FileText' as const },
    { label: 'Nuclear Sites', query: 'nuclear facility Isfahan Natanz', iconName: 'AlertTriangle' as const },
    { label: 'Diplomatic Records', query: 'IAEA negotiation Oman', iconName: 'Globe' as const },
    { label: 'Iran Protests', query: 'protest Tehran December', iconName: 'Users' as const },
    { label: 'Satellite Imagery', query: 'satellite imagery damage assessment', iconName: 'Image' as const },
  ] as { label: string; query?: string; type?: string; ds?: string; iconName: string }[],

  categories: {
    military_document: 'Military Documents',
    strike_footage: 'Strike Footage',
    combat_video: 'Combat Video',
    diplomatic_record: 'Diplomatic Records',
    intelligence_report: 'Intelligence Reports',
    news_article: 'News Coverage',
    satellite_imagery: 'Satellite Imagery',
    protest_footage: 'Protest Footage',
    congressional: 'Congressional Records',
    nuclear_report: 'Nuclear Reports',
    press_release: 'Press Releases',
    web_archive: 'Web Archive',
  } as Record<string, string>,

  contentTypes: {
    pdf: 'PDF Documents',
    image: 'Images',
    video: 'Videos',
    audio: 'Audio',
    html: 'Web Pages',
  } as Record<string, string>,

  about: {
    intro: [
      'On February 28, 2026, the United States and Israel launched joint military strikes against Iran — Operation Epic Fury (US) and Operation Roaring Lion (Israel). This archive exists to collect, preserve, and make searchable every publicly available document, video, and record related to this conflict.',
      'Raw combat footage disappears from social media. Government releases get buried. News coverage moves on. This archive ensures the primary source material remains accessible, searchable, and distributed via P2P so it cannot be taken offline.',
      'Beyond the active conflict, the archive preserves the full backstory: the December 2025 Iranian protests, the collapsed Oman nuclear negotiations, IAEA inspection reports, pre-war intelligence assessments, and the congressional debate over authorization.',
    ],
    features: [
      { title: 'Video Transcription', iconName: 'Video', description: 'Every video is automatically transcribed with OpenAI Whisper, making spoken content in combat footage and press conferences fully searchable.' },
      { title: 'Full-Text Search', iconName: 'Search', description: 'All documents are OCR\'d and indexed. Search across military reports, diplomatic cables, news coverage, and transcribed footage.' },
      { title: 'Continuous Crawling', iconName: 'Globe', description: 'Our crawler monitors CENTCOM, news outlets, government sites, and public archives around the clock, automatically ingesting new material as the conflict develops.' },
      { title: 'Censorship Resistant', iconName: 'Shield', description: 'The archive is distributed via the Spill P2P network. If this server goes offline, peer nodes retain full copies of the data.' },
    ],
    dataSources: [
      'U.S. Central Command (CENTCOM) official releases',
      'Israeli Defense Forces official releases',
      'IAEA verification and monitoring reports',
      'U.S. Department of Defense',
      'U.S. Department of State',
      'Congressional Record and hearing transcripts',
      'Internet Archive and Wayback Machine',
      'News organizations (Al Jazeera, CNN, Washington Post, etc.)',
      'Open-source intelligence and geolocation analyses',
    ],
    pipeline: [
      { title: 'Discovery', description: 'Continuous crawling of military, government, and news sources. New material scored for relevance and deduplicated.' },
      { title: 'Ingest', description: 'Documents cataloged by type, source, and date. Video and audio files preserved at original quality.' },
      { title: 'Transcription', description: 'Audio and video transcribed with OpenAI Whisper. Multi-language support for Farsi, Arabic, Hebrew, and English content.' },
      { title: 'Text Extraction', description: 'PDFs processed with PyMuPDF. Scanned documents OCR\'d with Tesseract.' },
      { title: 'Indexing', description: 'All text indexed in Meilisearch with filterable facets for collection, content type, date, and source.' },
      { title: 'P2P Distribution', description: 'Files published to Hyperdrives for decentralized, censorship-resistant replication.' },
    ],
    privacy:
      'This archive does not require an account, does not set tracking cookies, and does not log search queries. No analytics service is used. The P2P distribution layer uses end-to-end encrypted connections via the Noise protocol.',
    techStack: [
      { label: 'Frontend', value: 'Next.js + Tailwind CSS' },
      { label: 'Search', value: 'Meilisearch' },
      { label: 'Database', value: 'SQLite' },
      { label: 'Transcription', value: 'OpenAI Whisper' },
      { label: 'P2P', value: 'Hyperswarm + Hyperdrive' },
      { label: 'OCR', value: 'Tesseract + PyMuPDF' },
    ],
  },

  whySection: {
    heading: 'Why This Archive Exists',
    body: 'War generates an overwhelming volume of primary source material — combat footage, military communiqu\u00e9s, diplomatic records, intelligence assessments, congressional testimony. Most of it is scattered across government sites, social media, and news outlets. Footage gets deleted. Documents get buried. This archive collects it all into one searchable, censorship-resistant repository so the public record is preserved and accessible.',
  },

  footer: {
    tagline: 'Censorship-Resistant',
    disclaimer:
      'This archive is distributed via the Spill P2P network. Even if this server goes down, the data persists across peer nodes worldwide.',
    creditHtml:
      'This is a community-operated archive of publicly available records. All material is sourced from official government releases, public news coverage, and open-source documentation.',
    sourceLinks: [
      { label: 'CENTCOM Official', url: 'https://www.centcom.mil/' },
      { label: 'IAEA Iran Reports', url: 'https://www.iaea.org/newscenter/focus/iran/iaea-and-iran-iaea-board-reports' },
      { label: 'Internet Archive', url: 'https://archive.org/' },
    ],
  },

  torrent: {
    enabled: true,
  },

  upload: {
    enabled: true,
    maxSizeMB: 2000,
    allowedTypes: ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.mp3', '.wav', '.flac', '.m4a', '.ogg', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.rtf', '.eml', '.msg', '.ts', '.m3u8'],
  },

  documentViewer: {
    sourceLabel: 'View Original Source',
  },

  links: {
    github: 'https://github.com/myleshorton/spill',
    officialSource: 'https://www.centcom.mil/',
  },
}

export type SiteConfig = typeof siteConfig
