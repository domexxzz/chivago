/**
 * The crop geometry.
 *
 * A cropper that is slightly wrong still produces a plausible square - just
 * not the one the person framed - so none of this is visible in a screenshot.
 * These are the cases where an off-by-a-half would hide.
 */

import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import { FRAME, clampOffset, cropRect, panLimit } from './photo-crop.ts';

const CENTRED = { x: 0, y: 0 };

/**
 * Within a thousandth of a pixel.
 *
 * `sx` and `sy` come out of a division, so they land a floating-point hair
 * off a round number. Demanding bit-exactness there would be the test being
 * wrong rather than the maths: the canvas takes fractional source rectangles
 * and a ten-trillionth of a pixel is not a crop anyone can see. Where a value
 * IS exact - the side of the square, an edge at zero - it is asserted exactly.
 */
const near = (actual: number, expected: number, what: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-3, `${what}: ${actual} is not ~${expected}`);

describe('what square of the original the frame is showing', () => {
  test('a square photo at rest is taken whole', () => {
    const r = cropRect({ w: 800, h: 800 }, 1, CENTRED);
    assert.equal(r.sx, 0);
    assert.equal(r.sy, 0);
    assert.equal(r.sSize, 800, 'the whole image, not the frame in screen pixels');
  });

  test('a landscape photo at rest takes its full height, centred across', () => {
    const r = cropRect({ w: 1600, h: 900 }, 1, CENTRED);
    assert.equal(r.sSize, 900, 'the short side is what fits');
    assert.equal(r.sy, 0);
    near(r.sx, (1600 - 900) / 2, 'centred, so equal margins left and right');
  });

  test('a portrait photo at rest takes its full width, centred down', () => {
    const r = cropRect({ w: 900, h: 1600 }, 1, CENTRED);
    assert.equal(r.sSize, 900);
    assert.equal(r.sx, 0);
    near(r.sy, (1600 - 900) / 2, 'centred, so equal margins top and bottom');
  });

  test('zooming in halves the source square at 2x, and keeps it centred', () => {
    const r = cropRect({ w: 800, h: 800 }, 2, CENTRED);
    assert.equal(r.sSize, 400);
    assert.equal(r.sx, 200, 'centred: (800 - 400) / 2');
    assert.equal(r.sy, 200);
  });

  test('dragging moves the source square the other way', () => {
    // Dragging the image right shows what was to its LEFT, so sx falls.
    const centred = cropRect({ w: 800, h: 800 }, 2, CENTRED);
    const dragged = cropRect({ w: 800, h: 800 }, 2, { x: 40, y: 0 });
    assert.ok(dragged.sx < centred.sx, `${dragged.sx} should be left of ${centred.sx}`);
    // 40 screen pixels at 2x on an 800px image shown in a 260px frame.
    const effective = (FRAME / 800) * 2;
    assert.equal(dragged.sx, centred.sx - 40 / effective);
  });

  test('the square never leaves the image, however far it is dragged', () => {
    for (const offset of [{ x: 9999, y: 9999 }, { x: -9999, y: -9999 }]) {
      const r = cropRect({ w: 1600, h: 900 }, 1.5, offset);
      assert.ok(r.sx >= 0, `sx ${r.sx} must not be negative`);
      assert.ok(r.sy >= 0, `sy ${r.sy} must not be negative`);
      assert.ok(r.sx + r.sSize <= 1600 + 1e-9, 'must not run off the right edge');
      assert.ok(r.sy + r.sSize <= 900 + 1e-9, 'must not run off the bottom edge');
    }
  });

  test('a very wide panorama still yields a square, not a strip', () => {
    const r = cropRect({ w: 4000, h: 500 }, 1, CENTRED);
    assert.equal(r.sSize, 500);
    assert.equal(r.sy, 0);
    assert.equal(r.sx, (4000 - 500) / 2);
  });
});

describe('how far the image may be dragged', () => {
  test('a square photo at rest cannot be dragged at all', () => {
    // It exactly covers the frame: any movement would show a corner of
    // nothing, which is the one thing the frame must never show.
    assert.deepEqual(panLimit({ w: 800, h: 800 }, 1), { x: 0, y: 0 });
  });

  test('a landscape photo at rest slides across but not down', () => {
    const limit = panLimit({ w: 1600, h: 900 }, 1);
    assert.ok(limit.x > 0, 'the long side has slack');
    assert.equal(limit.y, 0, 'the short side is exactly used up');
  });

  test('zooming in creates slack in both directions', () => {
    const limit = panLimit({ w: 800, h: 800 }, 2);
    assert.ok(limit.x > 0 && limit.y > 0);
    assert.equal(limit.x, limit.y, 'a square photo is symmetric');
  });

  test('an offset past the limit is pulled back to it', () => {
    const held = clampOffset({ x: 9999, y: -9999 }, { w: 1600, h: 900 }, 1);
    const limit = panLimit({ w: 1600, h: 900 }, 1);
    assert.equal(held.x, limit.x);
    assert.equal(held.y, -limit.y);
  });

  test('with no image loaded yet, the offset is simply nothing', () => {
    assert.deepEqual(clampOffset({ x: 20, y: 20 }, null, 1), { x: 0, y: 0 });
  });
});
