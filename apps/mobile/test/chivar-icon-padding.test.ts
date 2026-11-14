/**
 * How much of a Chivar icon is actually drawing.
 *
 * The map pin sizes its `<img>` at 94px inside a 42px circle and has no
 * `overflow:hidden`, so what the traveller sees is not the image - it is
 * whatever the artist drew inside the image's transparent margin. Every icon
 * today is a 512px canvas with the glyph on roughly half of it, so 94px lands
 * a ~50px mark on a 42px disc, which is the slightly-bursting look the pins
 * have. That is a deliberate style, and it is also a number somebody arrived
 * at by eye: the first attempt was 140px and the second commit of #220 brought
 * it to 94.
 *
 * NOTHING HELD THAT ARRANGEMENT TOGETHER. The one fact it rests on - that an
 * icon's glyph fills about half its canvas - lives in twenty-one PNG files
 * and in no code at all. Re-export `06-food.png` trimmed to its content, or
 * add a twenty-second icon drawn edge to edge, and the mark silently swells
 * to twice the pin and spills over the white ring. No type, no test and no
 * reviewer would see it; it would be found in a screenshot, or on a stage.
 *
 * So the fact is written down here. If this fails, the icons changed shape,
 * and the pin's 94px has to be revisited with them - `TerrainMap`'s
 * `.cg-place-pin-core img` and `.cg-shop-pin-core img`.
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const ICON_DIR = fileURLToPath(new URL('../assets/chivar-icons/', import.meta.url));

/** The pin's own numbers, so a change to either side shows up as a failure. */
const IMG_PX = 94;
const PIN_PX = 42;

/**
 * The bounding box of everything that is not fully transparent, as a fraction
 * of the canvas. A minimal PNG reader: these are 8-bit RGBA, non-interlaced,
 * which is what the export produces, and the test says so rather than pulling
 * an image library into the mobile package for one assertion.
 */
function contentRatio(file: string): number {
  const png = readFileSync(file);
  let pos = 8;
  let width = 0; let height = 0; let depth = 0; let colour = 0; let interlace = 0;
  const idat: Buffer[] = [];

  while (pos < png.length) {
    const length = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    const body = png.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      depth = body[8]!; colour = body[9]!; interlace = body[12]!;
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + length;
  }

  assert.equal(depth, 8, `${file}: expected 8-bit samples`);
  assert.equal(colour, 6, `${file}: expected RGBA`);
  assert.equal(interlace, 0, `${file}: expected non-interlaced`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const prior = Buffer.alloc(stride);
  const line = Buffer.alloc(stride);
  let minX = width; let maxX = -1; let minY = height; let maxY = -1;

  for (let y = 0, at = 0; y < height; y += 1) {
    const filter = raw[at]!; at += 1;
    raw.copy(line, 0, at, at + stride); at += stride;
    for (let i = 0; i < stride; i += 1) {
      const a = line[i]!;
      const left = i >= 4 ? line[i - 4]! : 0;
      const up = prior[i]!;
      const upLeft = i >= 4 ? prior[i - 4]! : 0;
      // The five PNG filters, per the spec.
      if (filter === 1) line[i] = (a + left) & 0xff;
      else if (filter === 2) line[i] = (a + up) & 0xff;
      else if (filter === 3) line[i] = (a + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left); const pb = Math.abs(p - up); const pc = Math.abs(p - upLeft);
        line[i] = (a + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 0xff;
      }
    }
    for (let x = 0; x < width; x += 1) {
      if (line[x * 4 + 3]! === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    line.copy(prior);
  }

  assert.ok(maxX >= 0, `${file}: the icon is entirely transparent`);
  return Math.max((maxX - minX + 1) / width, (maxY - minY + 1) / height);
}

const icons = readdirSync(ICON_DIR).filter((f) => f.endsWith('.png')).sort();

describe('what a Chivar icon actually fills', () => {
  test('there are icons to check', () => {
    assert.ok(icons.length >= 20, `only ${icons.length} icons found in ${ICON_DIR}`);
  });

  for (const name of icons) {
    test(`${name} leaves the margin the map pin is counting on`, () => {
      const ratio = contentRatio(ICON_DIR + name);
      const mark = IMG_PX * ratio;

      assert.ok(
        ratio <= 0.62,
        `${name} draws on ${(ratio * 100).toFixed(0)}% of its canvas, so at ${IMG_PX}px it puts a `
        + `${mark.toFixed(0)}px mark on a ${PIN_PX}px pin and spills past the ring. `
        + `Either give it the usual transparent margin, or size the pin's img for the new shape.`,
      );
      assert.ok(
        ratio >= 0.3,
        `${name} draws on only ${(ratio * 100).toFixed(0)}% of its canvas, so at ${IMG_PX}px its mark is `
        + `${mark.toFixed(0)}px and reads as smaller than every other pin.`,
      );
    });
  }

  test('THE ICONS AGREE WITH EACH OTHER, SO THE PINS LOOK LIKE A SET', () => {
    /*
      The thing `fa896d8` set out to fix and could not, because it scaled every
      icon by the same number. The marks still differ by however much the
      drawings differ - today 0.39 to 0.54, which is a 38% spread between the
      smallest pin and the largest. Pinned at the width it is rather than at
      the width somebody would want, so that it cannot quietly get worse, and
      so the next person to look at pin sizing finds the measurement already
      taken.
    */
    const ratios = icons.map((name) => contentRatio(ICON_DIR + name));
    const spread = Math.max(...ratios) / Math.min(...ratios);
    assert.ok(
      spread <= 1.45,
      `the widest icon draws ${spread.toFixed(2)}x more of its canvas than the narrowest, `
      + `so the pins no longer read as one set`,
    );
  });
});
