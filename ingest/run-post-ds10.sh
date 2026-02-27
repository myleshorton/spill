#!/bin/bash
# Run after DS10 image extraction finishes:
# 1. DS9 image extraction
# 2. Image keyword extraction for DS9 + DS10
# 3. PDF keyword extraction for DS9 + DS10 remaining PDFs
# 4. Full Meilisearch re-index

echo "=== Starting DS9 image extraction ==="
node ingest/extract-ds10-images.js --dataset 9 --concurrency 16 2>&1 | tee /tmp/extract-ds9.log

echo ""
echo "=== Starting DS10 image keyword extraction ==="
node ingest/scan-images.js --dataset 10 --concurrency 3 2>&1 | tee /tmp/scan-images-ds10.log

echo ""
echo "=== Starting DS9 image keyword extraction ==="
node ingest/scan-images.js --dataset 9 --concurrency 3 2>&1 | tee /tmp/scan-images-ds9.log

echo ""
echo "=== Starting DS10 PDF keyword extraction (remaining PDFs) ==="
node ingest/scan-pdf-images.js --dataset 10 --concurrency 3 2>&1 | tee /tmp/scan-pdf-ds10.log

echo ""
echo "=== Starting DS9 PDF keyword extraction ==="
node ingest/scan-pdf-images.js --dataset 9 --concurrency 3 2>&1 | tee /tmp/scan-pdf-ds9.log

echo ""
echo "=== Re-indexing Meilisearch ==="
node ingest/index-search.js 2>&1 | tee /tmp/reindex.log

echo ""
echo "=== All post-DS10 tasks complete ==="
