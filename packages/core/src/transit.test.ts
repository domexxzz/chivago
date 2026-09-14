import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  NO_CAMPUS_ROUTE, REPORTS_FOR_A_PATTERN, SAME_VEHICLE_MIN, campusRoutesIn, headwayFrom, publicRoutesIn,
  sayHeadway, type Sighting,
} from './transit.ts';
import { SEED_TRANSIT } from './seed.ts';
import { RMUTT_BBOX, areaByKey, inArea } from './areas.ts';

/**
 * The route that exists, and the one that does not.
 *
 * The plan's first phase asks for the university's shuttle. It is published
 * nowhere, so the seed has none - and these hold that absence in place,
 * because the tempting fix is a line drawn along roads that look about right,
 * and somebody would then stand at a stop that is not a stop.
 */
describe('the seed carries what is mapped and nothing else', () => {
  test('the one route is real, named, and says where it was read from', () => {
    assert.equal(SEED_TRANSIT.length, 1);
    const [route] = SEED_TRANSIT;
    assert.equal(route!.kind, 'public');
    assert.equal(route!.operator, 'smart bus');
    assert.match(route!.source, /OpenStreetMap relation/);
    assert.match(route!.source, /14144070/);
    assert.ok(route!.name.en && route!.name.th, 'a route a rider cannot read is not much of a route');
  });

  test('no route claims a timetable, because nobody publishes one', () => {
    for (const r of SEED_TRANSIT) assert.equal(r.schedule, 'unpublished');
  });

  test('the university has no shuttle route here yet, and the app has words for that', () => {
    assert.deepEqual(campusRoutesIn(SEED_TRANSIT), []);
    assert.ok(NO_CAMPUS_ROUTE.en.length > 0 && NO_CAMPUS_ROUTE.th.length > 0);
    assert.equal(publicRoutesIn(SEED_TRANSIT).length, 1);
  });

  test('every stop cites its OpenStreetMap node, and unnamed means null', () => {
    for (const r of SEED_TRANSIT) {
      assert.ok(r.stops.length > 0, `${r.id} has no stops in this area`);
      for (const s of r.stops) {
        assert.match(s.osm, /^node \d+$/, `${s.id} does not say which node it is`);
        // Three of the four are unnamed on the map. `null` is the honest
        // value; a placeholder like "Stop 2" would be a landmark we invented.
        assert.ok(s.name === null || (s.name.en.length > 0 && s.name.th.length > 0), `${s.id} has a half-name`);
      }
    }
  });

  test('every seeded stop is actually at the campus it is listed under', () => {
    // Route 538 runs thirty kilometres to Bangkok. If a stop from the far end
    // ever leaks into this list it will be nowhere near the gate, and the
    // student who needed the gate will be sent across the province.
    const rmutt = areaByKey('rmutt');
    for (const s of SEED_TRANSIT.flatMap((r) => r.stops)) {
      assert.ok(inArea(rmutt, s), `${s.id} is not near the campus`);
      const nearBox = s.lat > RMUTT_BBOX.minLat - 0.01 && s.lat < RMUTT_BBOX.maxLat + 0.01;
      assert.ok(nearBox, `${s.id} is outside the campus outline by more than a street`);
    }
  });
});

/**
 * When is the next one.
 *
 * There is no timetable to read, so the app measures instead: riders report
 * that they saw one. That is an observation and must never be dressed as a
 * schedule, which is what most of these are about.
 */
describe('what riders saw, and what may be said about it', () => {
  // Island time is UTC+7, and `headwayFrom` counts an island day.
  const at = (h: number, m: number): string => new Date(`2026-09-15T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+07:00`).toISOString();
  const now = new Date('2026-09-15T12:00:00+07:00');
  const seen = (...times: string[]): Sighting[] => times.map((t) => ({ routeId: 'smartbus-538', stopId: 'rmutt-gate3', at: t }));

  test('nobody has reported one: nulls, not a zero pretending to be an answer', () => {
    const h = headwayFrom([], now);
    assert.deepEqual(h, { lastSeenMinAgo: null, typicalGapMin: null, reports: 0, vehicles: 0 });
    assert.match(sayHeadway(h).en, /Nobody has reported/);
    assert.match(sayHeadway(h).th, /ยังไม่มีใครแจ้ง/);
  });

  test('one report says how long ago, and refuses to say how often', () => {
    const h = headwayFrom(seen(at(11, 48)), now);
    assert.equal(h.lastSeenMinAgo, 12);
    assert.equal(h.typicalGapMin, null, 'one report is not a pattern');
    assert.equal(h.reports, 1);
    assert.match(sayHeadway(h).en, /12 min ago/);
    assert.match(sayHeadway(h).en, /Too few reports/);
  });

  test('two reports is one gap, and one gap is still not a pattern', () => {
    const h = headwayFrom(seen(at(11, 30), at(11, 50)), now);
    assert.equal(h.reports, 2);
    assert.equal(h.typicalGapMin, null);
    assert.ok(REPORTS_FOR_A_PATTERN > 2);
  });

  test('three reports earns a median, and the sentence says whose median it is', () => {
    const h = headwayFrom(seen(at(11, 10), at(11, 30), at(11, 52)), now);
    assert.equal(h.reports, 3);
    assert.equal(h.typicalGapMin, 21, 'the median of 20 and 22');
    assert.equal(h.lastSeenMinAgo, 8);
    const said = sayHeadway(h);
    assert.match(said.en, /every 21 min/);
    assert.match(said.en, /not a timetable/, 'the app must never let an observation read as a schedule');
    assert.match(said.th, /ไม่ใช่ตารางเดินรถ/);
  });


  test('a crowd tapping at one bus is one bus, not a nought-minute service', () => {
    // The failure this exists to stop, and it gets WORSE the more people use
    // the app: five riders at the gate all tapping as the same bus pulls in
    // are five reports seconds apart. Measured raw, the median gap is zero
    // and the screen promises a bus every nought minutes.
    const crowd = seen(at(11, 40), at(11, 40), at(11, 41), at(11, 41), at(11, 42));
    const h = headwayFrom(crowd, now);
    assert.equal(h.reports, 5, 'five people really did report');
    assert.equal(h.vehicles, 1, 'but they saw one bus');
    assert.equal(h.typicalGapMin, null, 'one bus is not a headway');
    assert.match(sayHeadway(h).en, /Too few reports/);
  });

  test('three crowds are three buses, and the gaps are between the buses', () => {
    const h = headwayFrom(seen(
      at(10, 30), at(10, 31),            // one bus, two riders
      at(10, 55), at(10, 56), at(10, 57), // the next, three riders
      at(11, 20),                         // the next, one rider
    ), now);
    assert.equal(h.reports, 6);
    assert.equal(h.vehicles, 3);
    assert.equal(h.typicalGapMin, 25);
    assert.ok(SAME_VEHICLE_MIN < 25, 'the window must not swallow a real headway');
  });

  test("yesterday's service says nothing about whether one is coming now", () => {
    const yesterday = new Date('2026-09-14T11:00:00+07:00').toISOString();
    const h = headwayFrom(seen(yesterday, yesterday, yesterday), now);
    assert.deepEqual(h, { lastSeenMinAgo: null, typicalGapMin: null, reports: 0, vehicles: 0 });
  });

  test('a report from the future is not a report', () => {
    // Clock skew on a phone, or somebody playing. Either way it cannot be
    // used to claim a bus was seen at a time that has not happened.
    const h = headwayFrom(seen(at(11, 50), at(13, 30)), now);
    assert.equal(h.reports, 1);
    assert.equal(h.lastSeenMinAgo, 10);
  });

  test('a gap spanning the overnight break never becomes a headway', () => {
    // Two reports either side of midnight would be an eleven-hour "gap" and
    // complete nonsense as an answer to "when is the next one".
    const lateLastNight = new Date('2026-09-14T22:40:00+07:00').toISOString();
    const h = headwayFrom(seen(lateLastNight, at(7, 10), at(7, 30), at(7, 55)), now);
    assert.equal(h.reports, 3, 'last night is not today');
    assert.equal(h.typicalGapMin, 23);
  });
});
