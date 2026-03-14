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
    else:
        print(f'Unknown command: {command}', file=sys.stderr)
        sys.exit(1)
