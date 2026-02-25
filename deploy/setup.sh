#!/bin/bash
#
# Server setup script for Epstein Files Archive
# Run on a fresh Hetzner dedicated server (Ubuntu 22.04+)
#
set -euo pipefail

DOMAIN="${1:-epsteinarchive.org}"
EMAIL="${2:-admin@epsteinarchive.org}"

echo "=== Epstein Files Archive — Server Setup ==="
echo "Domain: $DOMAIN"
echo "Email: $EMAIL"
echo ""

# System updates
echo "[1/7] Updating system..."
apt-get update && apt-get upgrade -y
apt-get install -y curl git docker.io docker-compose-plugin

# Enable Docker
systemctl enable docker
systemctl start docker

# Clone the repo (or assume it's already present)
REPO_DIR="/opt/spill"
if [ ! -d "$REPO_DIR" ]; then
  echo "[2/7] Cloning repository..."
  git clone https://github.com/myleshorton/spill.git "$REPO_DIR"
else
  echo "[2/7] Repository exists, pulling latest..."
  cd "$REPO_DIR" && git pull
fi
cd "$REPO_DIR"

# Create data directories
echo "[3/7] Creating data directories..."
mkdir -p /data/raw
mkdir -p /data/thumbs
mkdir -p deploy/certbot/conf
mkdir -p deploy/certbot/www

# Generate Meilisearch API key
MEILI_KEY=$(openssl rand -hex 32)
echo "MEILI_API_KEY=$MEILI_KEY" > deploy/.env
echo "[4/7] Meilisearch key generated"

# SSL certificate (initial — use standalone for first cert)
echo "[5/7] Obtaining SSL certificate..."
docker run --rm \
  -v "$REPO_DIR/deploy/certbot/conf:/etc/letsencrypt" \
  -v "$REPO_DIR/deploy/certbot/www:/var/www/certbot" \
  -p 80:80 \
  certbot/certbot certonly \
  --standalone \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN" || echo "SSL setup skipped — configure DNS first"

# Update nginx config with actual domain
echo "[6/7] Configuring nginx..."
sed -i "s/epsteinarchive.org/$DOMAIN/g" deploy/nginx.conf

# Start services
echo "[7/7] Starting services..."
cd deploy
docker compose up -d

echo ""
echo "=== Setup Complete ==="
echo "Services running:"
echo "  Frontend:    https://$DOMAIN"
echo "  Archiver:    http://localhost:4000"
echo "  Meilisearch: http://localhost:7700"
echo ""
echo "Next steps:"
echo "  1. Download DOJ data sets to /data/raw/ds{1-12}/"
echo "  2. Run ingest: docker exec -it spill-archiver-1 node /app/epstein-ingest/catalog.js --data-dir /data/raw"
echo "  3. Run text extraction: docker exec -it spill-archiver-1 node /app/epstein-ingest/ingest.js"
echo "  4. Index in search: docker exec -it spill-archiver-1 node /app/epstein-ingest/index-search.js"
