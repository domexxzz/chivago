/**
 * Driving a route past the engine, one fix at a time.
 *
 * The routes here are BUILT, not fetched, and that is deliberate: each one
 * is a shape that breaks a particular naive implementation - a hairpin, a
 * pair of parallel roads forty metres apart, a loop that crosses itself -
 * and a real route would hide which of them was being tested. The metres
 * are real metres: `at()` lays points out with a flat projection at Samui's
 * latitude, so "sixty metres off the road" in a test is sixty metres on the
 * ground to within a few centimetres.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NAV_TUNING, advance, angleDelta, approachAngle, cameraBearing, followPitch, followZoom,
  matchToRoute, nearestOnSegment, remainingLine, routeBearingAt, routeMetrics, travelledLine,
  type NavFix, type NavProgress,
} from './navigation-progress.ts';
import type { ManeuverType, NavRoute } from './navigation.ts';
import { metresBetween } from './presence.ts';

const LAT0 = 9.5;
const LNG0 = 100.0;
const M_PER_DEG = 111_320;

/** A point `east` metres east and `north` metres north of the origin. */
const at = (east: number, north: number): [number, number] => [
  LNG0 + east / (M_PER_DEG * Math.cos((LAT0 * Math.PI) / 180)),
  LAT0 + north / M_PER_DEG,
];

const fixAt = (east: number, north: number, over: Partial<NavFix> = {}): NavFix => {
  const [lng, lat] = at(east, north);
  return { lat, lng, accuracyM: 8, headingDeg: null, speedMps: 1.4, timestamp: 1_000, ...over };
};

/** A route with one maneuver per corner, timed at a flat metre per second. */
function route(points: [number, number][], corners: number[] = []): NavRoute {
  const metrics = routeMetrics(points);
  const stops = [0, ...corners, points.length - 1];
  const maneuvers = stops.map((index, i) => {
    const end = stops[i + 1] ?? index;
    const span = (metrics.cumulative[end] ?? 0) - (metrics.cumulative[index] ?? 0);
    const type: ManeuverType = i === 0 ? 'start' : i === stops.length - 1 ? 'arrive' : 'turn-left';
    return {
      type,
      streets: [] as string[],
      metres: Math.round(span),
      seconds: span,
      beginIndex: index,
      endIndex: end,
      bearingAfter: null,
      roundaboutExit: null,
    };
  });
  return {
    mode: 'walk',
    metres: Math.round(metrics.totalM),
    seconds: Math.round(metrics.totalM),
    line: points,
    maneuvers,
  };
}

/** Straight east for a kilometre, a point every hundred metres. */
const STRAIGHT = route([0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map((m) => at(m, 0)));
const STRAIGHT_END = { lat: at(1000, 0)[1], lng: at(1000, 0)[0] };

/** Feed a sequence of fixes through, returning the last answer. */
function drive(r: NavRoute, destination: { lat: number; lng: number }, fixes: NavFix[]): NavProgress {
  const metrics = routeMetrics(r.line);
  let state: NavProgress | null = null;
  for (const fix of fixes) state = advance(r, metrics, state, fix, destination)!;
  assert.ok(state);
  return state;
}

describe('putting a fix on the road', () => {
  test('a point beside the line snaps onto it, with the distance it was off by', () => {
    const hit = nearestOnSegment({ lat: at(50, 30)[1], lng: at(50, 30)[0] }, at(0, 0), at(100, 0));
    assert.ok(Math.abs(hit.metres - 30) < 0.5, `${hit.metres} should be about 30`);
    assert.ok(Math.abs(hit.t - 0.5) < 0.01);
  });

  test('a point beyond the end snaps to the end, not to thin air', () => {
    const hit = nearestOnSegment({ lat: at(300, 0)[1], lng: at(300, 0)[0] }, at(0, 0), at(100, 0));
    assert.equal(hit.t, 1);
    assert.ok(Math.abs(hit.metres - 200) < 1);
  });

  test('a segment of zero length does not divide by zero', () => {
    const hit = nearestOnSegment({ lat: LAT0, lng: LNG0 }, at(0, 0), at(0, 0));
    assert.equal(hit.t, 0);
    assert.ok(Number.isFinite(hit.metres));
  });

  test('distance along the route is measured, not guessed', () => {
    const metrics = routeMetrics(STRAIGHT.line);
    const match = matchToRoute(STRAIGHT.line, metrics, { lat: at(250, 5)[1], lng: at(250, 5)[0] }, null);
    assert.ok(match);
    assert.ok(Math.abs(match.travelledM - 250) < 1, `${match.travelledM}`);
    assert.ok(Math.abs(match.offRouteM - 5) < 0.5);
  });
});

describe('the window, and the shapes that need it', () => {
  /*
    TWO ROADS, FORTY METRES APART, joined at both ends: out along the north
    one and back along the south. The global nearest point for a traveller on
    the outbound road is ambiguous for the whole kilometre, and a naive
    matcher reports them as already on the way home.
  */
  const PARALLEL = route([
    at(0, 0), at(250, 0), at(500, 0), at(750, 0), at(1000, 0),
    at(1000, -40), at(750, -40), at(500, -40), at(250, -40), at(0, -40),
  ]);

  test('a traveller on the outbound road is not matched onto the return one', () => {
    // Five metres south of the outbound road, which is thirty-five metres
    // from the return road - near enough that a global search wobbles.
    const state = drive(PARALLEL, { lat: at(0, -40)[1], lng: at(0, -40)[0] }, [
      fixAt(0, 0, { timestamp: 1_000 }),
      fixAt(250, -5, { timestamp: 2_000 }),
      fixAt(500, -5, { timestamp: 3_000 }),
      fixAt(750, -5, { timestamp: 4_000 }),
    ]);
    assert.ok(state.travelledM > 700 && state.travelledM < 800, `${state.travelledM}`);
    assert.equal(state.offRoute, false);
  });

  test('and once they have turned round, the return road is where they are', () => {
    const metrics = routeMetrics(PARALLEL.line);
    let state: NavProgress | null = null;
    const path: NavFix[] = [];
    for (let m = 0; m <= 1000; m += 100) path.push(fixAt(m, 0, { timestamp: 1_000 + m }));
    for (let m = 1000; m >= 0; m -= 100) path.push(fixAt(m, -40, { timestamp: 3_000 + (1000 - m) }));
    for (const fix of path) state = advance(PARALLEL, metrics, state, fix, { lat: at(0, -40)[1], lng: at(0, -40)[0] });
    assert.ok(state);
    assert.ok(state.travelledM > 2_000, `${state.travelledM} should be near the end of 2080 m`);
    assert.equal(state.offRoute, false);
  });

  /*
    A FIGURE OF EIGHT. The crossing point belongs to two different stretches
    of the same route, nine hundred metres apart along it.
  */
  const CROSSING = route([
    at(0, 0), at(200, 200), at(400, 0), at(200, -200), at(0, 0), at(-200, 200),
  ]);

  test('at the crossing, the traveller stays on the stretch they were already on', () => {
    const start = { lat: at(-200, 200)[1], lng: at(-200, 200)[0] };
    const early = drive(CROSSING, start, [fixAt(20, 20), fixAt(100, 100, { timestamp: 2_000 })]);
    assert.ok(early.travelledM < 200, `${early.travelledM}`);

    const late = drive(CROSSING, start, [
      fixAt(20, 20, { timestamp: 1_000 }),
      fixAt(200, 200, { timestamp: 2_000 }),
      fixAt(400, 0, { timestamp: 3_000 }),
      fixAt(200, -200, { timestamp: 4_000 }),
      // Back at the crossing, a kilometre along the route.
      fixAt(0, 0, { timestamp: 5_000 }),
    ]);
    assert.ok(late.travelledM > 1_000, `${late.travelledM} should be past the crossing the second time`);
  });

  test('a phone that jumps across town is followed, not ignored', () => {
    const state = drive(STRAIGHT, STRAIGHT_END, [
      fixAt(0, 0, { timestamp: 1_000 }),
      fixAt(50, 0, { timestamp: 2_000 }),
      // 800 m on in one fix: further than the window, and decisively nearer
      // the road there than anywhere inside it.
      fixAt(800, 0, { timestamp: 3_000 }),
    ]);
    assert.ok(Math.abs(state.travelledM - 800) < 5, `${state.travelledM}`);
  });

  test('walking back is allowed; progress is not latched forward', () => {
    const state = drive(STRAIGHT, STRAIGHT_END, [
      fixAt(300, 0, { timestamp: 1_000 }),
      fixAt(250, 0, { timestamp: 2_000 }),
      fixAt(200, 0, { timestamp: 3_000 }),
    ]);
    assert.ok(Math.abs(state.travelledM - 200) < 5, `${state.travelledM}`);
  });

  test('jitter sideways barely moves the distance along the road', () => {
    const steady = drive(STRAIGHT, STRAIGHT_END, [fixAt(400, 0)]);
    const jittered = drive(STRAIGHT, STRAIGHT_END, [
      fixAt(400, 0, { timestamp: 1_000 }),
      fixAt(400, 18, { timestamp: 2_000 }),
      fixAt(400, -18, { timestamp: 3_000 }),
    ]);
    assert.ok(Math.abs(jittered.travelledM - steady.travelledM) < 2);
  });
});

describe('deciding somebody has left the road', () => {
  test('one bad fix is not a wrong turn', () => {
    const state = drive(STRAIGHT, STRAIGHT_END, [
      fixAt(100, 0, { timestamp: 1_000 }),
      fixAt(200, 120, { timestamp: 2_000 }),
    ]);
    assert.equal(state.offRouteStreak, 1);
    assert.equal(state.offRoute, false);
  });

  test('three in a row is', () => {
    const state = drive(STRAIGHT, STRAIGHT_END, [
      fixAt(100, 0, { timestamp: 1_000 }),
      fixAt(200, 120, { timestamp: 2_000 }),
      fixAt(220, 160, { timestamp: 3_000 }),
      fixAt(240, 200, { timestamp: 4_000 }),
    ]);
    assert.equal(state.offRouteStreak, 3);
    assert.equal(state.offRoute, true);
  });

  test('a fix the phone cannot vouch for never counts towards it', () => {
    const state = drive(STRAIGHT, STRAIGHT_END, [
      fixAt(100, 0, { timestamp: 1_000 }),
      fixAt(200, 300, { accuracyM: 90, timestamp: 2_000 }),
      fixAt(220, 320, { accuracyM: 120, timestamp: 3_000 }),
      fixAt(240, 340, { accuracyM: 85, timestamp: 4_000 }),
    ]);
    assert.equal(state.confident, false);
    assert.equal(state.offRouteStreak, 0);
    assert.equal(state.offRoute, false);
    // The dot still moved, which is the point: hiding it would be worse.
    assert.ok(state.offRouteM > 200);
  });

  test('returning to the road clears the count at once', () => {
    const state = drive(STRAIGHT, STRAIGHT_END, [
      fixAt(100, 0, { timestamp: 1_000 }),
      fixAt(200, 120, { timestamp: 2_000 }),
      fixAt(220, 160, { timestamp: 3_000 }),
      fixAt(300, 0, { timestamp: 4_000 }),
    ]);
    assert.equal(state.offRouteStreak, 0);
    assert.equal(state.offRoute, false);
  });

  test('forty metres off is on the road; sixty is not', () => {
    const near = drive(STRAIGHT, STRAIGHT_END, [fixAt(300, 40, { timestamp: 1_000 })]);
    assert.equal(near.offRouteStreak, 0);
    const far = drive(STRAIGHT, STRAIGHT_END, [fixAt(300, 60, { timestamp: 1_000 })]);
    assert.equal(far.offRouteStreak, 1);
  });
});

describe('deciding somebody has arrived', () => {
  test('two fixes inside the circle, and not one', () => {
    const one = drive(STRAIGHT, STRAIGHT_END, [
      fixAt(900, 0, { timestamp: 1_000 }),
      fixAt(985, 0, { timestamp: 2_000 }),
    ]);
    assert.equal(one.arrivedStreak, 1);
    assert.equal(one.arrived, false);

    const two = drive(STRAIGHT, STRAIGHT_END, [
      fixAt(900, 0, { timestamp: 1_000 }),
      fixAt(985, 0, { timestamp: 2_000 }),
      fixAt(990, 0, { timestamp: 3_000 }),
    ]);
    assert.equal(two.arrived, true);
  });

  test('a single jumped fix at the door does not say "arrived"', () => {
    const state = drive(STRAIGHT, STRAIGHT_END, [
      fixAt(100, 0, { timestamp: 1_000 }),
      fixAt(1000, 0, { timestamp: 2_000 }),
      fixAt(100, 0, { timestamp: 3_000 }),
    ]);
    assert.equal(state.arrived, false);
    assert.equal(state.arrivedStreak, 0);
  });

  test('a fix the phone cannot vouch for cannot arrive either', () => {
    const state = drive(STRAIGHT, STRAIGHT_END, [
      fixAt(995, 0, { accuracyM: 120, timestamp: 1_000 }),
      fixAt(998, 0, { accuracyM: 140, timestamp: 2_000 }),
      fixAt(999, 0, { accuracyM: 160, timestamp: 3_000 }),
    ]);
    assert.equal(state.arrived, false);
  });

  test('a doubtful fix widens the circle, but only so far', () => {
    // Forty-five metres short, with the phone forty-five metres unsure: it
    // cannot prove they are not there, so it says they are.
    const doubtful = drive(STRAIGHT, STRAIGHT_END, [
      fixAt(955, 0, { accuracyM: 45, timestamp: 1_000 }),
      fixAt(956, 0, { accuracyM: 45, timestamp: 2_000 }),
    ]);
    assert.equal(doubtful.arrived, true);
    // The same distance with a confident fix is still on the road.
    const confident = drive(STRAIGHT, STRAIGHT_END, [
      fixAt(955, 0, { accuracyM: 6, timestamp: 1_000 }),
      fixAt(956, 0, { accuracyM: 6, timestamp: 2_000 }),
    ]);
    assert.equal(confident.arrived, false);
  });

  test('driving past the pin still arrives, because the road has run out', () => {
    const state = drive(STRAIGHT, STRAIGHT_END, [
      fixAt(900, 0, { timestamp: 1_000 }),
      // Past the end of the line, fifty metres beyond the pin.
      fixAt(1050, 0, { timestamp: 2_000 }),
      fixAt(1055, 0, { timestamp: 3_000 }),
    ]);
    assert.equal(state.remainingM, 0);
    assert.equal(state.arrived, true);
  });

  test('a destination off the end of the route - the far side of a car park - still arrives', () => {
    const pin = { lat: at(1000, 70)[1], lng: at(1000, 70)[0] };
    const state = drive(STRAIGHT, pin, [
      fixAt(900, 0, { timestamp: 1_000 }),
      fixAt(1000, 0, { timestamp: 2_000 }),
      fixAt(1000, 0, { timestamp: 3_000 }),
    ]);
    // Seventy metres from the pin, which is more than any circle allows -
    // but the route itself has ended, and standing at its end having been
    // told nothing is the failure this prevents.
    assert.ok(state.toDestinationM > 60);
    assert.equal(state.arrived, true);
  });
});

describe('what is left, and when', () => {
  test('the remainder counts down as the route is walked', () => {
    const start = drive(STRAIGHT, STRAIGHT_END, [fixAt(0, 0)]);
    const half = drive(STRAIGHT, STRAIGHT_END, [fixAt(0, 0), fixAt(500, 0, { timestamp: 2_000 })]);
    assert.ok(Math.abs(start.remainingM - 1000) < 2);
    assert.ok(Math.abs(half.remainingM - 500) < 2);
    assert.ok(Math.abs(half.fraction - 0.5) < 0.01);
  });

  test('the time left comes from the router’s own per-maneuver times, not an average', () => {
    /*
      A kilometre in two halves: the first is a lane that takes ten minutes,
      the second a road that takes one. Prorating the total by distance would
      promise five and a half minutes at the halfway point. The honest answer
      is one.
    */
    const points = [at(0, 0), at(500, 0), at(1000, 0)];
    const metrics = routeMetrics(points);
    const slowThenFast: NavRoute = {
      mode: 'ride', metres: 1000, seconds: 660, line: points,
      maneuvers: [
        { type: 'start', streets: [], metres: 500, seconds: 600, beginIndex: 0, endIndex: 1, bearingAfter: null, roundaboutExit: null },
        { type: 'continue', streets: [], metres: 500, seconds: 60, beginIndex: 1, endIndex: 2, bearingAfter: null, roundaboutExit: null },
      ],
    };
    const half = advance(slowThenFast, metrics, null, fixAt(500, 0), STRAIGHT_END)!;
    assert.ok(Math.abs(half.remainingSeconds - 60) < 5, `${half.remainingSeconds}`);

    const quarter = advance(slowThenFast, metrics, null, fixAt(250, 0), STRAIGHT_END)!;
    // Half of the slow leg (300 s) plus all of the fast one (60 s).
    assert.ok(Math.abs(quarter.remainingSeconds - 360) < 10, `${quarter.remainingSeconds}`);
  });

  test('a route with no maneuvers still has a time left', () => {
    const bare: NavRoute = { ...STRAIGHT, maneuvers: [], seconds: 1000 };
    const state = advance(bare, routeMetrics(bare.line), null, fixAt(600, 0), STRAIGHT_END)!;
    assert.ok(Math.abs(state.remainingSeconds - 400) < 5, `${state.remainingSeconds}`);
    assert.equal(state.onManeuver, -1);
  });
});

describe('which turn to announce', () => {
  /** Out east, left at 400 m, north to 800 m, left again, west to the end. */
  const CORNERS = route(
    [at(0, 0), at(200, 0), at(400, 0), at(400, 200), at(400, 400), at(200, 400)],
    [2, 4],
  );
  const CORNERS_END = { lat: at(200, 400)[1], lng: at(200, 400)[0] };

  test('the junction counted down to is the corner, not the end of the next road', () => {
    const state = drive(CORNERS, CORNERS_END, [fixAt(300, 0)]);
    // 400 m along the line is the first corner; a hundred metres to go.
    assert.ok(Math.abs(state.toNextM - 100) < 2, `${state.toNextM}`);
    assert.equal(state.onManeuver, 0);
    assert.equal(state.nextManeuver, 1);
  });

  test('once round the corner it announces the next one, not the one just taken', () => {
    const state = drive(CORNERS, CORNERS_END, [
      fixAt(300, 0, { timestamp: 1_000 }),
      fixAt(400, 100, { timestamp: 2_000 }),
    ]);
    assert.equal(state.onManeuver, 1);
    assert.equal(state.nextManeuver, 2);
    assert.ok(Math.abs(state.toNextM - 300) < 2, `${state.toNextM}`);
  });

  test('the last maneuver announces itself rather than a twelfth that does not exist', () => {
    const state = drive(CORNERS, CORNERS_END, [
      fixAt(300, 0, { timestamp: 1_000 }),
      fixAt(400, 300, { timestamp: 2_000 }),
      fixAt(250, 400, { timestamp: 3_000 }),
    ]);
    assert.equal(state.nextManeuver, CORNERS.maneuvers.length - 1);
    assert.ok(CORNERS.maneuvers[state.nextManeuver]);
  });
});

describe('which way the camera looks', () => {
  test('north is two degrees from 358, not 356 the other way', () => {
    assert.equal(angleDelta(358, 0), 2);
    assert.equal(angleDelta(0, 358), -2);
    assert.equal(angleDelta(10, 350), -20);
    assert.equal(angleDelta(350, 10), 20);
  });

  test('a step towards a bearing never overshoots, and never leaves the circle', () => {
    assert.equal(approachAngle(350, 10, 30), 10);
    assert.equal(approachAngle(350, 10, 5), 355);
    assert.equal(approachAngle(10, 350, 5), 5);
    for (const from of [0, 90, 180, 270, 359]) {
      for (const to of [0, 45, 200, 359]) {
        const next = approachAngle(from, to, 7);
        assert.ok(next >= 0 && next < 360, `${from}->${to} gave ${next}`);
      }
    }
  });

  test('a standing phone uses the road’s direction, not its own noisy heading', () => {
    const still: NavFix = { ...fixAt(300, 0), speedMps: 0.1, headingDeg: 247 };
    const bearing = cameraBearing(90, still, 90, 1_000);
    // The road runs due east; the 247 is a phone in a pocket.
    assert.equal(bearing, 90);
  });

  test('a moving phone is believed', () => {
    const moving: NavFix = { ...fixAt(300, 0), speedMps: 8, headingDeg: 120 };
    const bearing = cameraBearing(90, moving, 90, 1_000);
    assert.ok(bearing > 90 && bearing <= 120);
  });

  test('the camera turns at a limited rate rather than snapping', () => {
    const moving: NavFix = { ...fixAt(300, 0), speedMps: 8, headingDeg: 270 };
    // A tenth of a second allows twelve degrees at the default rate.
    const bearing = cameraBearing(0, moving, null, 100);
    assert.ok(Math.abs(angleDelta(0, bearing)) <= 12.01, `${bearing}`);
  });

  test('a heading of -1, NaN or null is not a direction', () => {
    const base = { ...fixAt(300, 0), speedMps: 8 };
    assert.equal(cameraBearing(45, { ...base, headingDeg: -1 }, 45, 1_000), 45);
    assert.equal(cameraBearing(45, { ...base, headingDeg: NaN }, 45, 1_000), 45);
    assert.equal(cameraBearing(45, { ...base, headingDeg: null }, 45, 1_000), 45);
  });

  test('with no previous bearing the camera starts pointing the right way, not at north', () => {
    const moving: NavFix = { ...fixAt(300, 0), speedMps: 8, headingDeg: 200 };
    assert.equal(cameraBearing(null, moving, null, 0), 200);
  });

  test('the road’s own direction is read off its segments', () => {
    assert.ok(Math.abs((routeBearingAt(STRAIGHT.line, 2) ?? 0) - 90) < 1);
    assert.equal(routeBearingAt([at(0, 0), at(0, 0)], 0), null);
  });

  test('the first fix of a session has a bearing and does not throw', () => {
    const first = advance(STRAIGHT, routeMetrics(STRAIGHT.line), null, fixAt(0, 0), STRAIGHT_END)!;
    assert.ok(Number.isFinite(first.bearingDeg));
  });
});

describe('the two halves of the line, for drawing', () => {
  test('the travelled half ends exactly at the dot, not at the last vertex', () => {
    const state = drive(STRAIGHT, STRAIGHT_END, [fixAt(250, 0)]);
    const done = travelledLine(STRAIGHT.line, state);
    const left = remainingLine(STRAIGHT.line, state);
    assert.deepEqual(done[done.length - 1], [state.snapped.lng, state.snapped.lat]);
    assert.deepEqual(left[0], [state.snapped.lng, state.snapped.lat]);
    // Between them they are the whole route, and they meet once.
    assert.ok(Math.abs(metresBetween(
      { lat: done[done.length - 1]![1], lng: done[done.length - 1]![0] },
      { lat: left[0]![1], lng: left[0]![0] },
    )) < 0.001);
  });

  test('before the first fix the whole route is still to come', () => {
    assert.equal(remainingLine(STRAIGHT.line, null).length, STRAIGHT.line.length);
    assert.deepEqual(travelledLine(STRAIGHT.line, null), []);
  });

  test('a one-point line draws as nothing rather than as a broken feature', () => {
    assert.deepEqual(travelledLine([at(0, 0)], null), []);
    assert.deepEqual(remainingLine([at(0, 0)], null), []);
  });
});

describe('the camera’s distance from the road', () => {
  test('a walker is closer in than a motorbike', () => {
    assert.ok(followZoom(1.2) > followZoom(12));
    assert.ok(followZoom(12) > followZoom(25));
  });

  test('a nonsense speed does not produce a nonsense zoom', () => {
    assert.ok(Number.isFinite(followZoom(NaN)));
    assert.ok(Number.isFinite(followZoom(-5)));
  });

  test('the camera flattens as a junction comes up, so the junction is visible', () => {
    assert.ok(followPitch(40) < followPitch(400));
    assert.ok(Number.isFinite(followPitch(NaN)));
  });
});

describe('inputs that should not take the navigator down', () => {
  const metrics = routeMetrics(STRAIGHT.line);

  test('a NaN coordinate leaves the last good answer standing', () => {
    const good = advance(STRAIGHT, metrics, null, fixAt(300, 0), STRAIGHT_END)!;
    const after = advance(STRAIGHT, metrics, good, { ...fixAt(0, 0), lat: NaN }, STRAIGHT_END);
    assert.equal(after, good);
  });

  test('a route of fewer than two points has no progress to report', () => {
    const stub: NavRoute = { ...STRAIGHT, line: [at(0, 0)] };
    assert.equal(advance(stub, routeMetrics(stub.line), null, fixAt(0, 0), STRAIGHT_END), null);
  });

  test('a route of two identical points answers without dividing by zero', () => {
    const stub: NavRoute = { ...STRAIGHT, line: [at(0, 0), at(0, 0)], maneuvers: [] };
    const state = advance(stub, routeMetrics(stub.line), null, fixAt(0, 0), STRAIGHT_END)!;
    assert.ok(state);
    assert.ok(Number.isFinite(state.remainingM));
    assert.ok(Number.isFinite(state.remainingSeconds));
    assert.equal(state.fraction, 0);
  });

  test('a fix with nothing but coordinates still produces a complete answer', () => {
    const bare: NavFix = { lat: at(300, 0)[1], lng: at(300, 0)[0], accuracyM: null, headingDeg: null, speedMps: null, timestamp: 0 };
    const state = advance(STRAIGHT, metrics, null, bare, STRAIGHT_END)!;
    // No accuracy reported is treated as usable: a phone that does not say
    // is not a phone that is wrong, and refusing to navigate for it would
    // rule out every browser.
    assert.equal(state.confident, true);
    assert.equal(state.speedMps, 0);
    assert.ok(Number.isFinite(state.bearingDeg));
  });

  test('the tuning is all in one place, and moving it moves the behaviour', () => {
    const strict = { ...NAV_TUNING, offRouteM: 10, offRouteFixes: 1 };
    const state = advance(STRAIGHT, metrics, null, fixAt(300, 20), STRAIGHT_END, strict)!;
    assert.equal(state.offRoute, true);
  });
});
