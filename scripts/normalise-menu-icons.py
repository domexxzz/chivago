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


GAP_MAX = 24   # a piece further than this from the drawing is not part of it


def pieces(mask, w, h):
    """
    Every separately-drawn piece, as (pixel count, bounding box).

    Flood fill in plain Python rather than scipy: this runs seven times when
    someone adds an icon, and a dependency costs more than the second it
    saves.
    """
    seen = bytearray(w * h)
    found = []
    for start in range(w * h):
        if not mask[start] or seen[start]:
            continue
        stack = [start]
        seen[start] = 1
        count = 0
        x0 = x1 = start % w
        y0 = y1 = start // w
        while stack:
            i = stack.pop()
            count += 1
            x, y = i % w, i // w
            if x < x0: x0 = x
            if x > x1: x1 = x
            if y < y0: y0 = y
            if y > y1: y1 = y
            for dy in (-1, 0, 1):
                ny = y + dy
                if ny < 0 or ny >= h:
                    continue
                for dx in (-1, 0, 1):
                    nx = x + dx
                    if nx < 0 or nx >= w:
                        continue
                    j = ny * w + nx
                    if mask[j] and not seen[j]:
                        seen[j] = 1
                        stack.append(j)
        found.append((count, (x0, y0, x1 + 1, y1 + 1)))
    found.sort(key=lambda p: -p[0])
    return found


def box_gap(a, b):
    """Shortest distance between two boxes; 0 when they touch or overlap."""
    return max(max(0, a[0] - b[2], b[0] - a[2]), max(0, a[1] - b[3], b[1] - a[3]))


def visible_box(img):
    """
    The drawing's own bounds - its main mass plus the flecks that belong to it,
    and not the ones that do not.

    A plain alpha bounding box was the obvious thing and it was wrong on one
    icon: the gashapon art carries two clipped fragments of a second machine
    about ninety pixels off to the right. They are invisible at icon size but
    the box stretched to reach them, so the drawing was pushed small and left
    of centre with a sliver floating beside it.

    Dropping everything but the largest piece would have been worse - the
    sparkle strokes beside the house, the wallet and the ticket are separate
    pieces too, and they are meant to be there. The two tell themselves apart
    by distance and nothing else: every intentional fleck sits within eleven
    pixels of the main mass, and the two strays sit at eighty-six and
    ninety-one.
    """
    w, h = img.size
    alpha = img.getchannel("A")
    # `tobytes` rather than `getdata`: one byte per pixel for an L-mode image,
    # no per-pixel Python object, and not deprecated.
    mask = alpha.tobytes().translate(bytes(1 if v > ALPHA_FLOOR else 0 for v in range(256)))
    found = pieces(mask, w, h)
    if not found:
        return None, []

    keep = [found[0][1]]
    dropped = []
    for count, box in found[1:]:
        (keep.append(box) if box_gap(found[0][1], box) <= GAP_MAX else dropped.append((count, box)))

    return (
        min(b[0] for b in keep), min(b[1] for b in keep),
        max(b[2] for b in keep), max(b[3] for b in keep),
    ), dropped


def main(src_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    for path in sorted(glob.glob(os.path.join(src_dir, "*.png"))):
        stem = os.path.splitext(os.path.basename(path))[0]
        if stem not in NAMES:
            print(f"skip {stem}: not one of the seven")
            continue

        img = Image.open(path).convert("RGBA")
        box, dropped = visible_box(img)
        if box is None:
            print(f"skip {stem}: no visible pixels")
            continue
        for count, stray in dropped:
            # Said out loud: silently cropping part of someone's artwork away
            # is the kind of help nobody asked for.
            print(f"  {stem}: dropped a stray piece, {count}px at {stray}")

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
