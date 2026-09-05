#!/usr/bin/env python3
"""
QR codes for the day (docs/46).

One for the room and one per campus place, each carrying the area, the
place and the event token, so a phone that scans lands on the campus, on
the pin, with the token the door checks. Run on the day before the event,
with the real token, and never commit the output: the token is the point.

    pip install segno
    python scripts/event-qr.py https://chivago.fly.dev --token 3VQ7... --out /path/to/qr

Without --token the codes carry no token, which is what the public demo
accepts, and which is fine to hand around.
"""
import argparse
import pathlib
import sys

try:
    import segno
except ImportError:  # pragma: no cover - a tooling message, not logic
    sys.exit("pip install segno")

PLACES = [
    ("room", None, "The room · จอใหญ่"),
    ("ku-viewpoint", "ku-viewpoint", "Sapandao viewpoint · จุดชมวิวสะพานดาว"),
    ("ku-park", "ku-park", "Campus park and lake · สวนและบึง"),
    ("ku-library", "ku-library", "Library · หอสมุด"),
    ("ku-sports", "ku-sports", "Sports centre · ศูนย์กีฬา"),
    ("ku-shops", "ku-shops", "Shop row · แถวร้านค้า"),
]


def url_for(base: str, place: str | None, token: str | None) -> str:
    parts = ["area=ku-sriracha"]
    if place:
        parts.append(f"place={place}")
    if token:
        parts.append(f"event={token}")
    return f"{base.rstrip('/')}/?{'&'.join(parts)}"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("base", help="the origin the phones will open, e.g. https://chivago.fly.dev")
    ap.add_argument("--token", default=None, help="CHIVAGO_EVENT_TOKEN, as set on the deployment for the day")
    ap.add_argument("--out", default="event-qr", help="directory for the images")
    args = ap.parse_args()

    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for name, place, label in PLACES:
        url = url_for(args.base, place, args.token)
        qr = segno.make(url, error="m")
        qr.save(out / f"{name}.svg", scale=8, border=2)
        qr.save(out / f"{name}.png", scale=10, border=2)
        print(f"{name:14} {label}\n{'':14} {url}")
    print(f"\n{len(PLACES) * 2} files in {out}. Print the room code at A3 and the place codes at A5.")
    if not args.token:
        print("No --token: these codes carry none. The door on the day requires the token.")


if __name__ == "__main__":
    main()
