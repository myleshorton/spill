#!/bin/bash
#
# One-shot deployment script for unredact.org on Hetzner AX102
# Run as root on a fresh Ubuntu 22.04+ server after DNS is pointed.
#
set -euo pipefail

DOMAIN="unredact.org"
EMAIL="admin@unredact.org"
REPO="https://github.com/myleshorton/spill.git"
INSTALL_DIR="/opt/spill-archive"

echo "========================================="
echo "  Unredact Archive — Server Deployment"
echo "  Domain: $DOMAIN"
echo "========================================="
echo ""

# 1. System updates + Docker
echo "[1/9] Installing system packages..."
apt-get update && apt-get upgrade -y
apt-get install -y curl git docker.io docker-compose-plugin gettext-base ufw

# 2. Firewall
echo "[2/9] Configuring firewall..."
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (certbot + redirect)
ufw allow 443/tcp   # HTTPS
ufw allow 51413     # BitTorrent
ufw --force enable

# 3. Docker
echo "[3/9] Enabling Docker..."
systemctl enable docker
systemctl start docker

# 4. Clone repo
echo "[4/9] Cloning repository..."
if [ -d "$INSTALL_DIR" ]; then
  cd "$INSTALL_DIR" && git pull
else
  git clone "$REPO" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# 5. Create data directories
echo "[5/9] Creating data directories..."
mkdir -p /data/raw /data/thumbs
mkdir -p deploy/certbot/conf deploy/certbot/www

# 6. Set up RAID-0 on NVMe drives if both exist and /data isn't already mounted
# (Skip if /data is already a large mount)
DATA_SIZE=$(df /data 2>/dev/null | awk 'NR==2{print $2}' || echo "0")
if [ "$DATA_SIZE" -lt 1000000000 ] 2>/dev/null; then
  echo "[5b/9] Note: Consider setting up RAID-0 on NVMe drives for /data"
  echo "        Run: mdadm --create /dev/md0 --level=0 --raid-devices=2 /dev/nvme0n1 /dev/nvme1n1"
  echo "        Then: mkfs.ext4 /dev/md0 && mount /dev/md0 /data"
  echo "        Skipping for now — using root filesystem."
fi

# 7. Generate env
echo "[6/9] Generating environment..."
MEILI_KEY=$(openssl rand -hex 32)
cat > deploy/.env <<EOF
DOMAIN=$DOMAIN
MEILI_API_KEY=$MEILI_KEY
ARCHIVE_CONFIG=$INSTALL_DIR/epstein-files/archive-config.json
EOF

# 8. SSL certificate
echo "[7/9] Obtaining SSL certificate..."
docker run --rm \
  -v "$INSTALL_DIR/deploy/certbot/conf:/etc/letsencrypt" \
  -v "$INSTALL_DIR/deploy/certbot/www:/var/www/certbot" \
  -p 80:80 \
  certbot/certbot certonly \
  --standalone \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN" || {
    echo ""
    echo "WARNING: SSL failed. Make sure DNS A record for $DOMAIN points to this server."
    echo "You can re-run the certbot command later."
    echo ""
  }

# 9. Generate nginx config from template
echo "[8/9] Configuring nginx..."
export DOMAIN
envsubst '${DOMAIN}' < deploy/nginx.conf.template > deploy/nginx.conf

# 10. Copy Epstein site config into frontend for build
echo "[9/9] Building and starting services..."
cp epstein-files/site.config.ts frontend/src/config/site.config.ts

# Start everything
cd deploy
docker compose up -d --build

echo ""
echo "========================================="
echo "  Deployment Complete!"
echo "========================================="
echo ""
echo "Services:"
echo "  Frontend:     https://$DOMAIN"
echo "  Archiver:     http://localhost:4000 (internal)"
echo "  Meilisearch:  http://localhost:7700 (internal)"
echo "  Transmission: port 51413 (BitTorrent)"
echo "  ClamAV:       internal (virus scanning)"
echo ""
echo "Next steps:"
echo "  1. Download DOJ data sets:"
echo "     mkdir -p /data/raw/ds{1..12}"
echo "     # Use aria2c, wget, or BitTorrent to download each dataset"
echo ""
echo "  2. Run ingest pipeline:"
echo "     docker exec -it deploy-archiver-1 node /app/ingest/catalog.js --data-dir /data/raw"
echo "     docker exec -it deploy-archiver-1 node /app/ingest/ingest.js"
echo "     docker exec -it deploy-archiver-1 node /app/ingest/index-search.js"
echo ""
echo "  3. Generate torrents (auto-generates on startup, or manually):"
echo "     docker exec -it deploy-archiver-1 node -e \"require('./lib/torrent-manager').prototype.generateAll()\""
echo ""
