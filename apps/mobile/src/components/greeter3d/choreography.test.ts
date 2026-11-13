import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  CLIP_MS, PERFORMANCES, REST, blend, blinkAt, nextPerformance, poseAt, volumeOf, widthFor,
  type ClipName, type Pose,
} from './choreography.ts';

const FINITE: ClipName[] = ['greet', 'jump', 'dance'];
/** Every clip sampled every 10 ms, which is finer than any frame it runs at. */
const frames = (clip: ClipName, overrun = 0): Pose[] => {
  const end = (CLIP_MS[clip] || 3000) + overrun;
  const out: Pose[] = [];
  for (let ms = 0; ms <= end; ms += 10) out.push(poseAt(clip, ms));
  return out;
};

describe('squash keeps the body a body', () => {
  test('width is derived from height so volume never changes', () => {
    /*
      The one relationship that makes squash read as a compressed body rather
      than a shrunken one. If a later edit sets a width directly, this fails.
    */
    for (const squash of [0.6, 0.8, 0.95, 1, 1.05, 1.2, 1.4]) {
      assert.ok(Math.abs(volumeOf(squash) - 1) < 1e-9, `volume moved at squash ${squash}`);
    }
  });

  test('a squashed body is wider and a stretched one is narrower', () => {
    assert.ok(widthFor(0.8) > 1);
    assert.ok(widthFor(1.25) < 1);
  });
});

describe('every performance starts and ends standing', () => {
  for (const clip of FINITE) {
    test(`${clip} begins at rest`, () => {
      /*
        A clip that starts anywhere but rest jumps on its first frame, which
        is the most visible single flaw an animation can have - it happens on
        the exact frame the viewer's eye is drawn to the thing that moved.
      */
      const first = poseAt(clip, 0);
      assert.ok(Math.abs(first.lift) < 0.005, `${clip} starts ${first.lift} off the ground`);
      assert.ok(Math.abs(first.lean) < 0.01, `${clip} starts leaning ${first.lean}`);
      assert.ok(Math.abs(first.squash - 1) < 0.01, `${clip} starts at squash ${first.squash}`);
      assert.ok(Math.abs(first.wave) < 0.02, `${clip} starts with the arm at ${first.wave}`);
      assert.ok(Math.abs(first.wag) < 0.02, `${clip} starts with the tail at ${first.wag}`);
      assert.ok(Math.abs(first.waveOut) < 0.02, `${clip} starts reaching ${first.waveOut}`);
      assert.ok(Math.abs(first.torso) < 0.02, `${clip} starts bent ${first.torso}`);
    });

    test(`${clip} returns to rest and stays there`, () => {
      const after = poseAt(clip, CLIP_MS[clip] + 500);
      assert.deepEqual(after, REST);
      const last = poseAt(clip, CLIP_MS[clip] - 10);
      assert.ok(Math.abs(last.lift) < 0.01, `${clip} ends ${last.lift} off the ground`);
      assert.ok(Math.abs(last.squash - 1) < 0.03, `${clip} ends at squash ${last.squash}`);
    });
  }
});

describe('nothing leaves the stage or turns inside out', () => {
  for (const clip of ['idle', ...FINITE] as ClipName[]) {
    test(`${clip} stays above the ground and in frame`, () => {
      for (const p of frames(clip)) {
        assert.ok(p.lift >= -1e-9, `${clip} sank to ${p.lift}`);
        assert.ok(p.lift < 0.5, `${clip} flew to ${p.lift}`);
        assert.ok(Math.abs(p.drift) < 0.12, `${clip} drifted ${p.drift}`);
        assert.ok(Math.abs(p.lean) < 0.35, `${clip} leaned ${p.lean} rad`);
      }
    });

    test(`${clip} never inverts or collapses`, () => {
      for (const p of frames(clip)) {
        assert.ok(p.squash > 0.5 && p.squash < 1.6, `${clip} hit squash ${p.squash}`);
      }
    });

    test(`${clip} has no seam a viewer would see as a pop`, () => {
      /*
        SAMPLED AT HALF A MILLISECOND, deliberately. A clip is piecewise, and
        the failure this is built to catch is two segments that do not meet -
        a step change, which is a pop on screen whatever the frame rate.

        Sampling that finely separates the two cases cleanly. Over half a
        millisecond the fastest legitimate move in any clip - the landing
        squash, 0.40 in 115 ms - travels under 0.002, while a seam jumps its
        whole size however short the interval. So 0.004 passes every real
        motion and fails every discontinuity. Three of them, when it was
        written: 0.02 of lift at the launch, and 0.09 and 0.30 of squash at
        the two seams around the arc.
      */
      const end = CLIP_MS[clip] || 3000;
      let previous = poseAt(clip, 0);
      for (let ms = 0.5; ms <= end; ms += 0.5) {
        const now = poseAt(clip, ms);
        assert.ok(Math.abs(now.lift - previous.lift) < 0.004,
          `${clip} lift stepped ${(now.lift - previous.lift).toFixed(4)} at ${ms} ms`);
        assert.ok(Math.abs(now.squash - previous.squash) < 0.004,
          `${clip} squash stepped ${(now.squash - previous.squash).toFixed(4)} at ${ms} ms`);
        assert.ok(Math.abs(now.lean - previous.lean) < 0.004,
          `${clip} lean stepped ${(now.lean - previous.lean).toFixed(4)} at ${ms} ms`);
        assert.ok(Math.abs(now.wave - previous.wave) < 0.006,
          `${clip} wave stepped ${(now.wave - previous.wave).toFixed(4)} at ${ms} ms`);
        assert.ok(Math.abs(now.wag - previous.wag) < 0.006,
          `${clip} wag stepped ${(now.wag - previous.wag).toFixed(4)} at ${ms} ms`);
        assert.ok(Math.abs(now.waveOut - previous.waveOut) < 0.006,
          `${clip} waveOut stepped ${(now.waveOut - previous.waveOut).toFixed(4)} at ${ms} ms`);
        assert.ok(Math.abs(now.torso - previous.torso) < 0.006,
          `${clip} torso stepped ${(now.torso - previous.torso).toFixed(4)} at ${ms} ms`);
        previous = now;
      }
    });
  }
});

describe('the jump is a jump', () => {
  test('it crouches before it leaves the ground', () => {
    // Anticipation: the lowest squash of the take-off happens while the feet
    // are still down. Without this the jump reads as a cut.
    const f = frames('jump');
    const leaves = f.findIndex((p) => p.lift > 0.01);
    assert.ok(leaves > 0, 'it never left the ground');
    const beforeTakeOff = f.slice(0, leaves);
    assert.ok(Math.min(...beforeTakeOff.map((p) => p.squash)) < 0.9, 'no crouch before the jump');
  });

  test('it gets properly airborne and comes back down', () => {
    const lifts = frames('jump').map((p) => p.lift);
    assert.ok(Math.max(...lifts) > 0.25, `it only reached ${Math.max(...lifts)}`);
    assert.equal(poseAt('jump', CLIP_MS.jump).lift, 0);
  });

  test('it spends most of its airtime near the top', () => {
    /*
      The arc is a parabola, so by the shape of one, half the airborne samples
      sit in the upper quarter of the height. That is what makes a jump feel
      like a jump; a linear up-and-down reads as a lift.
    */
    const airborne = frames('jump').filter((p) => p.lift > 0.001);
    const peak = Math.max(...airborne.map((p) => p.lift));
    const high = airborne.filter((p) => p.lift > peak * 0.75).length;
    assert.ok(high / airborne.length > 0.4, `only ${(high / airborne.length * 100).toFixed(0)}% near the top`);
  });

  test('the landing is the deepest squash in the clip', () => {
    const f = frames('jump');
    const lowest = f.reduce((best, p, i) => (p.squash < f[best].squash ? i : best), 0);
    const landed = f.findIndex((p, i) => i > 10 && p.lift === 0 && f[i - 1].lift > 0);
    assert.ok(landed > 0);
    assert.ok(lowest >= landed - 2, 'the deepest squash is not the landing');
  });
});

describe('the dance keeps time', () => {
  test('it sways to both sides, not just one', () => {
    const drifts = frames('dance').map((p) => p.drift);
    assert.ok(Math.max(...drifts) > 0.03, 'it never went one way');
    assert.ok(Math.min(...drifts) < -0.03, 'it never came back');
  });

  test('it bounces several times rather than once', () => {
    // Count the rises: a dance has a beat, a lurch does not.
    const lifts = frames('dance').map((p) => p.lift);
    let peaks = 0;
    for (let i = 1; i < lifts.length - 1; i += 1) {
      if (lifts[i] > lifts[i - 1] && lifts[i] >= lifts[i + 1] && lifts[i] > 0.01) peaks += 1;
    }
    assert.ok(peaks >= 6, `only ${peaks} bounces in the whole dance`);
  });

  test('it turns, so it is not a metronome', () => {
    const turns = frames('dance').map((p) => Math.abs(p.turn));
    assert.ok(Math.max(...turns) > 0.3, `it barely turned: ${Math.max(...turns)}`);
  });
});

describe('idle', () => {
  test('it never stops, and never gets loud', () => {
    const late = poseAt('idle', 10 * 60 * 1000);
    assert.notDeepEqual(late, REST, 'idle went still after ten minutes');
    for (const p of frames('idle', 20000)) {
      // Roomier than it was, because the idle now looks around and shifts
      // its weight. Still far below any performance: an idle that reaches
      // the dance's amplitude is not an idle.
      assert.ok(Math.abs(p.lift) < 0.07, `idle lifted ${p.lift}`);
      assert.ok(Math.abs(p.lean) < 0.14, `idle leaned ${p.lean}`);
    }
  });

  test('it actually does something, several different somethings', () => {
    /*
      THE TEST THAT HOLDS THE POINT OF THIS. Breathing alone is what a
      sleeping animal does; an awake one looks around unprompted. Over
      twenty seconds it should turn its head properly at least twice - and
      not to the same place, or it is one gesture on a loop.
    */
    const glances = frames('idle', 20000).map((p) => p.glance);
    assert.ok(Math.max(...glances) > 0.3, `it never looked one way: ${Math.max(...glances)}`);
    assert.ok(Math.min(...glances) < -0.3, `it never looked the other: ${Math.min(...glances)}`);

    const tilts = frames('idle', 20000).map((p) => Math.abs(p.tilt));
    assert.ok(Math.max(...tilts) > 0.2, 'it never cocked its head at anything');

    const wags = frames('idle', 20000).map((p) => Math.abs(p.wag));
    assert.ok(Math.max(...wags) > 0.35, 'the tail never flicked');
  });

  test('its breaks do not all land on the same part of a breath', () => {
    /*
      Five breaks every 4.7 s against a 2.6 s breath: the pattern only comes
      round at the lowest common multiple of the two, minutes away. If a
      later edit makes the break interval a multiple of the breath, the same
      gesture starts landing at the same moment every time and the loop
      becomes visible - which is the whole thing these were added to avoid.
    */
    const breathAtBreak = (n: number) => poseAt('idle', n * 4700 + 20).squash;
    const first = breathAtBreak(0);
    const repeats = [1, 2, 3, 4].filter((n) => Math.abs(breathAtBreak(n) - first) < 1e-6);
    assert.equal(repeats.length, 0, 'a break lands on the same point of the breath each time');
  });

  test('its two rhythms do not line up', () => {
    /*
      Breathing at 2.6 s and weight at 4.1 s: the pattern repeats only every
      lowest common multiple of the two, which is well past anyone's
      attention span. Equal periods would make one visible loop.
    */
    const a = poseAt('idle', 1000);
    const b = poseAt('idle', 1000 + 2600);
    assert.ok(Math.abs(a.drift - b.drift) > 1e-4, 'the sway repeats with the breath');
  });
});

describe('blinking', () => {
  /** Every blink in a stretch of time, as [start, peak, end]. */
  const blinks = (span: number) => {
    const out: { start: number; peak: number; end: number; top: number }[] = [];
    let open = true;
    let current: { start: number; peak: number; end: number; top: number } | null = null;
    for (let ms = 0; ms <= span; ms += 1) {
      const v = blinkAt(ms);
      if (open && v > 0.02) {
        current = { start: ms, peak: ms, end: ms, top: v };
        open = false;
      } else if (!open && current) {
        if (v > current.top) { current.top = v; current.peak = ms; }
        if (v <= 0.02) { current.end = ms; out.push(current); current = null; open = true; }
      }
    }
    return out;
  };

  test('the eyes are open almost all of the time', () => {
    let shut = 0;
    for (let ms = 0; ms <= 60000; ms += 1) if (blinkAt(ms) > 0.5) shut += 1;
    const share = shut / 60000;
    assert.ok(share > 0.002 && share < 0.06, `eyes are more than half shut ${(share * 100).toFixed(1)}% of the time`);
  });

  test('a blink shuts fully and opens fully', () => {
    const all = blinks(60000);
    assert.ok(all.length > 8, `only ${all.length} blinks in a minute`);
    for (const b of all) assert.ok(b.top > 0.98, `a blink only reached ${b.top}`);
    assert.equal(blinkAt(0), 0, 'it starts mid-blink');
  });

  test('it shuts faster than it opens', () => {
    /*
      A lid drops and drifts back up. Equal speeds read as a mechanical
      shutter, and reversing the two reads as a wink.
    */
    for (const b of blinks(30000)) {
      const closing = b.peak - b.start;
      const opening = b.end - b.peak;
      assert.ok(opening > closing * 1.4, `closing ${closing} ms, opening ${opening} ms`);
    }
  });

  test('the gaps between blinks are never twice the same', () => {
    const starts = blinks(60000).map((b) => b.start);
    const gaps = starts.slice(1).map((s, i) => s - starts[i]);
    const wide = gaps.filter((gp) => gp > 400); // skip the halves of a double
    assert.equal(new Set(wide).size, wide.length, 'two gaps came out identical');
    assert.ok(Math.max(...wide) - Math.min(...wide) > 800, 'the rhythm is too even to look alive');
  });

  test('some of them come in pairs, as real ones do', () => {
    const starts = blinks(120000).map((b) => b.start);
    const gaps = starts.slice(1).map((s, i) => s - starts[i]);
    const doubles = gaps.filter((gp) => gp < 400).length;
    assert.ok(doubles > 2, `no double blinks in two minutes (${doubles})`);
    assert.ok(doubles < gaps.length * 0.5, 'it is blinking in pairs more often than not');
  });

  test('it is the same every run, so this test means something', () => {
    // A real random source here would leave these assertions testing averages.
    assert.equal(blinkAt(7321), blinkAt(7321));
    assert.deepEqual(blinks(9000).map((b) => b.start), blinks(9000).map((b) => b.start));
  });

  test('it never leaves 0..1', () => {
    for (let ms = 0; ms <= 40000; ms += 1) {
      const v = blinkAt(ms);
      assert.ok(v >= 0 && v <= 1, `blink ${v} at ${ms}`);
    }
  });
});

describe('blending and the tap order', () => {
  test('blend reaches both ends exactly', () => {
    const a = poseAt('dance', 900);
    assert.deepEqual(blend(a, REST, 0), a);
    assert.deepEqual(blend(a, REST, 1), REST);
  });

  test('blend clamps rather than extrapolating past either pose', () => {
    assert.deepEqual(blend(poseAt('dance', 900), REST, 4), REST);
  });

  test('a tap cycles through every performance and comes back round', () => {
    let clip = nextPerformance(null);
    const seen = [clip];
    for (let i = 1; i < PERFORMANCES.length; i += 1) {
      clip = nextPerformance(clip);
      seen.push(clip);
    }
    assert.deepEqual([...seen].sort(), [...PERFORMANCES].sort());
    assert.equal(nextPerformance(seen[seen.length - 1]), seen[0]);
  });
});

describe('the waist carries the lean, not the feet', () => {
  test('every performance bends more at the waist than it tips as a whole', () => {
    /*
      THE STATUE TEST. Tilting the whole object pivots the FEET, which slide
      and lift; bending at the waist leaves them on the ground and moves the
      body over them. A clip that goes back to leaning the whole figure will
      fail here, which is the point - it is the single change that stopped
      this reading as a tipped statue.
    */
    for (const clip of FINITE) {
      const f = frames(clip);
      const torso = Math.max(...f.map((p) => Math.abs(p.torso)));
      const lean = Math.max(...f.map((p) => Math.abs(p.lean)));
      assert.ok(torso > lean * 2,
        `${clip} leans ${lean.toFixed(3)} and bends only ${torso.toFixed(3)}`);
    }
  });

  test('the greeting swings the hand on two axes, out of phase', () => {
    /*
      One axis is a lever: the hand travels a straight line. Two in phase is
      a diagonal line and no better. The pair has to peak at different times
      for the hand to go round, so the frame where the swing is widest must
      NOT be the frame where the reach is.
    */
    const f = frames('greet');
    const swingPeak = f.reduce((best, p, i) => (Math.abs(p.wave) > Math.abs(f[best].wave) ? i : best), 0);
    const reachPeak = f.reduce((best, p, i) => (Math.abs(p.waveOut) > Math.abs(f[best].waveOut) ? i : best), 0);
    assert.ok(Math.max(...f.map((p) => Math.abs(p.waveOut))) > 0.1, 'the hand never reached out at all');
    assert.ok(Math.abs(swingPeak - reachPeak) > 4,
      `both axes peak together at sample ${swingPeak}, so the hand travels a line`);
  });
});
