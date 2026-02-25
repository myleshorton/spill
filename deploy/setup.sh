#!/bin/bash
#
# Server setup script for Spill Archive
# Run on a fresh server (Ubuntu 22.04+)
#
# Usage: ./setup.sh --domain example.org --email admin@example.org [--site-repo https://github.com/org/site-config.git]
#
set -euo pipefail

# Parse arguments
DOMAIN=""
EMAIL=""
SITE_REPO=""
FRAMEWORK_REPO="https://github.com/myleshorton/spill.git"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --site-repo) SITE_REPO="$2"; shift 2 ;;
    --framework-repo) FRAMEWORK_REPO="$2"; shift 2 ;;
    *)
      # Positional fallback for backward compatibility
      if [ -z "$DOMAIN" ]; then DOMAIN="$1"
      elif [ -z "$EMAIL" ]; then EMAIL="$1"
      else echo "Unknown argument: $1"; exit 1
      fi
      shift ;;
  esac
done

if [ -z "$DOMAIN" ]; then
  echo "Usage: $0 --domain example.org --email admin@example.org [--site-repo URL]"
  exit 1
fi
EMAIL="${EMAIL:-admin@${DOMAIN}}"

echo "=== Spill Archive — Server Setup ==="
echo "Domain:    $DOMAIN"
echo "Email:     $EMAIL"
echo "Framework: $FRAMEWORK_REPO"
echo "Site repo: ${SITE_REPO:-none (using defaults)}"
echo ""

# System updates
echo "[1/8] Updating system..."
apt-get update && apt-get upgrade -y
apt-get install -y curl git docker.io docker-compose-plugin gettext-base

# Enable Docker
systemctl enable docker
systemctl start docker

# Clone framework repo
FRAMEWORK_DIR="/opt/spill-archive"
if [ ! -d "$FRAMEWORK_DIR" ]; then
  echo "[2/8] Cloning framework repository..."
  git clone "$FRAMEWORK_REPO" "$FRAMEWORK_DIR"
else
  echo "[2/8] Framework repo exists, pulling latest..."
  cd "$FRAMEWORK_DIR" && git pull
fi

# Clone site repo (optional)
SITE_DIR="/opt/site-config"
if [ -n "$SITE_REPO" ]; then
  if [ ! -d "$SITE_DIR" ]; then
    echo "[3/8] Cloning site config repository..."
    git clone "$SITE_REPO" "$SITE_DIR"
  else
    echo "[3/8] Site config exists, pulling latest..."
    cd "$SITE_DIR" && git pull
  fi
else
  echo "[3/8] No site repo — using framework defaults"
fi

cd "$FRAMEWORK_DIR"

# Create data directories
echo "[4/8] Creating data directories..."
mkdir -p /data/raw /data/thumbs
mkdir -p deploy/certbot/conf deploy/certbot/www

# Generate env file
echo "[5/8] Generating environment..."
MEILI_KEY=$(openssl rand -hex 32)
cat > deploy/.env <<ENVEOF
DOMAIN=$DOMAIN
MEILI_API_KEY=$MEILI_KEY
ENVEOF

# Add site config paths if site repo exists
if [ -n "$SITE_REPO" ] && [ -d "$SITE_DIR" ]; then
  if [ -f "$SITE_DIR/site.config.ts" ]; then
    echo "SITE_CONFIG=$SITE_DIR/site.config.ts" >> deploy/.env
  fi
  if [ -f "$SITE_DIR/archive-config.json" ]; then
    echo "ARCHIVE_CONFIG=$SITE_DIR/archive-config.json" >> deploy/.env
  fi
fi

# SSL certificate
echo "[6/8] Obtaining SSL certificate..."
docker run --rm \
  -v "$FRAMEWORK_DIR/deploy/certbot/conf:/etc/letsencrypt" \
  -v "$FRAMEWORK_DIR/deploy/certbot/www:/var/www/certbot" \
  -p 80:80 \
  certbot/certbot certonly \
  --standalone \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN" || echo "SSL setup skipped — configure DNS first"

# Generate nginx config from template
echo "[7/8] Configuring nginx..."
export DOMAIN
envsubst '${DOMAIN}' < deploy/nginx.conf.template > deploy/nginx.conf

# Start services
echo "[8/8] Starting services..."
cd deploy
docker compose up -d

echo ""
echo "=== Setup Complete ==="
echo "Services running:"
echo "  Frontend:     https://$DOMAIN"
echo "  Archiver:     http://localhost:4000"
echo "  Meilisearch:  http://localhost:7700"
echo "  Transmission: BT port 51413"
echo ""
echo "Next steps:"
echo "  1. Place data files in /data/raw/ds{1-N}/"
echo "  2. Run ingest: docker exec -it spill-archive-archiver-1 node /app/ingest/catalog.js --data-dir /data/raw"
echo "  3. Run text extraction: docker exec -it spill-archive-archiver-1 node /app/ingest/ingest.js"
echo "  4. Index in search: docker exec -it spill-archive-archiver-1 node /app/ingest/index-search.js"
