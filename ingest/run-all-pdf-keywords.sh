#!/bin/bash
# Run PDF keyword extraction on all datasets sequentially.
# DS10 is excluded (will be run after image extraction finishes).

DATASETS="1 2 3 4 5 6 7 8 9 11 12 2004"
LOGDIR="/tmp"

for ds in $DATASETS; do
  echo "=== Starting DS$ds PDF keyword extraction ==="
  node ingest/scan-pdf-images.js --dataset "$ds" --concurrency 3 2>&1 | tee "$LOGDIR/scan-pdf-ds$ds.log"
  echo "=== DS$ds complete ==="
  echo ""
done

echo "=== All datasets complete ==="
