import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  BONE_SPRINGS, MAX_STEP_S, atRest, step, stepBone, type SpringState,
} from './spring.ts';

/** Run a spring at 60 fps and keep every value it passed through. */
const chase = (target: number, seconds: number, stiffness: number, damping: number) => {
  let s = atRest(0);
  const path: number[] = [];
  for (let i = 0; i < Math.round(seconds * 60); i += 1) {
    s = step(s, target, 1 / 60, stiffness, damping);
    path.push(s.value);
  }
  return path;
};

const boneChase = (target: number, seconds: number, bone: keyof typeof BONE_SPRINGS) => {
  let s = atRest(0);
  const path: number[] = [];
  for (let i = 0; i < Math.round(seconds * 60); i += 1) {
    s = stepBone(s, target, 1 / 60, bone);
    path.push(s.value);
  }
  return path;
};

describe('a spring arrives, and arrives late', () => {
  test('it reaches its target and stays there', () => {
    const path = chase(1, 3, 200, 20);
    assert.ok(Math.abs(path[path.length - 1] - 1) < 0.01, `settled at ${path[path.length - 1]}`);
  });

  test('it does not get there instantly, which is the entire point', () => {
    /*
      The bug this replaces: the bone was assigned the clip's value, so it
      was always exactly on target and nothing ever trailed anything. One
      frame in, a spring should still be most of the way behind.
    */
    const path = chase(1, 3, 200, 20);
    assert.ok(path[0] < 0.2, `arrived at ${path[0]} on the very first frame`);
  });

  test('a loose bone lags further behind than a stiff one', () => {
    /*
      This gap is what reads as some parts being floppier than others, and
      nobody animates it - it falls out of the two bones having different
      stiffness. An eighth of a second after the body commits to a move, the
      waist is nearly there and the tail is still well behind it.
    */
    const spine = boneChase(1, 0.15, 'spine').at(-1)!;
    const tail = boneChase(1, 0.15, 'tail').at(-1)!;
    /*
      The GAP is the assertion, not either number on its own. An absolute
      threshold here is really a threshold on stiffness, and it failed the
      first time the springs were softened for looking too hard - which is a
      test complaining about a deliberate change rather than about a bug.
    */
    assert.ok(spine > tail, `the waist should lead: ${spine.toFixed(2)} vs ${tail.toFixed(2)}`);
    assert.ok(spine - tail > 0.2, `too little between them: ${(spine - tail).toFixed(2)}`);
    assert.ok(tail < 0.8, `nothing is trailing at all: the tail reached ${tail.toFixed(2)}`);
  });
});

describe('overshoot, which is where the life is', () => {
  test('the tail carries past its target and comes back', () => {
    const path = boneChase(1, 3, 'tail');
    assert.ok(Math.max(...path) > 1.02, `the tail never overshot: peak ${Math.max(...path)}`);
    assert.ok(Math.abs(path[path.length - 1] - 1) < 0.02, 'and never settled');
  });

  test('the head does not, because a wobbling head is a bobblehead', () => {
    const path = boneChase(1, 3, 'headYaw');
    assert.ok(Math.max(...path) < 1.08, `the head overshot to ${Math.max(...path)}`);
  });

  test('every bone settles rather than ringing forever', () => {
    for (const bone of Object.keys(BONE_SPRINGS) as (keyof typeof BONE_SPRINGS)[]) {
      const path = boneChase(1, 4, bone);
      assert.ok(Math.abs(path[path.length - 1] - 1) < 0.02, `${bone} settled at ${path[path.length - 1]}`);
    }
  });
});

describe('it cannot explode', () => {
  test('a frame after the tab was asleep does not fling the bone away', () => {
    /*
      THE ONE THAT ONLY BITES DURING A DEMO. A backgrounded tab stops
      painting; the first frame back carries the whole gap. Integrated in one
      step that is not lag, it is divergence - the bone leaves for an
      enormous angle and the model turns inside out.
    */
    let s = atRest(0);
    s = step(s, 1, 30, 320, 26); // thirty seconds in one frame
    assert.ok(Number.isFinite(s.value), 'the bone left for infinity');
    assert.ok(Math.abs(s.value) < 2, `one frame moved it to ${s.value}`);
  });

  test('a long gap resolves over a few frames instead of one', () => {
    let s = atRest(0);
    for (let i = 0; i < 20; i += 1) s = step(s, 1, 5, 320, 26);
    assert.ok(Math.abs(s.value - 1) < 0.05, `ended at ${s.value}`);
  });

  test('the clamp is the published one, and negative time does nothing', () => {
    const big = step(atRest(0), 1, 999, 320, 26);
    const clamped = step(atRest(0), 1, MAX_STEP_S, 320, 26);
    assert.deepEqual(big, clamped);
    assert.deepEqual(step(atRest(0.3), 1, -1, 320, 26), atRest(0.3));
    assert.deepEqual(step(atRest(0.3), 1, 0, 320, 26), atRest(0.3));
  });

  test('it stays finite when chased by a target that never stops moving', () => {
    let s: SpringState = atRest(0);
    for (let i = 0; i < 2000; i += 1) {
      s = stepBone(s, Math.sin(i / 7) * 0.6, 1 / 60, 'tail');
      assert.ok(Number.isFinite(s.value) && Math.abs(s.value) < 3, `ran away to ${s.value} at frame ${i}`);
    }
  });
});
