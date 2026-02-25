export const siteConfig = {
  name: 'Epstein Files',
  subtitle: 'Public Archive',
  badge: 'ARCHIVE',

  meta: {
    title: 'Epstein Files Archive — Public DOJ Document Repository',
    description:
      'Searchable, censorship-resistant archive of 370GB+ of Jeffrey Epstein DOJ document releases. Court records, FBI reports, emails, financial documents, and more — distributed via P2P.',
    ogTitle: 'Epstein Files Archive',
    ogDescription:
      'Searchable public archive of DOJ Epstein document releases. 1.4M+ files, 3.5M+ pages.',
  },

  hero: {
    heading: 'Epstein Files',
    headingAccent: 'Public Archive',
    description:
      "Searchable, censorship-resistant archive of the DOJ's Jeffrey Epstein document releases. Court records, FBI reports, emails, financial documents, and seized media \u2014 all indexed and freely accessible.",
  },

  search: {
    placeholderSmall: 'Search documents, names, emails, flight logs...',
    placeholderLarge: 'Search 1.4M+ files \u2014 names, places, dates, keywords...',
  },

  dataSets: [
    { id: 1, name: 'FBI Interview Summaries (Part 1)', shortName: 'FBI Interview Summaries (Part 1)', description: 'FBI interview summaries from the Palm Beach investigation (2005-2008). Witness statements and investigative notes.', size: '~2.5GB' },
    { id: 2, name: 'FBI Interview Summaries (Part 2)', shortName: 'FBI Interview Summaries (Part 2)', description: 'Continuation of FBI interview summaries. Additional witness accounts and cross-references.', size: '~2.1GB' },
    { id: 3, name: 'Palm Beach Police Reports (Part 1)', shortName: 'Palm Beach Police Reports (Part 1)', description: 'Palm Beach Police Department reports from the initial investigation. Incident reports, officer statements.', size: '~3.2GB' },
    { id: 4, name: 'Palm Beach Police Reports (Part 2)', shortName: 'Palm Beach Police Reports (Part 2)', description: 'Additional Palm Beach police documentation. Surveillance records and patrol reports.', size: '~2.8GB' },
    { id: 5, name: 'Grand Jury Materials', shortName: 'Grand Jury Materials', description: 'Grand jury materials including testimony transcripts and evidentiary exhibits.', size: '~1.5GB' },
    { id: 6, name: 'Victim Statements & Depositions', shortName: 'Victim Statements & Depositions', description: 'Victim impact statements, depositions, and related court filings.', size: '~0.8GB' },
    { id: 7, name: 'Search Warrants & Seizure Records', shortName: 'Search Warrants & Seizure Records', description: 'Search warrant applications, execution records, and property seizure inventories.', size: '~0.4GB' },
    { id: 8, name: 'Prosecution Memoranda', shortName: 'Prosecution Memoranda', description: 'Internal DOJ prosecution memoranda, case strategy documents, and legal analysis.', size: '~0.3GB' },
    { id: 9, name: 'Emails & DOJ Correspondence', shortName: 'Emails & DOJ Correspondence', description: 'Email correspondence between DOJ officials, the non-prosecution agreement, and related communications. ~181GB.', size: '~181GB' },
    { id: 10, name: 'Seized Images & Videos', shortName: 'Seized Images & Videos', description: 'Approximately 180,000 images and 2,000 videos seized from Epstein properties. ~78.6GB.', size: '~78.6GB' },
    { id: 11, name: 'Financial Records & Flight Logs', shortName: 'Financial Records & Flight Logs', description: 'Financial ledgers, bank records, flight manifests (including Lolita Express logs), and property seizure records. ~25.5GB.', size: '~25.5GB' },
    { id: 12, name: 'Supplemental Productions', shortName: 'Supplemental Productions', description: 'Late-produced supplemental items, errata, and additional materials. ~114MB.', size: '~114MB' },
  ],

  dataSetsIntro: {
    heading: 'Data Sets',
    description: 'The DOJ released Epstein investigation materials in {count} data sets, totaling approximately 370GB. Each set covers a different facet of the investigation.',
    browseHeading: 'Browse by Data Set',
    browseSummary: '{count} data sets released by the DOJ, totaling ~370GB',
  },

  featuredSearches: [
    { label: 'Flight Logs', query: 'flight log manifest', iconName: 'Plane' as const },
    { label: 'Financial Records', query: 'bank account wire transfer', iconName: 'DollarSign' as const },
    { label: 'Email Correspondence', query: 'email correspondence', iconName: 'Mail' as const },
    { label: 'FBI Interviews', query: 'FBI interview summary', iconName: 'FileText' as const },
    { label: 'Photographs', query: 'photograph image seized', iconName: 'Image' as const },
    { label: 'Video Evidence', query: 'video recording', iconName: 'Video' as const },
  ],

  categories: {
    court_record: 'Court Records',
    fbi_report: 'FBI Reports',
    email: 'Email Correspondence',
    financial: 'Financial Records',
    flight_log: 'Flight Logs',
    photo: 'Photographs',
    video: 'Video Evidence',
    deposition: 'Depositions',
    police_report: 'Police Reports',
  } as Record<string, string>,

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
      'In 2025, the U.S. Department of Justice released over 370 gigabytes of documents related to the investigation of Jeffrey Epstein. These {count} data sets contain approximately 1.4 million files spanning 3.5 million pages \u2014 FBI interview summaries, police reports, emails, financial records, flight manifests, seized photographs and videos, and more.',
      "This archive exists to make these public records genuinely accessible. Raw document dumps are functionally opaque to most people. We've indexed every file, applied OCR to scanned documents, and built full-text search across the entire collection. Every document is browsable, searchable, and downloadable.",
    ],
    features: [
      { title: 'Full-Text Search', iconName: 'Search', description: 'Every document is OCR\'d and indexed with Meilisearch. Search across 3.5 million pages with typo tolerance, faceted filtering by data set and file type, and sub-200ms results.' },
      { title: 'Censorship Resistant', iconName: 'Shield', description: 'The archive is distributed via the Spill P2P network using Hyperswarm. If this server goes offline, other peer nodes retain full copies of the data.' },
      { title: 'Document Viewer', iconName: 'FileText', description: 'PDFs render inline with PDF.js. Images, videos, and audio files play natively. Extracted text is available for every document for accessibility and copy-paste.' },
      { title: 'Open Source', iconName: 'Globe', description: 'The archive software, ingest pipeline, and P2P distribution layer are all open source. Anyone can run their own mirror or contribute improvements.' },
    ],
    dataSources: [
      'U.S. Department of Justice official release',
      'Internet Archive community mirrors',
      'BitTorrent community distribution',
    ],
    pipeline: [
      { title: 'Download', description: 'All {count} data sets downloaded via BitTorrent and verified against published checksums.' },
      { title: 'Catalog', description: 'Every file cataloged by type, size, and data set membership. File types detected by extension and magic bytes.' },
      { title: 'Text Extraction', description: 'Text-layer PDFs processed with PyMuPDF. Scanned documents OCR\'d with Tesseract. Emails and spreadsheets parsed for content.' },
      { title: 'Thumbnail Generation', description: 'PDF pages, images, and video frames thumbnailed for visual browsing.' },
      { title: 'Indexing', description: 'All extracted text indexed in Meilisearch with filterable facets for data set, file type, and category.' },
      { title: 'P2P Distribution', description: 'Files published to Hyperdrives and announced on the Spill network for decentralized replication.' },
    ],
    privacy:
      "This archive does not require an account, does not set tracking cookies, and does not log search queries. No analytics service is used. The site is served over HTTPS with a Let's Encrypt certificate. The P2P distribution layer uses end-to-end encrypted connections via the Noise protocol.",
    techStack: [
      { label: 'Frontend', value: 'Next.js + Tailwind CSS' },
      { label: 'Search', value: 'Meilisearch' },
      { label: 'Database', value: 'SQLite' },
      { label: 'P2P', value: 'Hyperswarm + Hyperdrive' },
      { label: 'OCR', value: 'Tesseract + PyMuPDF' },
      { label: 'Hosting', value: 'Hetzner Dedicated' },
    ],
  },

  whySection: {
    heading: 'Why This Archive Exists',
    body: 'In 2025, the Department of Justice released over 370GB of documents related to the Jeffrey Epstein investigation. These are public records \u2014 yet their sheer volume makes them difficult to navigate. This archive indexes every document, applies OCR to scanned pages, and makes everything searchable. It\u2019s distributed via P2P so no single entity can take it offline.',
  },

  footer: {
    tagline: 'Censorship-Resistant',
    disclaimer:
      'This archive is distributed via the Spill P2P network. Even if this server goes down, the data persists across peer nodes worldwide.',
    creditHtml:
      'All documents in this archive are public records released by the U.S. Department of Justice. This is a community-operated transparency project.',
    sourceLinks: [
      { label: 'DOJ Official Release', url: 'https://www.justice.gov/' },
      { label: 'Internet Archive Mirror', url: 'https://archive.org/' },
    ],
  },

  documentViewer: {
    sourceLabel: 'View on DOJ Site',
  },

  links: {
    github: 'https://github.com/myleshorton/spill',
    officialSource: 'https://www.justice.gov/',
  },
}

export type SiteConfig = typeof siteConfig
