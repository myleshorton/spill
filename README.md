# Samizdat

Censorship-resistant P2P video sharing platform built with Flutter and [Bare](https://github.com/nicolo-ribaudo/bare) (Holepunch).

## Prerequisites

- Flutter SDK (>= 3.10)
- Node.js / npm (for the Bare JS worklet)
- Xcode (for macOS builds)

## Build

| Command | What it does |
|---|---|
| `make` | Re-bundles JS + runs the macOS app |
| `make clean` | Removes **all** build artifacts (Flutter, JS bundle, native dylib, Xcode derived data) |
| `make bundle` | Re-bundles just the Bare JS worklet and copies to `assets/bare/` |
| `make native` | Rebuilds just the native C bridge dylib |
| `make run` | Same as `make` (alias) |

For a full rebuild from scratch:

```
make clean && make native && make
```

## Web Archiver

A server-side Node.js archiver joins the P2P network, downloads all content, indexes it into a searchable SQLite database, and serves a Flutter web UI.

### Prerequisites

- Node.js / npm (for the archiver server)
- Flutter SDK (>= 3.10)

### Setup & Run

```bash
# 1. Install archiver dependencies
make archiver-install

# 2. Build the Flutter web app
make web

# 3. Start the archiver (joins P2P network, serves web UI on :3000)
make archiver
```

Then open http://localhost:3000.

### Web Build Commands

| Command | What it does |
|---|---|
| `make archiver-install` | Installs npm dependencies in `archiver/` |
| `make web` | Builds the Flutter web app to `build/web/` |
| `make archiver` | Starts the archiver server on port 3000 |
