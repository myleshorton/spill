# Spill Archive — Architecture Reference

## Services (Docker Compose in deploy/)

| Service | Port | Purpose |
|---------|------|---------|
| **archiver** | 4000 (+ 49737 UDP) | Express.js API server, P2P worker, main backend |
| **frontend** | 3000 | Next.js 14 React app |
| **crawler** | — | Background document discovery from 70+ sources |
| **meilisearch** | 7700 | Full-text search engine (v1.7) |
| **transmission** | 51413 UDP | Torrent seeding |
| **clamav** | 3310 | Virus scanning |
| **nginx** | 80, 443 | Reverse proxy + SSL |
| **certbot** | — | SSL cert renewal |

## Key Paths (Inside Containers)

- DBs: `/app/archiver/data/` → `documents.db`, `archive.db`, `users.db`
- Crawl DB: crawler has its own `crawl.db`
- Content files: `/data/content/`
- Thumbnails: `/data/thumbnails/`
- Env vars: `.env` → `OPENAI_API_KEY`, `MEILI_API_KEY`, `DOMAIN`

## Databases

### documents.db (PRIMARY)
- `documents` — id (SHA256), title, file_name, data_set, content_type, category, extracted_text, transcript, source_url, embedding, image_keywords, location_*, media_date, etc.
- `collections` — torrent collections
- `entities` — extracted named entities (created lazily)
- `document_entities` — many-to-many link
- `financial_records` — extracted financial data

### archive.db — Legacy P2P video metadata + FTS5
### users.db — User accounts, view history, favorites
### crawl.db — URL queue, domain rate limits

## Transcription Flow

1. Triggered by: crawler content processing, upload processing, or batch `ingest/ingest.js`
2. Backend priority: OpenAI Whisper API (`OPENAI_API_KEY`) > whisper.cpp (`WHISPER_CPP_PATH`) > skip
3. Process: ffprobe duration → split 10-min chunks via ffmpeg (16kHz mono WAV) → Whisper API/cpp → concatenate
4. Stored in `documents.transcript` column + indexed in Meilisearch

## Document Lifecycle

```
seeds.json → crawler seed → crawl.db queue
  → fetch (rate-limited per domain)
  → relevance score (≥0.3 threshold)
  → content process: SHA256 dedup, text extract, transcribe, thumbnail
  → insert documents.db + index meilisearch
  → entity/financial extraction (optional)
```

## Docker Commands

```bash
# All from deploy/ directory
docker compose up -d
docker compose logs -f archiver
docker compose logs -f crawler
docker compose exec archiver node -e "..."   # Query archiver DB
docker compose exec crawler node index.js status  # Crawl stats
```

## API Endpoints (archiver:4000)

- `GET /api/documents` — list/filter
- `GET /api/documents/search` — Meilisearch FTS
- `GET /api/documents/:id/content` — file download
- `GET /api/documents/:id/transcript` — transcription text
- `GET /api/activity` — live stats (WIP, uncommitted)
- `POST /api/upload` — file upload (rate limited, virus scanned)
- `GET /api/stats`, `/api/datasets`, `/api/collections`, `/api/entities`

## Frontend Stack
- Next.js 14, React 18, TypeScript, TailwindCSS
- Cytoscape (entity graph), Leaflet (map), Vis Timeline
- API client in `frontend/src/lib/api.ts`

## Key Code Locations
- `archiver/index.js` — main entry, spawns p2p-worker
- `archiver/lib/documents-db.js` — DocumentsDatabase class
- `archiver/lib/documents-api.js` — /api/documents routes
- `crawler/index.js` — CLI: seed/run/status/reset
- `crawler/lib/content-processor.js` — relevance, text, transcribe, thumbnail
- `ingest/ingest.js` — batch processing entry point
- `ingest/lib/transcriber.js` — Whisper transcription logic
- `deploy/docker-compose.yml` — all service definitions
