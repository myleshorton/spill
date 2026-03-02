# Spill

Censorship-resistant P2P content distribution platform. Spill combines a desktop publishing app, a web archive framework, a document crawler, and BitTorrent seeding into a single system designed to make information impossible to suppress.

The first deployment is the **Epstein Files Archive** — a searchable, P2P-distributed archive of 370GB+ of DOJ document releases.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     spill.network                           │
│                   (Next.js / Cloudflare)                    │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐     Hyperswarm DHT      ┌──────────────────┐
│  Desktop App │◄───────────────────────►│  Archiver Node   │
│   (Flutter)  │  Hyperdrive replication  │   (Node.js)      │
│              │  Protomux channels       │                  │
│  Bare runtime│                          │  ┌────────────┐  │
│  Hyperswarm  │                          │  │  SQLite DB  │  │
│  Hyperdrive  │                          │  │ Meilisearch │  │
│  Hyperbee    │                          │  │ Transmission│  │
└──────────────┘                          │  │   ClamAV    │  │
                                          │  └────────────┘  │
                                          └────────┬─────────┘
                                                   │ REST API
┌──────────────┐                          ┌────────▼─────────┐
│   Crawler    │─── upload pipeline ────►│    Frontend       │
│  (Node.js)   │                          │   (Next.js)       │
│  adapters:   │                          │  search, viewer,  │
│  court, gov, │                          │  torrent links    │
│  news, web   │                          └──────────────────┘
└──────────────┘
```

### Desktop App (root)

Flutter app for macOS/mobile/web. Users publish and consume content over a P2P network powered by the [Holepunch](https://holepunch.to/) stack.

- **Bare runtime** — JavaScript VM running in a native C bridge (`native/`), handles all P2P networking
- **Hyperswarm** — DHT-based peer discovery and NAT traversal (fixed port 49737)
- **Hyperdrive** — Distributed filesystem for content storage and replication
- **Hyperbee** — B-tree index on Hypercore for catalog metadata
- **Protomux** — Multiplexed RPC channels for catalog exchange and search

**P2P data flow:** All nodes join a shared DHT topic. When peers connect, they exchange Hyperbee catalog keys via a Protomux channel. Each publisher owns a Hyperdrive; drive keys are embedded in catalog entries. Content replicates automatically across peers. New peers sync the most recent entries first (tail-first), then backfill.

```
lib/
  ├── screens/           UI screens
  ├── widgets/           reusable components
  ├── services/          P2P service, Bare bridge
  ├── models/            data models
  └── theme/             design system
bare/
  └── lib/
      ├── feed-manager.js      Hyperbee catalog
      ├── video-manager.js     Hyperdrive content
      ├── swarm-manager.js     Hyperswarm networking
      ├── search-manager.js    distributed search
      ├── identity-manager.js  key generation
      └── rpc-handler.js       JSON-RPC over IPC
native/
  └── samizdat_bridge.c        C bridge (Dart FFI → Bare)
```

### Archiver (`archiver/`)

Server-side Node.js process that joins the P2P swarm, discovers and downloads all published content, indexes it into a searchable database, and serves it over HTTP and BitTorrent.

**Services:**
- **P2P archiver** — joins the swarm, watches remote catalogs, downloads content to local storage
- **REST API** — documents, search, datasets, video, uploads, torrents
- **SQLite** — document and video metadata (better-sqlite3)
- **Meilisearch** — full-text search with faceted filtering
- **ClamAV** — virus scanning for all uploads
- **Transmission** — BitTorrent seeding with WebSeed URLs

**Upload pipeline** (web uploads and crawler output both flow through this):

1. File saved to disk (multer, 500MB max)
2. SHA256 hash → dedup check
3. ClamAV virus scan
4. Text extraction (pdf-parse, Tesseract OCR)
5. Thumbnail generation (Sharp, PDF.js)
6. Insert into SQLite
7. Index in Meilisearch
8. Publish to P2P network (Hyperdrive)
9. Create .torrent → add to Transmission

### Frontend (`frontend/`)

Next.js 14 web app for browsing and searching the archive. Proxies API calls to the archiver.

- Full-text search with dataset/type/category facets
- Inline PDF viewer (PDF.js), video/audio player, image viewer
- Torrent download and magnet link generation
- Drag-and-drop upload with progress tracking
- Site configuration system — framework ships with generic config; specific deployments (e.g., Epstein archive) override via `site.config.ts`

### Crawler (`crawler/`)

Automated document discovery engine. Continuously crawls court dockets, government sites, news outlets, and web archives for relevant documents.

```
crawler/lib/
  ├── crawl-db.js          SQLite crawl queue
  ├── fetcher.js           HTTP client with cache
  ├── scheduler.js         worker pool + queue
  ├── relevance.js         scoring engine (0.0–1.0)
  └── adapters/
      ├── court.js         CourtListener, PACER
      ├── government.js    FBI Vault, DOJ
      ├── archive-org.js   Internet Archive
      ├── news.js          news sites
      └── generic.js       default link extraction
```

Scoring considers keyword matches, source reputation (court > government > news > generic), content type (PDFs, emails ranked higher), and domain-specific signals. Documents scoring above threshold are passed to the archiver's upload pipeline.

### Ingest Pipeline (`ingest/`)

Batch processing for initial data loads. Walks a filesystem of raw documents, extracts text, generates thumbnails, and indexes everything.

```bash
node ingest/catalog.js        # walk /data/raw/, insert into SQLite
node ingest/ingest.js         # extract text, generate thumbnails
node ingest/index-search.js   # batch index in Meilisearch
node ingest/embed.js          # (optional) OpenAI embeddings
```

### Website (`website/`)

Marketing site for spill.network. Next.js with Framer Motion, deployed to Cloudflare Pages.

### MIRAGE Protocol (`protocol-spec/`)

Censorship circumvention transport protocol — Multiplexed Indistinguishable Relaying with Adaptive Gateway Emulation. Designed for the WATER (WebAssembly Transport Executables Runtime) framework. Operates as an authenticated overlay within genuine CDN-terminated TLS, with HTTP/2 semantic conformance to defeat deep packet inspection. Spec complete; implementation in progress.

### Site Configuration (`epstein-files/`)

Site-specific overrides for the Epstein Files deployment. Contains `site.config.ts` and `archive-config.json` with dataset definitions, branding, and seed URLs. The framework is designed so any document archive can be deployed by providing a new site config.

---

## Build

### Desktop App

| Command | Description |
|---|---|
| `make` | Bundle JS + run macOS app |
| `make clean` | Remove all build artifacts |
| `make bundle` | Re-bundle Bare JS worklet → `assets/bare/` |
| `make native` | Rebuild native C bridge dylib |
| `make release` | Signed + notarized DMG |

Full rebuild: `make clean && make native && make`

### Web Archive (local dev)

```bash
make archiver-install   # install archiver npm deps
make web                # build Flutter web UI
make archiver           # start archiver on :3000
```

### Docker Deployment

```bash
cd deploy
./setup.sh --domain example.com --email admin@example.com --site-repo https://github.com/org/site-config.git
docker compose up -d
```

**Services:**

| Service | Port | Role |
|---|---|---|
| archiver | 4000 | P2P + REST API |
| frontend | 3000 | Next.js web UI |
| meilisearch | 7700 | search engine |
| transmission | 51413 | BitTorrent seeding |
| clamav | — | virus scanning |
| crawler | — | document discovery |
| nginx | 80, 443 | reverse proxy + TLS |
| certbot | — | Let's Encrypt |

---

## Prerequisites

- Flutter SDK (>= 3.10)
- Node.js / npm
- Xcode (for macOS builds)
- Docker + Docker Compose (for server deployment)
