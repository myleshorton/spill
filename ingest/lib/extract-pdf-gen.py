#!/usr/bin/env python3
"""
Extract text from PDFs using PyMuPDF and generate clean PDFs using fpdf2.

Usage:
  python3 extract-pdf-gen.py extract <input.pdf>          # Extract text to stdout (JSON)
  python3 extract-pdf-gen.py generate <output.pdf> <title> # Read stdin, generate PDF
  python3 extract-pdf-gen.py clean-html                    # Read stdin, strip HTML, write stdout
"""
import sys
import json
import re
import os


def extract_text(pdf_path):
    """Extract all text from a PDF using PyMuPDF."""
    import fitz
    doc = fitz.open(pdf_path)
    pages = []
    for page in doc:
        text = page.get_text()
        if text.strip():
            pages.append(text)
    doc.close()
    result = {
        'page_count': len(pages),
        'pages': pages,
        'full_text': '\n\n'.join(pages)
    }
    print(json.dumps(result))


def clean_html(text):
    """Strip HTML tags and clean up extracted text."""
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<p[^>]*>', '\n\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<div[^>]*>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'&quot;', '"', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def deep_clean(text):
    """Aggressively clean OCR-extracted text from redacted PDFs.

    Removes garbled HTML remnants, MIME noise, base64 data, and lines
    that are mostly non-word characters. Keeps lines with real English words.
    """
    # First do basic HTML cleanup
    text = clean_html(text)

    # Remove MIME headers and boundaries
    text = re.sub(r'^-{5,}.*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'^Content-\S+:.*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'^charset=.*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'^MIME-Version:.*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'^boundary=.*$', '', text, flags=re.MULTILINE)

    # Remove base64-like blocks (long strings of alphanumeric + /+=)
    text = re.sub(r'[A-Za-z0-9+/=]{60,}', '', text)

    # Remove image filename clusters
    text = re.sub(r'(?:IMG[_.]?\S*\s*){3,}', '', text, flags=re.IGNORECASE)

    # Remove hex/encoded data patterns
    text = re.sub(r'(?:[0-9A-Fa-f]{2}[=:]){4,}[0-9A-Fa-f]*', '', text)

    # Remove garbled HTML tag remnants (OCR'd tags like "cldre,", "ctliv,", "Antcp:")
    text = re.sub(r'\b[cd][a-z]{2,5}[,>:]\s*', '', text)
    text = re.sub(r'\b[Aa]nt[a-z]{1,4}[,:]\s*', '', text)
    text = re.sub(r'\b[Ss]nt[a-z]{1,4}[,:]\s*', '', text)

    # Remove lines that are mostly encoded/garbled data
    text = re.sub(r'^.*[A-Za-z0-9+/]{20,}[-=*]{2,}.*$', '', text, flags=re.MULTILINE)

    # Remove CSS/style-like noise
    text = re.sub(r'\b\w+-\w+:\s*\S+[;>]\s*', '', text)

    # Process line by line — keep lines with enough real words
    cleaned_lines = []
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            if cleaned_lines and cleaned_lines[-1] != '':
                cleaned_lines.append('')
            continue

        # Keep email header lines
        if re.match(r'^(From|To|Cc|Bcc|Subject|Date|Sent|Importance):\s', line, re.IGNORECASE):
            cleaned_lines.append(line)
            continue

        # Count "real" words (3+ alpha chars, common English-like)
        words = re.findall(r'[A-Za-z]{3,}', line)
        total_chars = len(line)

        # Skip very short lines that are just noise
        if total_chars < 5:
            continue

        # Calculate ratio of real word characters to total
        word_chars = sum(len(w) for w in words)
        word_ratio = word_chars / total_chars if total_chars > 0 else 0

        # Skip lines with too many special/noise characters
        noise_chars = len(re.findall(r'[^A-Za-z0-9\s.,!?\'\"()\-:;]', line))
        noise_ratio = noise_chars / total_chars if total_chars > 0 else 0

        # Keep line if it has enough real words and not too much noise
        if word_ratio > 0.45 and noise_ratio < 0.3 and len(words) >= 2:
            # Strip non-word noise from within the line, keeping readable runs
            # Split on obvious noise boundaries and keep good chunks
            chunks = re.split(r'[A-Za-z0-9+/=]{15,}|[^A-Za-z0-9\s.,!?\'"()\-:;@/]{3,}', line)
            clean_chunks = []
            for chunk in chunks:
                chunk = chunk.strip()
                if not chunk:
                    continue
                cw = re.findall(r'[A-Za-z]{3,}', chunk)
                if len(cw) >= 1 and len(' '.join(cw)) > len(chunk) * 0.4:
                    chunk = re.sub(r'[•▪®™©„]+', '', chunk)
                    chunk = re.sub(r'\s{2,}', ' ', chunk).strip()
                    if chunk:
                        clean_chunks.append(chunk)
            cleaned = ' '.join(clean_chunks).strip()
            if len(cleaned) > 10:
                cleaned_lines.append(cleaned)

    result = '\n'.join(cleaned_lines)
    # Collapse excessive blank lines
    result = re.sub(r'\n{3,}', '\n\n', result)
    return result.strip()


def generate_pdf(output_path, title):
    """Read text from stdin and generate a formatted PDF."""
    from fpdf import FPDF

    content = sys.stdin.read()

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)

    # Try to use DejaVu for Unicode support, fall back to Helvetica
    font_name = 'Helvetica'
    dejavu_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    dejavu_bold = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    if os.path.exists(dejavu_path):
        pdf.add_font('DejaVu', '', dejavu_path, uni=True)
        if os.path.exists(dejavu_bold):
            pdf.add_font('DejaVu', 'B', dejavu_bold, uni=True)
        font_name = 'DejaVu'

    # Title page
    pdf.add_page()
    pdf.set_font(font_name, 'B', 18)
    pdf.multi_cell(0, 12, title)
    pdf.ln(5)
    pdf.set_font(font_name, '', 9)
    pdf.cell(0, 6, 'Deep Extraction — Spill Archive')
    pdf.ln(10)

    # Content
    pdf.set_font(font_name, '', 10)
    usable_width = pdf.w - pdf.l_margin - pdf.r_margin

    for line in content.split('\n'):
        if line.startswith('From:') or line.startswith('To:') or line.startswith('Subject:') or line.startswith('Date:'):
            pdf.set_font(font_name, 'B', 10)
            pdf.multi_cell(usable_width, 5, line)
            pdf.set_font(font_name, '', 10)
        elif line.strip() == '---':
            pdf.ln(3)
            pdf.cell(usable_width, 0, '', border='T')
            pdf.ln(3)
        else:
            pdf.multi_cell(usable_width, 5, line)

    pdf.output(output_path)
    print(json.dumps({'pages': pdf.page, 'size': os.path.getsize(output_path)}))


def check_redactions(pdf_path):
    """Check if a PDF has redaction bars (hidden content behind black rectangles).

    Samples a few pages, renders them, and counts long horizontal dark pixel runs.
    Returns JSON with has_redactions boolean and dark_runs_avg.
    """
    import fitz
    doc = fitz.open(pdf_path)
    pages_to_check = [0, min(2, len(doc)-1), min(5, len(doc)-1)]
    pages_to_check = list(set(p for p in pages_to_check if p < len(doc)))

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

    doc.close()
    avg_dark_runs = total_dark_runs / pages_checked if pages_checked > 0 else 0
    has_redactions = avg_dark_runs > 15
    print(json.dumps({
        'has_redactions': has_redactions,
        'dark_runs_avg': round(avg_dark_runs, 1),
        'pages_checked': pages_checked
    }))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: extract-pdf-gen.py <extract|generate|clean-html> [args...]', file=sys.stderr)
        sys.exit(1)

    command = sys.argv[1]
    if command == 'extract':
        if len(sys.argv) < 3:
            print('Usage: extract-pdf-gen.py extract <path>', file=sys.stderr)
            sys.exit(1)
        extract_text(sys.argv[2])
    elif command == 'generate':
        if len(sys.argv) < 3:
            print('Usage: extract-pdf-gen.py generate <output.pdf> [title]', file=sys.stderr)
            sys.exit(1)
        title = sys.argv[3] if len(sys.argv) > 3 else 'Extracted Document'
        generate_pdf(sys.argv[2], title)
    elif command == 'clean-html':
        text = sys.stdin.read()
        print(clean_html(text))
    elif command == 'deep-clean':
        text = sys.stdin.read()
        print(deep_clean(text))
    elif command == 'check-redactions':
        if len(sys.argv) < 3:
            print('Usage: extract-pdf-gen.py check-redactions <path>', file=sys.stderr)
            sys.exit(1)
        check_redactions(sys.argv[2])
    else:
        print(f'Unknown command: {command}', file=sys.stderr)
        sys.exit(1)
