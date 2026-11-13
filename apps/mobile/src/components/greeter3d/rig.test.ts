import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  ARM, HEAD, SPINE, TAIL, distanceToBone, spineDrive, weightBuffers, weightFor,
} from './rig.ts';

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

  test('the swing grows along the arm: nothing at the shoulder, everything at the hand', () => {
    /*
      THE ELBOW THIS MODEL DOES NOT HAVE. With `bend` at 0, the whole arm
      swings by one angle and reads as a stick on a hinge. Scaling by how far
      along the bone a vertex sits leaves the shoulder alone and gives the
      travel to the hand, which is what a wave looks like.
    */
    const at = (t: number) => {
      const p = [0, 1, 2].map((i) => ARM.pivot[i] + (ARM.tip[i] - ARM.pivot[i]) * t);
      return weightFor(p[0], p[1], p[2], ARM);
    };
    assert.ok(at(0) < 0.2, `the shoulder swings ${at(0).toFixed(2)} of the way`);
    assert.ok(at(1) > 0.95, `the hand only swings ${at(1).toFixed(2)}`);
    let previous = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const w = at(t);
      assert.ok(w >= previous - 1e-9, `the swing fell back to ${w} at ${t.toFixed(2)} along`);
      previous = w;
    }
  });

  test('a rigid bone still moves as one piece', () => {
    // The head keeps bend 0 on purpose. Faces do not bend.
    assert.equal(HEAD.bend, 0);
    const mid = [0, 1, 2].map((i) => (HEAD.pivot[i] + HEAD.tip[i]) / 2);
    const tip = HEAD.tip;
    assert.ok(Math.abs(
      weightFor(mid[0], mid[1], mid[2], HEAD) - weightFor(tip[0], tip[1], tip[2], HEAD),
    ) < 1e-9, 'the head is bending');
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

describe('the spine keeps the feet on the ground', () => {
  test('nothing at or below the hips turns at all', () => {
    /*
      THE COMPLAINT THIS ANSWERS: the body leaned as one block with its feet
      welded to it, which is a statue being tipped. A tube with a radius
      cannot fix it - the legs sit directly under the hips, inside any radius
      wide enough to hold the torso - so the spine is a height ramp instead,
      and a height ramp cannot reach down.
    */
    for (const y of [0, 0.05, 0.12, 0.2, SPINE.hip]) {
      assert.equal(spineDrive(y), 0, `the body bent at y ${y}, where the legs are`);
    }
  });

  test('the chest and everything riding on it carry the whole bend', () => {
    assert.equal(spineDrive(SPINE.chest), 1);
    assert.equal(spineDrive(0.8), 1, 'the head should ride on the chest');
    assert.equal(spineDrive(1), 1);
  });

  test('it only ever rises, and eases in at the hip', () => {
    let previous = -1;
    for (let y = 0; y <= 1.0001; y += 0.01) {
      const d = spineDrive(y);
      assert.ok(d >= previous - 1e-12, `the bend fell back to ${d} at y ${y.toFixed(2)}`);
      assert.ok(d >= 0 && d <= 1, `drive ${d} at y ${y.toFixed(2)}`);
      previous = d;
    }
    // Eased, not linear: a linear ramp creases at the waist, and a crease in
    // a soft body is a hinge.
    const quarter = spineDrive(SPINE.hip + (SPINE.chest - SPINE.hip) * 0.25);
    assert.ok(quarter < 0.25, `the hip creases: ${quarter.toFixed(3)} a quarter of the way up`);
  });

  test('every vertex gets a spine weight, and the lowest get none', () => {
    const positions = new Float32Array([
      0, 0.02, 0, // a foot
      0, 0.4, 0, // the belly
      0, 0.9, 0, // the head
    ]);
    const { spine, moved } = weightBuffers(positions);
    assert.equal(spine[0], 0);
    assert.ok(spine[1] > 0 && spine[1] < 1);
    assert.equal(spine[2], 1);
    assert.equal(moved.spine, 2);
  });
});
