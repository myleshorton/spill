# Epstein Files Archive — Site Config

Site-specific configuration for the [Epstein Files Archive](https://unredact.org), built on the [spill-archive](https://github.com/myleshorton/spill) framework.

## Files

- `site.config.ts` — Frontend branding, text, dataset descriptions, featured searches
- `archive-config.json` — Backend dataset definitions and category classification rules
- `docker-compose.yml` — Compose override that injects site config into the framework
- `.env.example` — Environment variables template

## Deployment

```bash
# 1. Clone both repos
git clone https://github.com/myleshorton/spill.git /opt/spill-archive
git clone <this-repo> /opt/epstein-files

# 2. Run setup
cd /opt/spill-archive
./deploy/setup.sh --domain unredact.org --email admin@unredact.org --site-repo /opt/epstein-files

# 3. Or manually with docker compose
cd /opt/spill-archive/deploy
cp /opt/epstein-files/.env.example .env  # edit values
docker compose up -d
```

## Creating a New Site

Copy this repo as a template. Replace:
1. `site.config.ts` — your site name, descriptions, datasets, featured searches
2. `archive-config.json` — your dataset IDs, names, category rules
3. `.env.example` — your domain
