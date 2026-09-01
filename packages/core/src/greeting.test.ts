import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { dayPart, greetingFor, islandHour } from './greeting.ts';

/** UTC instant, so every case states the phone's clock and the island's apart. */
const utc = (iso: string) => new Date(iso);

describe('the hour is the island’s, not the phone’s', () => {
  test('Bangkok runs seven hours ahead of UTC', () => {
    assert.equal(islandHour(utc('2026-09-02T00:00:00Z')), 7);
    assert.equal(islandHour(utc('2026-09-02T12:00:00Z')), 19);
  });

  test('a phone still on European time does not get a European greeting', () => {
    // 22:00 UTC is 05:00 on Samui. The traveller is on the beach at dawn and
    // their phone thinks it is late last night in Berlin.
    const dawnOnSamui = utc('2026-09-01T22:00:00Z');
    assert.equal(islandHour(dawnOnSamui), 5);
    assert.equal(dayPart(dawnOnSamui), 'morning');
  });

  test('island midnight is 0, never 24', () => {
    // en-GB's 2-digit hour formats midnight as "24" in some ICU builds, which
    // would put midnight in no bucket at all and read as the following evening.
    assert.equal(islandHour(utc('2026-09-01T17:00:00Z')), 0);
    assert.equal(dayPart(utc('2026-09-01T17:00:00Z')), 'night');
  });
});

describe('the four parts of the day', () => {
  // Island-time hour -> the part it belongs to. Boundaries on both sides of
  // every edge, because an off-by-one here is invisible until 16:00.
  const cases: [number, string][] = [
    [4, 'night'], [5, 'morning'], [11, 'morning'],
    [12, 'afternoon'], [15, 'afternoon'],
    [16, 'evening'], [18, 'evening'],
    [19, 'night'], [23, 'night'], [0, 'night'], [2, 'night'],
  ];

  for (const [hour, part] of cases) {
    test(`${String(hour).padStart(2, '0')}:00 on the island is ${part}`, () => {
      // Build the instant backwards from the island hour: UTC = island - 7.
      const utcHour = (hour - 7 + 24) % 24;
      const day = hour < 7 ? '02' : '01';
      assert.equal(dayPart(utc(`2026-09-${day}T${String(utcHour).padStart(2, '0')}:30:00Z`)), part);
    });
  }

  test('night wraps past midnight rather than restarting the day', () => {
    // 02:00 is the end of a long night, not the start of a morning. A bucket
    // keyed on "hour < 5 is early" would greet somebody at 2am with sunrise.
    assert.equal(dayPart(utc('2026-09-01T19:00:00Z')), 'night');
  });
});

describe('the greeting itself', () => {
  test('every part answers in both languages', () => {
    for (const at of ['T00:00:00Z', 'T06:00:00Z', 'T12:00:00Z', 'T18:00:00Z']) {
      const g = greetingFor(utc(`2026-09-02${at}`));
      assert.ok(g.en.length > 0);
      assert.match(g.th, /[฀-๿]/, 'a Thai greeting the Thai reader cannot read is not a greeting');
    }
  });

  test('the two evening parts share their English and differ in Thai', () => {
    // Deliberate: English has no second-person "good night" that is not a
    // goodbye, and Thai distinguishes เย็น from ค่ำ. Asserting it stops a
    // later tidy-up from collapsing the pair and losing the Thai distinction.
    const evening = greetingFor(utc('2026-09-02T10:00:00Z')); // 17:00 island
    const night = greetingFor(utc('2026-09-02T14:00:00Z')); // 21:00 island
    assert.equal(evening.en, night.en);
    assert.notEqual(evening.th, night.th);
  });
});
