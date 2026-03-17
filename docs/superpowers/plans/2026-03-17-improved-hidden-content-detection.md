# Improved Hidden Content Detection

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current dark-runs-only redaction check with a two-signal detector that combines dark runs with text density analysis, eliminating false positives like handwritten notes and forms.

**Architecture:** Upgrade the `check-redactions` command in `extract-pdf-gen.py` to also analyze text layer density per page and HTML tag presence. A document is classified as "hidden content" only if it has both (1) dark redaction bars AND (2) dense or structured text content behind them. This eliminates false positives from handwritten notes, forms, and stamps that have dark marks but no substantial hidden text.

**Tech Stack:** Python, PyMuPDF (fitz), existing `extract-pdf-gen.py` and `deep-extract.js`

---

### Task 1: Upgrade `check-redactions` to combined detection

**Files:**
- Modify: `ingest/lib/extract-pdf-gen.py` (the `check_redactions` function)

- [ ] **Step 1: Update `check_redactions` to include text density analysis**

Replace the existing `check_redactions` function with a version that also measures text-per-page and HTML tag count from the text layer (first 20 pages). Return both `has_redactions` (dark runs) and a new `has_hidden_content` field that requires both dark bars AND dense/structured text.

```python
def check_redactions(pdf_path):
    """Check if a PDF has genuinely hidden content behind redaction bars.

    Two-signal detection:
    1. Dark runs: long horizontal stretches of dark pixels (redaction bars)
    2. Text density: substantial text content (>1000 chars/page) or HTML tags (>20)
       in the text layer, suggesting email/document content vs handwritten notes

    Returns JSON with has_redactions, has_hidden_content, and diagnostic fields.
    """
    import fitz
    doc = fitz.open(pdf_path)
    pages_to_check = [0, min(2, len(doc)-1), min(5, len(doc)-1)]
    pages_to_check = list(set(p for p in pages_to_check if p < len(doc)))

    # Signal 1: Dark runs (existing logic)
    total_dark_runs = 0
    pages_checked = 0

    for page_idx in pages_to_check:
        page = doc[page_idx]
        images = page.get_images(full=True)
        if not images:
            continue

        img_data = doc.extract_image(images[0][0])
        try:
            img_pix = fitz.Pixmap(img_data["image"])
        except Exception:
            continue

        w, h, n = img_pix.width, img_pix.height, img_pix.n
        samples = img_pix.samples
        dark_runs = 0

        y_start, y_end = h // 10, h * 9 // 10
        for y in range(y_start, y_end, 3):
            current_dark_run = 0
            for x in range(0, w, 2):
                idx = (y * w + x) * n
                brightness = samples[idx]
                if brightness < 50:
                    current_dark_run += 1
                else:
                    if current_dark_run > 20:
                        dark_runs += 1
                    current_dark_run = 0

        total_dark_runs += dark_runs
        pages_checked += 1

    avg_dark_runs = total_dark_runs / pages_checked if pages_checked > 0 else 0
    has_redactions = avg_dark_runs > 15

    # Signal 2: Text density and structure
    full_text = ""
    n_pages = min(20, len(doc))
    for i in range(n_pages):
        full_text += doc[i].get_text() + "\n"

    text_per_page = len(full_text) / max(n_pages, 1)
    html_tags = len(re.findall(r'<[a-z/]', full_text, re.IGNORECASE))

    has_dense_text = text_per_page > 1000 or html_tags > 20

    # Hidden content requires BOTH signals
    has_hidden_content = has_redactions and has_dense_text

    doc.close()
    print(json.dumps({
        'has_redactions': has_redactions,
        'has_hidden_content': has_hidden_content,
        'dark_runs_avg': round(avg_dark_runs, 1),
        'text_per_page': round(text_per_page),
        'html_tags': html_tags,
        'pages_checked': pages_checked
    }))
```

Note: add `import re` at the top of the file if not already present.

- [ ] **Step 2: Verify locally**

Run on three test documents in the container:
```bash
docker compose -f deploy/docker-compose.yml exec archiver python3 /app/ingest/lib/extract-pdf-gen.py check-redactions "/data/raw/ds9/DataSet 9/VOL00009/IMAGES/EFTA00143287.pdf"
# Expected: has_hidden_content: true

docker compose -f deploy/docker-compose.yml exec archiver python3 /app/ingest/lib/extract-pdf-gen.py check-redactions "/data/raw/ds9/DataSet 9/VOL00009/IMAGES/EFTA00055963.pdf"
# Expected: has_hidden_content: false (handwritten notes, sparse text)

docker compose -f deploy/docker-compose.yml exec archiver python3 /app/ingest/lib/extract-pdf-gen.py check-redactions /data/raw/ds11/VOL00011/IMAGES/0325/EFTA02715081.pdf
# Expected: has_hidden_content: false (no dark bars)
```

- [ ] **Step 3: Commit**

```bash
git add ingest/lib/extract-pdf-gen.py
git commit -m "feat: improve hidden content detection with text density signal"
```

---

### Task 2: Update deep extractor to use `has_hidden_content`

**Files:**
- Modify: `ingest/deep-extract.js` (Step 0b in `processDocument`)

- [ ] **Step 1: Update the redaction check to use `has_hidden_content` instead of `has_redactions`**

In `processDocument`, change:
```js
if (!redactionCheck.has_redactions) {
```
to:
```js
if (!redactionCheck.has_hidden_content) {
```

And update the skip reason:
```js
return { status: 'skipped', reason: `no_hidden_content (dark_runs=${redactionCheck.dark_runs_avg}, text/page=${redactionCheck.text_per_page}, html=${redactionCheck.html_tags})` }
```

- [ ] **Step 2: Commit**

```bash
git add ingest/deep-extract.js
git commit -m "feat: use has_hidden_content instead of has_redactions in deep extractor"
```

---

### Task 3: Deploy and re-scan

- [ ] **Step 1: Copy updated files to container**

```bash
docker compose -f deploy/docker-compose.yml cp ingest/lib/extract-pdf-gen.py archiver:/app/ingest/lib/extract-pdf-gen.py
docker compose -f deploy/docker-compose.yml cp ingest/deep-extract.js archiver:/app/ingest/deep-extract.js
```

- [ ] **Step 2: Test on the three known documents in Docker**

Run the same three tests from Task 1 Step 2 inside the container.

- [ ] **Step 3: Clear and re-run deep extraction to see how many docs the new filter catches**

```bash
# Reset deep_extract_attempted for docs that were previously processed
docker compose -f deploy/docker-compose.yml exec archiver node -e "
  const DB = require('./archiver/lib/documents-db');
  const db = new DB('/app/archiver/data/documents.db');
  // Only reset the ones that passed before but should now fail
  db.db.prepare('UPDATE documents SET deep_extract_attempted = 0 WHERE deep_extract_attempted = 1').run();
  console.log('Reset');
"

# Run extraction and check how many are now filtered
docker compose -f deploy/docker-compose.yml exec archiver node /app/ingest/deep-extract.js --min-score 20 --concurrency 3 --hidden-only true --limit 50 --db-path /app/archiver/data/documents.db
```

Check the output for `no_hidden_content` skip reasons — these are the newly filtered false positives.

- [ ] **Step 4: Commit and push**

```bash
git add -A
git commit -m "deploy: improved hidden content detection"
git push
```
