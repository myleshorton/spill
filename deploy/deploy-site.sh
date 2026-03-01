#!/bin/bash
# Usage: ./deploy-site.sh <site-name>
# Deploys a site using sites/<name>/ config directory.
#
# Example:
#   ./deploy-site.sh epstein
#
# This sets SITE_CONFIG, ARCHIVE_CONFIG, and SEEDS_FILE from the
# sites/<name>/ directory and builds/deploys the full stack.

set -euo pipefail

SITE="${1:?Usage: $0 <site-name>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SITE_DIR="$REPO_ROOT/sites/$SITE"

if [ ! -d "$SITE_DIR" ]; then
  echo "Error: Site directory not found: $SITE_DIR"
  echo "Available sites:"
  ls -1 "$REPO_ROOT/sites/" 2>/dev/null | grep -v '^_' || echo "  (none)"
  exit 1
fi

echo "Deploying site: $SITE"
echo "  Config dir: $SITE_DIR"

# Set environment for docker compose
export SITE_CONFIG="../../sites/$SITE/site.config.ts"
export ARCHIVE_CONFIG="$SITE_DIR/archive-config.json"
export SEEDS_FILE="../../sites/$SITE/seeds.json"

echo "  SITE_CONFIG=$SITE_CONFIG"
echo "  ARCHIVE_CONFIG=$ARCHIVE_CONFIG"
echo "  SEEDS_FILE=$SEEDS_FILE"
echo ""

cd "$SCRIPT_DIR"

echo "Building images..."
docker compose build \
  --build-arg SITE_CONFIG="$SITE_CONFIG" \
  --build-arg SEEDS_FILE="$SEEDS_FILE"

echo "Starting services..."
docker compose up -d

echo ""
echo "Site '$SITE' deployed successfully."
