#!/bin/bash
#
# Download DOJ Epstein data sets, unpack, and run the full ingest pipeline.
#
# This script:
#   1. Downloads all 12 data sets from archive.org (~370GB)
#   2. Unpacks ZIPs into the Docker content-data volume
#   3. Runs catalog → text extraction → search indexing → embedding
#
# Usage:
#   ./load-data.sh [--datasets 1,2,3] [--skip-download] [--skip-ingest]
#
# Run inside a tmux/screen session — downloads will take hours.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOWNLOAD_DIR="/data/epstein-raw"
DATASETS="1,2,3,4,5,6,7,8,9,10,11,12"
SKIP_DOWNLOAD=false
SKIP_UNPACK=false
SKIP_INGEST=false
ARCHIVER_CONTAINER="deploy-archiver-1"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --datasets) DATASETS="$2"; shift 2 ;;
    --skip-download) SKIP_DOWNLOAD=true; shift ;;
    --skip-unpack) SKIP_UNPACK=true; shift ;;
    --skip-ingest) SKIP_INGEST=true; shift ;;
    --download-dir) DOWNLOAD_DIR="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 [--datasets 1,2,3] [--skip-download] [--skip-unpack] [--skip-ingest] [--download-dir /path]"
      echo ""
      echo "Options:"
      echo "  --datasets      Comma-separated list of data set numbers (default: all 1-12)"
      echo "  --skip-download Skip downloading, use existing files"
      echo "  --skip-unpack   Skip unpacking, use already-unpacked files"
      echo "  --skip-ingest   Download only, don't run ingest pipeline"
      echo "  --download-dir  Where to download ZIPs (default: /data/epstein-raw)"
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

IFS=',' read -ra DS_LIST <<< "$DATASETS"

echo "=== Epstein Files Data Loader ==="
echo "Data sets:    ${DS_LIST[*]}"
echo "Download dir: $DOWNLOAD_DIR"
echo "Skip download: $SKIP_DOWNLOAD"
echo "Skip unpack:   $SKIP_UNPACK"
echo "Skip ingest:   $SKIP_INGEST"
echo ""

# Check that Docker is running and the archiver container exists
if ! docker ps --format '{{.Names}}' | grep -q "$ARCHIVER_CONTAINER"; then
  echo "ERROR: Container '$ARCHIVER_CONTAINER' not running."
  echo "Start services first: cd $SCRIPT_DIR && docker compose up -d"
  exit 1
fi

# ── Step 1: Download ──────────────────────────────────────────────

if [ "$SKIP_DOWNLOAD" = false ]; then
  mkdir -p "$DOWNLOAD_DIR"
  echo "[1/4] Downloading data sets from archive.org..."
  echo ""

  for ds in "${DS_LIST[@]}"; do
    ZIP_FILE="$DOWNLOAD_DIR/ds${ds}.zip"

    # Skip files that are already fully downloaded (non-zero size)
    if [ -f "$ZIP_FILE" ] && [ -s "$ZIP_FILE" ]; then
      echo "  DS $ds: Already downloaded ($(du -h "$ZIP_FILE" | cut -f1)), resuming/verifying..."
    else
      echo "  DS $ds: Downloading..."
    fi

    # Try DOJ direct first, then archive.org mirrors
    DOJ_URL="https://www.justice.gov/epstein/files/DataSet%20${ds}.zip"
    ARCHIVE_URL1="https://archive.org/download/data-set-1/DataSet%20${ds}.zip"
    ARCHIVE_URL2="https://archive.org/download/data-set-${ds}/DataSet%20${ds}.zip"

    wget -c -q --show-progress "$DOJ_URL" -O "$ZIP_FILE" || {
      echo "  WARNING: DOJ download failed for DS $ds. Trying archive.org..."
      wget -c -q --show-progress "$ARCHIVE_URL1" -O "$ZIP_FILE" || {
        wget -c -q --show-progress "$ARCHIVE_URL2" -O "$ZIP_FILE" || {
          echo "  ERROR: DS $ds download failed from all URLs. Skipping."
          continue
        }
      }
    }

    echo "  DS $ds: Download complete ($(du -h "$ZIP_FILE" | cut -f1))"
  done
else
  echo "[1/4] Skipping download (--skip-download)"
fi

# ── Step 2: Unpack ──────────────────────────────────────────────

if [ "$SKIP_UNPACK" = false ]; then
  echo ""
  echo "[2/4] Unpacking into Docker volume..."
  echo ""

  for ds in "${DS_LIST[@]}"; do
    ZIP_FILE="$DOWNLOAD_DIR/ds${ds}.zip"
    if [ ! -f "$ZIP_FILE" ]; then
      echo "  DS $ds: No ZIP file, skipping unpack"
      continue
    fi

    # Unpack into a temp dir on the host, then copy into the Docker volume
    UNPACK_DIR="$DOWNLOAD_DIR/unpacked/ds${ds}"

    # Skip if already unpacked with files present
    if [ -d "$UNPACK_DIR" ] && [ "$(find "$UNPACK_DIR" -type f 2>/dev/null | head -1)" ]; then
      FILE_COUNT=$(find "$UNPACK_DIR" -type f | wc -l)
      echo "  DS $ds: Already unpacked ($FILE_COUNT files), copying into container..."
    else
      mkdir -p "$UNPACK_DIR"
      echo "  DS $ds: Unpacking..."
      unzip -o -q "$ZIP_FILE" -d "$UNPACK_DIR/"
      echo "  DS $ds: Unpacked ($(find "$UNPACK_DIR" -type f | wc -l) files)"
      echo "  DS $ds: Copying into container volume..."
    fi

    # Copy into the container's /data/raw/ds{N}/ path
    docker exec "$ARCHIVER_CONTAINER" mkdir -p "/data/raw/ds${ds}"
    docker cp "$UNPACK_DIR/." "$ARCHIVER_CONTAINER:/data/raw/ds${ds}/"
    echo "  DS $ds: Done"
  done
else
  echo "[2/4] Skipping unpack (--skip-unpack)"
fi

# ── Step 2: Ingest pipeline ──────────────────────────────────────

if [ "$SKIP_INGEST" = false ]; then
  echo ""
  echo "[3/4] Running ingest pipeline inside container..."
  echo ""

  echo "  Cataloging files..."
  docker exec "$ARCHIVER_CONTAINER" node /app/ingest/catalog.js --data-dir /data/raw

  echo ""
  echo "  Extracting text + generating thumbnails..."
  docker exec "$ARCHIVER_CONTAINER" node /app/ingest/ingest.js

  echo ""
  echo "  Indexing in Meilisearch..."
  docker exec "$ARCHIVER_CONTAINER" node /app/ingest/index-search.js

  echo ""
  echo "[4/4] Generating embeddings..."
  docker exec "$ARCHIVER_CONTAINER" node /app/ingest/embed.js
else
  echo "[3/4] Skipping ingest (--skip-ingest)"
  echo "[4/4] Skipping embeddings"
fi

echo ""
echo "=== Data Load Complete ==="
echo ""
echo "Disk usage:"
du -sh "$DOWNLOAD_DIR" 2>/dev/null || true
echo ""
echo "To clean up ZIP files and save space:"
echo "  rm -rf $DOWNLOAD_DIR/*.zip $DOWNLOAD_DIR/unpacked"
echo ""
echo "Your archive should now be live at https://\$(grep DOMAIN $SCRIPT_DIR/.env | cut -d= -f2)"
