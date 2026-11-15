"""
Trim, centre and size the seven menu icons.

The supplied PNGs are 512x512 but the drawing fills only about a third of
each, and not the same third: Map sits right of centre, Community sits left,
and the drawings differ in size by a fifth. Dropped into a row of identical
circles that reads as sloppy - one icon large and low, the next small and
high - so each is cropped to its own ink, then centred and scaled to one
optical size.

Written to run from anywhere; takes the source and destination directories.
"""
import sys
import os
import glob
import math
from PIL import Image

CANVAS = 192          # @3x for a ~64pt circle, which is room to spare
ALPHA_FLOOR = 10      # below this is the anti-aliased ghost, not the drawing

# Matched on AREA, not on the longest side.
#
# Sizing every drawing so its longest side was equal made the wide ones look
# small: the gashapon is half again as wide as it is tall, so fitting its
# width into a square box left a third of the height empty and it read as a
# smaller icon than the community one beside it, which is square and filled
# the box. Matching the geometric mean of the sides instead gives each
# drawing the same amount of ink on screen, which is what the eye compares.
CONTENT = 155         # sqrt(width * height) after scaling
LONGEST = 184         # ...but never wider than this, so nothing touches the rim

NAMES = {
    "01-Map": "menu-map-v1.png",
    "02-Stays-and-Tours": "menu-stays-v1.png",
    "03-Game-and-Quest": "menu-quests-v1.png",
    "04-Wallet": "menu-wallet-v1.png",
    "05-Deals": "menu-deals-v1.png",
    "06-Gashapon": "menu-travel-box-v1.png",
    "07-Community": "menu-community-v1.png",
}


def visible_box(img):
    """The drawing's own bounds, ignoring the near-transparent halo."""
    alpha = img.getchannel("A")
    mask = alpha.point(lambda v: 255 if v > ALPHA_FLOOR else 0)
    return mask.getbbox()


def main(src_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    for path in sorted(glob.glob(os.path.join(src_dir, "*.png"))):
        stem = os.path.splitext(os.path.basename(path))[0]
        if stem not in NAMES:
            print(f"skip {stem}: not one of the seven")
            continue

        img = Image.open(path).convert("RGBA")
        box = visible_box(img)
        if box is None:
            print(f"skip {stem}: no visible pixels")
            continue

        drawing = img.crop(box)
        w, h = drawing.size
        scale = CONTENT / math.sqrt(w * h)
        if max(w, h) * scale > LONGEST:
            scale = LONGEST / max(w, h)
        drawing = drawing.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)

        canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
        canvas.paste(
            drawing,
            ((CANVAS - drawing.size[0]) // 2, (CANVAS - drawing.size[1]) // 2),
            drawing,
        )
        out = os.path.join(out_dir, NAMES[stem])
        canvas.save(out, "PNG", optimize=True)
        print(f"{stem:22s} {box} -> {drawing.size} on {CANVAS}px  {NAMES[stem]} ({os.path.getsize(out)}b)")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
