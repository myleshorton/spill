#!/usr/bin/env python3
"""
Fast OCR for scanned PDFs using RapidOCR (PaddleOCR ONNX models).
Called from text-extract.js as a subprocess.

Usage: python3 ocr.py <pdf_path> [--max-pages 20] [--dpi 200]
Outputs extracted text to stdout.
"""
import sys
import os
import subprocess
import tempfile
import glob

def main():
    args = sys.argv[1:]
    pdf_path = None
    max_pages = 20
    dpi = 200

    i = 0
    while i < len(args):
        if args[i] == '--max-pages' and i + 1 < len(args):
            max_pages = int(args[i + 1])
            i += 2
        elif args[i] == '--dpi' and i + 1 < len(args):
            dpi = int(args[i + 1])
            i += 2
        else:
            pdf_path = args[i]
            i += 1

    if not pdf_path:
        print("Usage: ocr.py <pdf_path>", file=sys.stderr)
        sys.exit(1)

    # Lazy import so model loading only happens once per process
    from rapidocr_onnxruntime import RapidOCR
    ocr = RapidOCR()

    with tempfile.TemporaryDirectory(prefix='ocr-') as tmpdir:
        # Convert PDF pages to grayscale PNGs
        subprocess.run([
            'pdftoppm', '-r', str(dpi), '-l', str(max_pages),
            '-gray', pdf_path, os.path.join(tmpdir, 'page')
        ], capture_output=True, timeout=60)

        pages = sorted(glob.glob(os.path.join(tmpdir, 'page-*.pgm')))
        if not pages:
            # Try png output if pgm didn't work
            subprocess.run([
                'pdftoppm', '-r', str(dpi), '-l', str(max_pages),
                '-gray', '-png', pdf_path, os.path.join(tmpdir, 'page')
            ], capture_output=True, timeout=60)
            pages = sorted(glob.glob(os.path.join(tmpdir, 'page-*.png')))

        if not pages:
            sys.exit(0)

        text_parts = []
        for page_path in pages:
            result, _ = ocr(page_path)
            if result:
                for line in result:
                    text_parts.append(line[1])

        print('\n'.join(text_parts))


if __name__ == '__main__':
    main()
