# Pending Deploys

## Live Activity Feed (2026-02-28)

New feature: live activity ticker on the homepage showing real-time archive activity
(documents found, transcriptions, entity extraction, etc.) with witty ambient messages.

### Changed files

- `archiver/lib/documents-db.js` — added `activitySnapshot()` method
- `archiver/lib/documents-api.js` — added `GET /activity` endpoint
- `frontend/src/lib/api.ts` — added `ActivityData` type + `getActivity()`
- `frontend/src/hooks/useActivityFeed.ts` — new polling hook + message generation
- `frontend/src/components/ActivityFeed.tsx` — new ticker component
- `frontend/src/app/page.tsx` — renders ActivityFeed below StatsBar
- `frontend/src/components/Header.tsx` — pulsing green dot on logo

### Deploy steps

Requires rebuilding both **frontend** and **archiver** containers.
Crawler, meilisearch, nginx, transmission, and clamav are untouched.

```bash
cd /opt/spill-archive/deploy
docker compose build --no-cache frontend archiver
docker compose up -d frontend archiver
```

### Verification

1. `curl localhost:4000/api/activity` returns JSON with totals + deltas
2. Homepage shows pulsing ticker below stats with cycling messages
3. Header logo has pulsing green dot on all pages
4. When crawler/transcription active, real delta messages appear
5. When idle, ambient messages cycle through totals
