#!/usr/bin/env python3
"""Regenerate the ChivarGo QR codes into artifacts/qr/.

A QR that scans "permanently" encodes its destination directly - no shortener,
no third-party QR service that could disappear. These encode the bare domain,
so the code outlives any change to the page behind it.

    python scripts/make-qr.py            # -> https://chivargo.com
    python scripts/make-qr.py URL        # any other destination

Needs: segno, pillow. Verifies each PNG by decoding it back (opencv, if present).
"""
import sys, io, base64
from pathlib import Path

URL = sys.argv[1] if len(sys.argv) > 1 else 'https://chivargo.com'
BLUE = '#0E6FB8'
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts' / 'qr'
LOGO = ROOT / 'apps' / 'mobile' / 'public' / 'media' / 'brand'   # if a logo lives here
OUT.mkdir(parents=True, exist_ok=True)

import segno
qr = segno.make(URL, error='h')          # H: survives a centre logo and poor print
qr.save(OUT / 'chivargo-qr-plain.svg', scale=16, border=4)
qr.save(OUT / 'chivargo-qr-plain.png', scale=20, border=4)
qr.save(OUT / 'chivargo-qr-blue.svg', scale=16, border=4, dark=BLUE)
qr.save(OUT / 'chivargo-qr-blue.png', scale=20, border=4, dark=BLUE)
print(f'encoded {URL!r}  (version {qr.version}, error {qr.error})')

try:
    import cv2
    det = cv2.QRCodeDetector()
    for f in ('chivargo-qr-plain.png', 'chivargo-qr-blue.png'):
        data, *_ = det.detectAndDecode(cv2.imread(str(OUT / f)))
        print(f'  verify {f}: {"OK" if data == URL else "FAIL " + repr(data)}')
except ImportError:
    print('  (opencv not installed - skipped decode check)')
