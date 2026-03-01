export const siteConfig = {
  name: 'My Archive',
  subtitle: 'Public Archive',
  badge: 'ARCHIVE',

  meta: {
    title: 'My Archive — Public Document Repository',
    description: 'Searchable, censorship-resistant document archive.',
    ogTitle: 'My Archive',
    ogDescription: 'Searchable public document archive.',
  },

  hero: {
    heading: 'My Archive',
    headingAccent: 'Public Archive',
    description: 'Searchable, censorship-resistant document archive. All files indexed and freely accessible.',
  },

  search: {
    placeholderSmall: 'Search documents...',
    placeholderLarge: 'Search all documents...',
  },

  sisterSites: [
    // { name: 'Epstein Files', url: 'https://epstein.spill.network' },
  ] as { name: string; url: string }[],

  dataSets: [] as { id: number; name: string; shortName: string; description: string; size: string }[],

  dataSetsIntro: {
    heading: 'Data Sets',
    description: 'Browse documents organized by data set.',
    browseHeading: 'Browse by Data Set',
    browseSummary: '{count} data sets available',
  },

  featuredSearches: [] as { label: string; query?: string; ds?: string; type?: string; iconName: string }[],

  categories: {} as Record<string, string>,

  contentTypes: {
    pdf: 'PDF Documents',
    image: 'Images',
    video: 'Videos',
    audio: 'Audio',
    email: 'Emails',
    spreadsheet: 'Spreadsheets',
  } as Record<string, string>,

  about: {
    intro: [
      'This archive makes public records genuinely accessible. Every document is indexed, searchable, and downloadable.',
    ],
    features: [
      { title: 'Full-Text Search', iconName: 'Search', description: 'Every document is OCR\'d and indexed with Meilisearch.' },
      { title: 'Censorship Resistant', iconName: 'Shield', description: 'Distributed via the Spill P2P network using Hyperswarm.' },
      { title: 'Document Viewer', iconName: 'FileText', description: 'PDFs, images, videos, and audio files viewable inline.' },
    ],
    dataSources: [] as string[],
    pipeline: [
      { title: 'Catalog', description: 'Every file cataloged by type, size, and data set membership.' },
      { title: 'Text Extraction', description: 'PDFs processed with PyMuPDF. Scanned documents OCR\'d with Tesseract.' },
      { title: 'Indexing', description: 'All extracted text indexed in Meilisearch.' },
      { title: 'P2P Distribution', description: 'Files published to Hyperdrives for decentralized replication.' },
    ],
    privacy:
      'This archive does not require an account, does not set tracking cookies, and does not log search queries.',
    techStack: [
      { label: 'Frontend', value: 'Next.js + Tailwind CSS' },
      { label: 'Search', value: 'Meilisearch' },
      { label: 'Database', value: 'SQLite' },
      { label: 'P2P', value: 'Hyperswarm + Hyperdrive' },
      { label: 'OCR', value: 'Tesseract + PyMuPDF' },
    ],
  },

  whySection: {
    heading: 'Why This Archive Exists',
    body: 'Public records should be genuinely accessible. This archive indexes every document, applies OCR, and makes everything searchable and freely downloadable.',
  },

  footer: {
    tagline: 'Censorship-Resistant',
    disclaimer: 'This archive is distributed via the Spill P2P network.',
    creditHtml: 'This is a community-operated transparency project.',
    sourceLinks: [] as { label: string; url: string }[],
  },

  torrent: {
    enabled: true,
  },

  upload: {
    enabled: true,
    maxSizeMB: 500,
    allowedTypes: ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.mp3', '.wav', '.flac', '.m4a', '.ogg', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.rtf', '.eml', '.msg'],
  },

  documentViewer: {
    sourceLabel: 'View Original Source',
  },

  links: {
    github: 'https://github.com/myleshorton/spill',
    officialSource: '',
  },
}

export type SiteConfig = typeof siteConfig
