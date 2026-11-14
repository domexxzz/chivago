# ChivarGo QR codes

A permanent QR code is one that encodes the destination **directly**. Every
file here encodes exactly `https://chivargo.com` — no link shortener, no QR
service in the middle. As long as the domain resolves, these work forever and
depend on nothing. (Round-trip verified by decoding each PNG back to the URL;
the logo version was checked down to 180 px with blur.)

| file | use |
|---|---|
| `chivargo-qr-plain.svg/.png` | black on white — the safe default, scans anywhere |
| `chivargo-qr-blue.svg/.png`  | ChivarGo blue, still high-contrast |
| `chivargo-qr-logo.svg/.png`  | blue QR with the OG logo in the centre |
| `chivargo-qr-poster.svg`     | print-ready A-portrait card: QR + the URL in text |

**Prefer the `.svg`** for anything printed — it is vector and stays sharp at
any size. The `.png` is for screens and quick use.

## If the destination ever changes

These encode the bare domain on purpose, so a later `/landing` page or a
campaign path does not need a new code — point the domain where you like.
If you ever need the code to carry a path (e.g. `chivargo.com/sichang`),
regenerate rather than edit: `python scripts/make-qr.py` (error level H,
decode-verified). A printed code cannot be changed after the fact, which is
the whole reason to encode the stable domain and route behind it.

Error correction: level H (~30% recoverable), QR version 3, 29×29 modules.
