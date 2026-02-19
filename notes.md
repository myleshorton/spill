To set up local code signing, run:

```
xcrun notarytool store-credentials samizdat
```

⏺ Here's how the diagram compares to the actual system:

  What's accurate

  - One Hyperdrive per creator/publisher — correct (especially after our changes)
  - Hyperswarm DHT for peer discovery — correct, nodes join a shared topic and find each other
  - Video files stored in the Hyperdrive — correct, files like /videos/<id>.mp4 and /thumbs/<id>.jpg
  - Viewer nodes opening the creator's drive by public key — correct
  - Viewers can serve blocks to other viewers — correct (now that drives are cached)

  What's different

  1. No Hyperbee for metadata. The diagram shows a "Metadata Hyperbee (DB: Titles, Thumbnails)." In reality, metadata is exchanged via a Hypercore (append-only log) called the "catalog" (store.get({ name:
  'samizdat-catalog' })). Each node appends JSON entries to it. Peers exchange catalog keys over a Protomux channel (protocol samizdat/catalog), not via the DHT directly.
  2. No block-level streaming. The diagram shows sparse block-by-block fetching (blocks 1-10, cached blocks vs sparse). The bare client actually calls drive.get(videoKey) which downloads the entire file into a
  single buffer, then writes it to disk. The archiver's API does use drive.createReadStream() with range support for HTTP streaming, but the bare client doesn't.
  3. No Discovery Registry / Search. The bottom of the diagram shows a "Discovery Registry (Optional Hyperbee)" for search queries. This doesn't exist in the code — discovery happens purely through catalog exchange
   when peers connect on the shared swarm topic.
  4. Discovery flow is different. The diagram shows "Announce Channel Key" to the DHT and "Lookup Channel Key" from the DHT. In reality, all nodes join one shared topic (crypto.hash('samizdat-global-feed')). When
  they connect, they exchange catalog Hypercore keys over Protomux. The drive keys are embedded inside catalog entries, not announced to the DHT separately.
  5. Naming. The diagram says "PearTube" / "Pear SDK" — the project is Samizdat, built on raw Hyperswarm/Hyperdrive/Hypercore (not the Pear SDK wrapper).

  In short

  The diagram is a reasonable conceptual model of what the system could become, but it overstates the current implementation in two key areas: it shows block-level sparse streaming (not implemented on the bare
  client) and a Hyperbee-based metadata/search layer (the system uses a simpler Hypercore append log with no search).


Architecture Notes:

1. Archiver fan-out (the biggest problem)

  Hypercore replication is per-connection. Each peer that wants blocks from a drive opens a direct replication stream to a peer that has them. With millions of users and a handful of archivers, every uncached video
   request ultimately funnels to one of those few archivers. There's no CDN-like fan-out — an archiver serving a popular video must maintain a separate replication stream per requesting peer simultaneously.

  2. Leechers don't automatically become seeders

  In video-manager.js:90-108, fetch() downloads the file via drive.get() and writes it to a local filesystem path — it doesn't persist the data back into the Corestore in a way that makes this peer a seeder. The
  drive is opened (openDrive) for replication during the session, but the fetched blocks are only in-memory/ephemeral corestore storage. Once the app closes, that peer stops contributing. With millions of users,
  you have a massive leecher pool and a tiny seeder pool that never grows organically.

  3. Catalog feed is a single append-only log

  FeedManager maintains a shared Hypercore for video discovery. Every published video appends to this log, and every peer replicates the entire catalog. At millions of users publishing content, this feed grows
  unboundedly. Every new peer must download the full history before they can see any videos. There's no sharding, pagination, or topic-based partitioning.

  4. DHT concentration / hot-key problem

  Hyperswarm's DHT distributes peer lookups, but when a video goes viral, millions of peers look up the same drive key. The DHT nodes responsible for that key's hash neighborhood become hotspots. Then all those
  millions of peers discover the same handful of archivers and try to connect simultaneously.

  5. Base64 over IPC for streaming (new code)

  The range-streaming path in readVideoRange returns Buffer.concat(chunks).toString('base64') — a 33% size inflation on every range request, plus the cost of encoding/decoding. This is fine per-client, but the
  archiver-side implication is that the bare runtime is doing base64 encoding for every range request from every connected peer (indirectly, via the Dart server proxying to it). The IPC channel becomes a
  serialization bottleneck under high concurrency.

  6. No deduplication across drives

  Each publisher gets their own Hyperdrive (samizdat-local). If 1,000 users re-publish the same video, it exists as 1,000 independent drive entries with different keys. Archivers must store and seed all 1,000
  copies. There's no content-addressed deduplication (like IPFS CIDs) across drives.

  7. Background fetch doubles archiver load

  In player_screen.dart:67-71, when streaming via the range server, a fire-and-forget fetchVideo() also runs to cache the full file. This means archivers serve the same video twice to each peer: once via range
  requests for playback, and once as a full bulk download for caching. At scale, this doubles bandwidth demand on the already-overloaded archivers.

  8. Connection/memory limits on archivers

  Each replication stream maintains Hypercore protocol state (encryption handshake, bitfield, request queues). Millions of concurrent connections would exhaust file descriptors and memory on archiver nodes long
  before bandwidth becomes the limit.

  ---
  What would help: Peers re-seeding after fetch (turning leechers into seeders), catalog sharding/pagination, content-addressed dedup, a gossip protocol for popular content diffusion, and connection limits with a
  prioritization strategy on archivers.


  1. Tail-first sync (easiest, biggest immediate impact)

  Hypercore supports sparse reads — core.get(i) can fetch any block without downloading all preceding blocks. Instead of reading catalogs from index 0 forward, read from the end backward. A new peer sees the newest
   content within seconds, then backfills older entries lazily.

  This fits the existing architecture with minimal changes — just reverse the read direction in _readNewEntries and _watchCatalog, and cap initial reads to the last N entries.

  2. Topic-based swarm sharding

  Right now everyone joins one DHT topic (samizdat-global-feed). Instead, derive multiple topics from content categories or tags. A peer interested in "news" joins the news topic and only discovers/replicates
  catalogs from that sub-swarm.

  The tradeoff is discoverability — how does a new user find which topics exist? You'd need a lightweight "topic directory" or well-known defaults. But it reduces catalog replication from "everything in the
  network" to "everything in your interests."

  3. Bounded catalog window with eviction

  Treat catalogs as sliding windows. Each node's catalog only advertises content from the last N days (or last N entries). Old entries still exist in the Hypercore but peers don't bother syncing past the window
  boundary. Content remains accessible by drive key — it's just not discoverable through the catalog after it ages out.

  This caps the per-catalog sync cost at a fixed bound regardless of how long the network has existed.

  4. Gossip summarization instead of full replication

  Instead of replicating every remote catalog entry, peers exchange compact summaries — bloom filters or small "top-N recent" lists over the Protomux channel. A peer only fetches the full catalog entry for content
  it hasn't seen (checked via the bloom filter) or that matches a query.

  This changes catalog exchange from O(total entries) bandwidth to O(summary size) per connection, with selective fetches for new items.

  5. Two-tier discovery (index nodes)

  Designate some nodes (archivers or volunteer "indexers") as discovery hubs. Regular peers query an indexer for "what's new since timestamp X" rather than replicating catalogs from every peer they connect to.
  Indexers replicate the full catalog set; regular peers get paginated query results.

  This trades some decentralization for practical scalability. It's how most real P2P systems work at scale (BitTorrent trackers, IPFS pinning services, etc.).

  ---
  My recommendation: Start with #1 (tail-first sync) because it's a small change that eliminates the worst symptom — new peers waiting forever before seeing content. Then layer on #3 (bounded window) to cap growth.
   Those two together handle millions of users with minimal architectural change. Topics (#2) and gossip (#4) are the next steps if the network genuinely reaches the point where peer connection count itself becomes
   the bottleneck.

  Want me to implement tail-first sync?

  How the three mechanisms layer together
  ┌─────────────────┬──────────────────────────────────────┬─────────────────────────┐
  │    Mechanism    │            What it bounds            │          Scope          │
  ├─────────────────┼──────────────────────────────────────┼─────────────────────────┤
  │ Tail-first sync │ Hypercore blocks fetched per catalog │ Network I/O             │
  ├─────────────────┼──────────────────────────────────────┼─────────────────────────┤
  │ Time window     │ Which fetched entries are accepted   │ Stale content filtering │
  ├─────────────────┼──────────────────────────────────────┼─────────────────────────┤
  │ In-memory cap   │ knownVideos array size               │ Memory usage            │
  └─────────────────┴──────────────────────────────────────┴─────────────────────────┘
  A new peer connecting to a prolific publisher with 10,000 catalog entries: fetches the last 50 blocks (tail-first), drops any older than 30 days (time window), and the total discovery list never exceeds 500
  entries (cap). The Hypercore itself is untouched — old entries still exist and content remains accessible by drive key.
