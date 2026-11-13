/**
 * Reading a real router's real answer.
 *
 * The fixture below is NOT invented. It is the reply
 * `valhalla1.openstreetmap.de` gave for a 2.5 km walk across Chaweng on
 * 13 November 2026, trimmed to the fields this app reads and otherwise
 * untouched - Thai street names, fractional kilometres, numeric maneuver
 * codes and all. Every assertion here is a claim about what that server
 * actually sends, which is the only kind of claim a parser test is worth
 * making.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  arrivalAt, gapAfter, gapBefore, maneuverArrow, maneuverInstruction, maneuverPoint, maneuverStreet,
  maneuverType, parseNavRoute,
} from './navigation.ts';
import { strings } from './strings.ts';
import { parseRoute } from './routing.ts';
import { localise } from './localise.ts';

/** The leg's encoded polyline, exactly as the server sent it. */
const SHAPE = 'm}~dQwpkz}DdKsSzMuXjF}JdJxF|X`MBvDT`e@|@zJn@vCj@lCfCtIrAlDtEpNbJcG~AaBpA}AbE{LZ{@r@WzCRp@^Fz@aA~Dz]tF`A}Hd@gAzBiBlAg@h@Q|CUxB`@`Bz@jBnArARzBGxBYrb@wFzCvLlB|FbBjFnAjE`LbUtIzIzBxEpIfKzCbDbGlEnDrCnI|DbLzEnIzEzPtFfInEzExCrLxHdVxQhHdFnDtAtHnCdNdDdCp@jc@bJv]tGjQnEzg@pIzV|FdXlJdHrFhP~Ipa@lG|m@pHfHlBh`@xP`i@nVfMdFrTvB|\\dDpCR~HlA`\\~BdLxB~VlGpFxAnRzFrNdBlOzBrC`@pPxCrOvDzE`A`GvAzAl@`N~ElIrBd@_F\\{Cf@}Cd@{C`EwTv@kEbCeL';

const MANEUVERS = [
  { type: 1, length: 0.119, time: 111.72, begin_shape_index: 0, end_shape_index: 3, bearing_after: 121 },
  { type: 10, street_names: ['ถนนพังบัว'], length: 0.077, time: 54.352, begin_shape_index: 3, end_shape_index: 5, bearing_after: 215 },
  { type: 10, street_names: ['ซอยหาดเฉวง 4'], length: 0.176, time: 122.541, begin_shape_index: 5, end_shape_index: 13, bearing_after: 269 },
  { type: 15, length: 0.098, time: 75.105, begin_shape_index: 13, end_shape_index: 23, bearing_after: 144 },
  { type: 15, length: 0.057, time: 44.258, begin_shape_index: 23, end_shape_index: 24, bearing_after: 194 },
  { type: 15, length: 0.152, time: 106.164, begin_shape_index: 24, end_shape_index: 37, bearing_after: 102 },
  { type: 10, street_names: ['ถนนหาดเฉวงใหญ่', '4171'], length: 1.772, time: 1280.124, begin_shape_index: 37, end_shape_index: 94, bearing_after: 250 },
  { type: 15, length: 0.115, time: 74.682, begin_shape_index: 94, end_shape_index: 101, bearing_after: 100 },
  { type: 4, length: 0, time: 0, begin_shape_index: 101, end_shape_index: 101 },
];

const REPLY = {
  trip: {
    status: 0,
    units: 'kilometers',
    language: 'en-US',
    summary: { length: 2.566, time: 1868.95 },
    legs: [{ shape: SHAPE, maneuvers: MANEUVERS }],
  },
};

describe('reading a route with its instructions', () => {
  test('the walk comes back whole, with every maneuver the server sent', () => {
    const route = parseNavRoute(REPLY, 'walk');
    assert.ok(route);
    assert.equal(route.mode, 'walk');
    assert.equal(route.maneuvers.length, 9);
    assert.equal(route.line.length, 102);
  });

  test('kilometres become metres, at the summary and at every maneuver', () => {
    const route = parseNavRoute(REPLY, 'walk')!;
    // 2.566 km, which is the number the server sent, not a number this test chose.
    assert.equal(route.metres, 2566);
    assert.equal(route.seconds, 1869);
    // 0.119 km is 119 m. A parser that forgot the units would say 0.
    assert.equal(route.maneuvers[0]!.metres, 119);
    assert.equal(route.maneuvers[6]!.metres, 1772);
  });

  test('the numeric codes are turned into the app’s own names', () => {
    const route = parseNavRoute(REPLY, 'walk')!;
    assert.equal(route.maneuvers[0]!.type, 'start');
    assert.equal(route.maneuvers[1]!.type, 'turn-right');
    assert.equal(route.maneuvers[3]!.type, 'turn-left');
    assert.equal(route.maneuvers[8]!.type, 'arrive');
  });

  test('a street name is taken verbatim, in Thai, and never invented', () => {
    const route = parseNavRoute(REPLY, 'walk')!;
    assert.deepEqual(route.maneuvers[1]!.streets, ['ถนนพังบัว']);
    // Four of the nine maneuvers have no name in OpenStreetMap at all.
    assert.deepEqual(route.maneuvers[3]!.streets, []);
    assert.equal(maneuverStreet(route.maneuvers[3]!), null);
  });

  test('shape indices point at real coordinates on the joined line', () => {
    const route = parseNavRoute(REPLY, 'walk')!;
    for (const m of route.maneuvers) {
      assert.ok(route.line[m.beginIndex], 'begin index is on the line');
      assert.ok(route.line[m.endIndex], 'end index is on the line');
      assert.ok(m.endIndex >= m.beginIndex);
    }
    const arrival = maneuverPoint(route, 8);
    assert.ok(arrival);
    // The last maneuver is at the last point of the line, not back at the start.
    assert.equal(arrival.lat, route.line[101]![1]);
  });

  test('the old parser still reads the same body, unchanged', () => {
    // The banner over the map uses `parseRoute`; adding maneuvers must not
    // have moved anything it reads.
    const plain = parseRoute(REPLY, 'walk');
    const nav = parseNavRoute(REPLY, 'walk')!;
    assert.ok(plain);
    assert.equal(plain.metres, nav.metres);
    assert.equal(plain.seconds, nav.seconds);
    assert.deepEqual(plain.line, nav.line);
  });
});

describe('what a maneuver becomes when the reply is not perfect', () => {
  test('an unknown code is "continue", which can never point the wrong way', () => {
    assert.equal(maneuverType(99), 'continue');
    assert.equal(maneuverType(undefined), 'continue');
    assert.equal(maneuverType('turn-left'), 'continue');
    assert.equal(maneuverType(null), 'continue');
  });

  test('ramps, exits and merges fold onto the nearest honest arrow', () => {
    assert.equal(maneuverType(18), 'slight-right');
    assert.equal(maneuverType(21), 'slight-left');
    assert.equal(maneuverType(26), 'roundabout');
    assert.equal(maneuverType(12), 'u-turn');
  });

  test('a maneuver with no indices or lengths still parses, at zero', () => {
    const route = parseNavRoute({
      trip: { status: 0, summary: { length: 2.566, time: 1868.95 }, legs: [{ shape: SHAPE, maneuvers: [{ type: 10 }] }] },
    }, 'walk');
    assert.ok(route);
    assert.equal(route.maneuvers[0]!.metres, 0);
    assert.equal(route.maneuvers[0]!.beginIndex, 0);
    assert.equal(route.maneuvers[0]!.bearingAfter, null);
  });

  test('an index past the end of the shape is clamped onto it', () => {
    const route = parseNavRoute({
      trip: {
        status: 0, summary: { length: 1, time: 100 },
        legs: [{ shape: SHAPE, maneuvers: [{ type: 10, begin_shape_index: 9_000, end_shape_index: 9_001 }] }],
      },
    }, 'ride')!;
    assert.equal(route.maneuvers[0]!.beginIndex, 101);
    assert.ok(route.line[route.maneuvers[0]!.beginIndex]);
  });

  test('a route with no maneuvers at all is still a route', () => {
    // The line is a road and worth following. What is lost is the banner,
    // and the navigator says nothing rather than inventing turns.
    const route = parseNavRoute({
      trip: { status: 0, summary: { length: 2.566, time: 1868.95 }, legs: [{ shape: SHAPE }] },
    }, 'walk');
    assert.ok(route);
    assert.equal(route.maneuvers.length, 0);
    assert.equal(route.line.length, 102);
  });

  test('no route, a refusal, or a body of the wrong shape is null', () => {
    assert.equal(parseNavRoute({ trip: { status: 1 } }, 'walk'), null);
    assert.equal(parseNavRoute({}, 'walk'), null);
    assert.equal(parseNavRoute(null, 'walk'), null);
    assert.equal(parseNavRoute('<html>502</html>', 'walk'), null);
    assert.equal(parseNavRoute({ trip: { status: 0, summary: {}, legs: [] } }, 'walk'), null);
  });

  /*
    A via point. Valhalla counts EACH leg's shape from zero and ends one leg
    at the same coordinate the next begins at, so a parser that simply
    concatenates gets two things wrong at once: a doubled point in the middle
    of the line, and every maneuver of the second leg pointing at a junction
    in the first.

    Three points each, a metre apart on the equator-ish, with the joint
    shared: `LEG_A` ends at 100.002 and `LEG_B` begins there.
  */
  const LEG_A = '_uybQ_oov}D?o}@?o}@';
  const LEG_B = '_uybQ_lsv}D?o}@?o}@';

  test('two legs are joined without a doubled point, and the second leg’s indices move with it', () => {
    const route = parseNavRoute({
      trip: {
        status: 0,
        summary: { length: 0.4, time: 200 },
        legs: [
          { shape: LEG_A, maneuvers: [{ type: 1, begin_shape_index: 0, end_shape_index: 2 }] },
          { shape: LEG_B, maneuvers: [{ type: 15, begin_shape_index: 0, end_shape_index: 2 }] },
        ],
      },
    }, 'ride')!;
    // Three plus three, less the shared joint.
    assert.equal(route.line.length, 5);
    assert.equal(route.maneuvers[0]!.beginIndex, 0);
    // The second leg's zero is the joint, which is index 2 of the joined line
    // - offset by two, not by three.
    assert.equal(route.maneuvers[1]!.beginIndex, 2);
    assert.deepEqual(route.line[2], [100.002, 9.5]);
    // And no coordinate appears twice in a row.
    for (let i = 1; i < route.line.length; i += 1) {
      assert.notDeepEqual(route.line[i], route.line[i - 1]);
    }
  });

  test('legs that do NOT share a point keep every point, and the offset follows', () => {
    const route = parseNavRoute({
      trip: {
        status: 0,
        summary: { length: 0.4, time: 200 },
        legs: [
          { shape: LEG_A, maneuvers: [{ type: 1, begin_shape_index: 0, end_shape_index: 2 }] },
          { shape: SHAPE, maneuvers: [{ type: 15, begin_shape_index: 1, end_shape_index: 2 }] },
        ],
      },
    }, 'ride')!;
    assert.equal(route.line.length, 3 + 102);
    assert.equal(route.maneuvers[1]!.beginIndex, 4);
  });
});

describe('what the traveller is told, in each language', () => {
  const route = parseNavRoute(REPLY, 'walk')!;

  test('a turn with a road name names it, and does not translate it', () => {
    const said = maneuverInstruction(route.maneuvers[1]!);
    assert.equal(localise(said, 'en'), 'Turn right onto ถนนพังบัว');
    assert.equal(localise(said, 'th'), 'เลี้ยวขวาเข้าถนนพังบัว');
    assert.equal(localise(said, 'zh'), '向右转进入ถนนพังบัว');
  });

  test('a turn with no road name is the plain verb, in all three', () => {
    const said = maneuverInstruction(route.maneuvers[3]!);
    assert.equal(localise(said, 'en'), 'Turn left');
    assert.equal(localise(said, 'th'), 'เลี้ยวซ้าย');
    assert.equal(localise(said, 'zh'), '向左转');
    // And nowhere in it is the name of the road BEFORE it.
    assert.ok(!localise(said, 'en').includes('ซอย'));
  });

  test('every maneuver type has a sentence in every language', () => {
    for (const code of [1, 4, 8, 9, 10, 11, 12, 15, 16, 26, 99]) {
      const said = maneuverInstruction({
        type: maneuverType(code), streets: [], metres: 0, seconds: 0,
        beginIndex: 0, endIndex: 0, bearingAfter: null, roundaboutExit: null,
      });
      for (const lang of ['en', 'th', 'zh'] as const) {
        assert.ok(localise(said, lang).length > 0, `${code} has no ${lang}`);
        // The fallback in `localise` would hide a missing string behind
        // English; this catches it by asking for the raw field.
        assert.ok(said[lang] && said[lang].length > 0, `${code} is missing ${lang}`);
      }
    }
  });

  test('arrival never borrows a road name, because it is not a turn onto one', () => {
    const said = maneuverInstruction({
      type: 'arrive', streets: ['ถนนพังบัว'], metres: 0, seconds: 0,
      beginIndex: 0, endIndex: 0, bearingAfter: null, roundaboutExit: null,
    });
    assert.equal(localise(said, 'en'), 'Arrive at your destination');
  });

  /*
    A LATIN ROAD NAME IN A THAI SENTENCE.

    Found on a live route, not imagined: half the lanes around Na Muang are
    in OpenStreetMap under names like "Soi Nalat", and the first run of this
    feature read "เลี้ยวขวาเข้าSoi Nalatในอีก 2.5 กม." - correct Thai
    grammar with the spacing of neither language.
  */
  test('a Latin road name gets the space Thai and Chinese put around one', () => {
    const latin = maneuverInstruction({
      type: 'turn-right', streets: ['Soi Nalat'], metres: 0, seconds: 0,
      beginIndex: 0, endIndex: 0, bearingAfter: null, roundaboutExit: null,
    });
    assert.equal(localise(latin, 'th'), 'เลี้ยวขวาเข้า Soi Nalat');
    assert.equal(localise(latin, 'zh'), '向右转进入 Soi Nalat');
    // And the banner's own join, which follows the name.
    assert.equal(
      localise(strings.navigate.inDistance(localise(latin, 'th'), '2.5 กม.'), 'th'),
      'เลี้ยวขวาเข้า Soi Nalat ในอีก 2.5 กม.',
    );
  });

  test('a Thai road name gets no space, because Thai does not use one', () => {
    const thai = maneuverInstruction(route.maneuvers[1]!);
    assert.equal(localise(thai, 'th'), 'เลี้ยวขวาเข้าถนนพังบัว');
    assert.equal(
      localise(strings.navigate.inDistance(localise(thai, 'th'), '120 ม.'), 'th'),
      'เลี้ยวขวาเข้าถนนพังบัวในอีก 120 ม.',
    );
  });

  test('the space rule reads the first and last character, not the whole name', () => {
    // Thai with digits in it is still Thai and needs no space.
    assert.equal(gapBefore('ซอย 4171'), '');
    assert.equal(gapAfter('ซอย 4171'), ' ');
    assert.equal(gapBefore('Soi Nalat'), ' ');
    assert.equal(gapBefore('那蒙瀑布'), '');
    assert.equal(gapBefore(''), '');
    assert.equal(gapAfter(''), '');
  });

  test('English is untouched by any of it', () => {
    const latin = maneuverInstruction({
      type: 'turn-right', streets: ['Soi Nalat'], metres: 0, seconds: 0,
      beginIndex: 0, endIndex: 0, bearingAfter: null, roundaboutExit: null,
    });
    assert.equal(localise(latin, 'en'), 'Turn right onto Soi Nalat');
    assert.equal(
      localise(strings.navigate.inDistance('Turn right onto Soi Nalat', '2.5 km'), 'en'),
      'Turn right onto Soi Nalat in 2.5 km',
    );
  });

  test('the arrow and the sentence come from the same type', () => {
    assert.equal(maneuverArrow('turn-left'), 'left');
    assert.equal(maneuverArrow('slight-right'), 'slight-right');
    assert.equal(maneuverArrow('arrive'), 'flag');
    assert.equal(maneuverArrow('continue'), 'straight');
  });
});

describe('the clock on the trip panel', () => {
  test('arrival is now plus what is left', () => {
    const now = Date.UTC(2026, 10, 13, 7, 19, 0);
    assert.equal(arrivalAt(now, 960).toISOString(), '2026-11-13T07:35:00.000Z');
  });

  test('a negative remainder is now, not the past', () => {
    const now = Date.UTC(2026, 10, 13, 7, 19, 0);
    assert.equal(arrivalAt(now, -500).getTime(), now);
  });
});
