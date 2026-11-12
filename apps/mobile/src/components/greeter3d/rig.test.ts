import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { ARM, TAIL, distanceToBone, weightBuffers, weightFor } from './rig.ts';

/**
 * Points read off the model, not invented. The occupancy map in the bake
 * notes puts the hat brim high and central, the far shoulder across the body,
 * and the tail behind and to the -x side - the three places that must not
 * move when an arm waves, and the three places the two earlier attempts at
 * this moved.
 */
const HAT_BRIM = [0.3, 0.75, 0.22] as const;
const HAT_CROWN = [0.0, 0.95, 0.0] as const;
const FAR_SHOULDER = [-0.25, 0.55, 0.05] as const;
const TAIL_BUSH = [-0.35, 0.45, -0.3] as const;
const FOOT = [0.12, 0.03, 0.1] as const;
const HAND = ARM.tip;

describe('the arm bone moves an arm and nothing else', () => {
  test('the hand moves fully', () => {
    assert.ok(weightFor(HAND[0], HAND[1], HAND[2], ARM) > 0.95);
  });

  for (const [name, p] of [
    ['the hat brim', HAT_BRIM],
    ['the hat crown', HAT_CROWN],
    ['the far shoulder', FAR_SHOULDER],
    ['the tail', TAIL_BUSH],
    ['a foot', FOOT],
  ] as const) {
    test(`${name} does not move with the arm`, () => {
      /*
        This is the whole reason the rig is distances to a segment and not a
        box of coordinates. The hat brim shares the hand's x and y; a box
        wide enough for the hand took the brim with it and tore the hat.
      */
      assert.equal(weightFor(p[0], p[1], p[2], ARM), 0, `${name} took arm weight`);
    });
  }

  test('the shoulder is held still so the arm has something to turn against', () => {
    // At the pivot itself the weight is full, but the geometry there does not
    // move, because rotation about a point leaves that point where it is.
    assert.ok(weightFor(ARM.pivot[0], ARM.pivot[1], ARM.pivot[2], ARM) > 0.95);
  });
});

describe('the tail bone', () => {
  test('the tip moves fully and the bush around it moves some', () => {
    assert.ok(weightFor(TAIL.tip[0], TAIL.tip[1], TAIL.tip[2], TAIL) > 0.95);
    // The bush is wider than the bone: a point out at its surface is most of
    // the radius away and takes a small share, which is what a soft tail
    // should do - sweep from the base and trail at the edges.
    assert.ok(weightFor(TAIL_BUSH[0], TAIL_BUSH[1], TAIL_BUSH[2], TAIL) > 0.02);
  });
  test('the hand and the hat do not', () => {
    assert.equal(weightFor(HAND[0], HAND[1], HAND[2], TAIL), 0);
    assert.equal(weightFor(HAT_CROWN[0], HAT_CROWN[1], HAT_CROWN[2], TAIL), 0);
  });
});

/**
 * A point `d` out from the middle of a bone, at right angles to it.
 *
 * Offsetting from the PIVOT does not do this, which cost a test: step
 * sideways from the end of a segment and the nearest point on it slides
 * along to meet you, so a step of one radius lands nearer than one radius.
 * Only a perpendicular raised at the middle is the distance it looks.
 */
const besideBone = (bone: typeof ARM, d: number) => {
  const dir = [bone.tip[0] - bone.pivot[0], bone.tip[1] - bone.pivot[1], bone.tip[2] - bone.pivot[2]];
  // Any vector off the bone's own axis, crossed with it, is perpendicular.
  const perp = [dir[1] * 0 - dir[2] * 1, dir[2] * 0 - dir[0] * 0, dir[0] * 1 - dir[1] * 0];
  const n = Math.hypot(...perp) || 1;
  const mid = bone.pivot.map((v, i) => (v + bone.tip[i]) / 2);
  return [0, 1, 2].map((i) => mid[i] + (perp[i] / n) * d) as [number, number, number];
};

describe('the falloff', () => {
  test('it reaches zero exactly at the radius and stays there', () => {
    const edge = besideBone(ARM, ARM.radius);
    assert.equal(weightFor(edge[0], edge[1], edge[2], ARM), 0);
    const beyond = besideBone(ARM, ARM.radius * 4);
    assert.equal(weightFor(beyond[0], beyond[1], beyond[2], ARM), 0);
  });

  test('it arrives at zero flat, so the arm has no crease at its edge', () => {
    /*
      Squared falloff, not linear. A linear one still has slope on it when it
      hits zero, which puts a visible crease exactly where the arm meets the
      shoulder. The slope over the last tenth of the radius should be a small
      fraction of the slope across the whole of it.
    */
    const at = (d: number) => {
      const p = besideBone(ARM, d);
      return weightFor(p[0], p[1], p[2], ARM);
    };
    const edgeSlope = Math.abs(at(ARM.radius * 0.9) - at(ARM.radius)) / (ARM.radius * 0.1);
    const meanSlope = Math.abs(at(0) - at(ARM.radius)) / ARM.radius;
    assert.ok(edgeSlope < meanSlope * 0.35, `edge slope ${edgeSlope} vs mean ${meanSlope}`);
  });

  test('weight only ever falls as a vertex gets further from the bone', () => {
    let previous = Infinity;
    for (let d = 0; d <= ARM.radius * 1.5; d += ARM.radius / 40) {
      const p = besideBone(ARM, d);
      const w = weightFor(p[0], p[1], p[2], ARM);
      assert.ok(w <= previous + 1e-12, `weight rose to ${w} at distance ${d}`);
      previous = w;
    }
  });

  test('weight never leaves 0..1', () => {
    for (let x = -0.5; x <= 0.5; x += 0.05) {
      for (let y = 0; y <= 1; y += 0.05) {
        for (let z = -0.45; z <= 0.45; z += 0.1) {
          for (const bone of [ARM, TAIL]) {
            const w = weightFor(x, y, z, bone);
            assert.ok(w >= 0 && w <= 1, `weight ${w} at ${x},${y},${z}`);
          }
        }
      }
    }
  });
});

describe('distance to a bone is distance to its segment, not its line', () => {
  test('a point beyond the tip measures from the tip', () => {
    /*
      Clamping to the segment is what stops the arm's influence running off
      past the hand into empty space - and, on a longer bone, out the far
      side of the animal.
    */
    const beyond = [ARM.tip[0] + 0.3, ARM.tip[1], ARM.tip[2]] as const;
    const direct = Math.hypot(beyond[0] - ARM.tip[0], beyond[1] - ARM.tip[1], beyond[2] - ARM.tip[2]);
    assert.ok(Math.abs(distanceToBone(beyond[0], beyond[1], beyond[2], ARM) - direct) < 1e-9);
  });

  test('a point beside the middle measures perpendicular to it', () => {
    const mid = ARM.pivot.map((v, i) => (v + ARM.tip[i]) / 2) as unknown as [number, number, number];
    assert.ok(distanceToBone(mid[0], mid[1], mid[2], ARM) < 1e-6);
  });
});

describe('the weight buffers', () => {
  test('they are one weight a vertex, in order', () => {
    const positions = new Float32Array([
      ...HAND, ...HAT_CROWN, ...TAIL.tip, ...FOOT,
    ]);
    const { arm, tail, moved } = weightBuffers(positions);
    assert.equal(arm.length, 4);
    assert.equal(tail.length, 4);
    assert.ok(arm[0] > 0.95, 'the hand does not move with the arm');
    assert.equal(arm[1], 0, 'the hat moves with the arm');
    assert.ok(tail[2] > 0.95, 'the tail does not move with the tail');
    assert.equal(arm[3], 0, 'a foot moves with the arm');
    assert.equal(moved.arm, 1);
    assert.equal(moved.tail, 1);
  });

  test('an empty mesh is not a crash', () => {
    const { arm, moved } = weightBuffers(new Float32Array(0));
    assert.equal(arm.length, 0);
    assert.equal(moved.arm, 0);
  });
});
