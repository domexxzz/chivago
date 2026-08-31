import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  MIN_VISITS_FOR_BALANCE, MOODS, chivaBalance, movementSubScore, routeBiasFor,
  type BalanceInput, type MoodCheckin,
} from './wellness.ts';

const visit = (over: Partial<BalanceInput['visits'][number]> = {}) => ({
  at: '2026-08-31T02:00:00.000Z', layer: 'Green', aqi: 30, crowdDensity: 0.8, ...over,
});

const input = (over: Partial<BalanceInput> = {}): BalanceInput => ({
  moods: [],
  visits: [visit(), visit(), visit()],
  walkedKmPerDay: [6],
  ...over,
});

const mood = (m: MoodCheckin['mood'], at = '2026-08-31T02:00:00.000Z'): MoodCheckin =>
  ({ at, mood: m, note: null });

describe('Chiva Balance', () => {
  test('a trip too short to judge returns no number, and says why', () => {
    // A score built from one afternoon is a guess wearing a number's clothes.
    const b = chivaBalance(input({ visits: [visit()] }));
    assert.equal(b.total, null);
    assert.ok(b.note, 'a null score with no explanation is worse than no score');
    assert.match(b.note!.en, new RegExp(String(MIN_VISITS_FOR_BALANCE)));
    assert.ok(b.note!.th.length > 8, 'the reason must reach a Thai reader too');
  });

  test('every component says whether it was measured or self-reported', () => {
    // Four of these come from what happened and one from what someone said.
    // A wellbeing number that hides which is which should not be trusted.
    const b = chivaBalance(input({ moods: [mood('steady')] }));
    assert.ok(b.components.length >= 4);
    for (const c of b.components) {
      assert.ok(c.source === 'measured' || c.source === 'self-reported');
      assert.ok(c.display.length > 0, `${c.key} shows no raw value`);
      assert.ok(c.label.th.length > 2);
    }
    assert.equal(b.components.filter((c) => c.source === 'self-reported').length, 1);
  });

  test('the weights sum to one, or the total means nothing', () => {
    const b = chivaBalance(input());
    const sum = b.components.reduce((n, c) => n + c.weight, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `weights sum to ${sum}`);
  });

  test('feeling worse lowers the score; nothing else changed', () => {
    const bright = chivaBalance(input({ moods: [mood('bright')] })).total!;
    const drained = chivaBalance(input({ moods: [mood('drained')] })).total!;
    assert.ok(drained < bright, `${drained} should be under ${bright}`);
  });

  test('only the most recent check-ins are read', () => {
    // How someone felt on day one says little about day five.
    const old = Array.from({ length: 6 }, (_, i) => mood('drained', `2026-08-2${i}T02:00:00.000Z`));
    const withOld = chivaBalance(input({ moods: [...old, mood('bright', '2026-08-31T02:00:00.000Z')] }));
    const onlyOld = chivaBalance(input({ moods: old }));
    assert.ok(withOld.total! > onlyOld.total!, 'a recent good day was drowned by old ones');
  });

  test('bad air and thick crowds pull the number down', () => {
    const clean = chivaBalance(input()).total!;
    const rough = chivaBalance(input({
      visits: [
        visit({ aqi: 150, crowdDensity: 3.5 }),
        visit({ aqi: 150, crowdDensity: 3.5 }),
        visit({ aqi: 150, crowdDensity: 3.5 }),
      ],
    })).total!;
    assert.ok(rough < clean - 15, `${rough} vs ${clean}`);
  });

  test('walking is a band, not a ladder', () => {
    // A metric that rewarded distance without limit would push a tired
    // traveller to walk further, which is the opposite of the point.
    assert.ok(movementSubScore(6) > movementSubScore(0));
    assert.ok(movementSubScore(6) > movementSubScore(20));
    assert.ok(movementSubScore(20) < 40, 'twenty km a day is not a balanced trip');
  });

  test('the score stays inside 0-100 under any input', () => {
    const wild = chivaBalance(input({
      visits: [visit({ aqi: 500, crowdDensity: 50 }), visit({ aqi: 0, crowdDensity: 0 }), visit()],
      walkedKmPerDay: [60, 0],
      moods: [mood('drained')],
    }));
    assert.ok(wild.total! >= 0 && wild.total! <= 100, `${wild.total}`);
  });
});

describe('the route a mood asks for', () => {
  test('a drained traveller is sent on a shorter day, not a longer one', () => {
    assert.equal(routeBiasFor('drained').energy, 'gentle');
    assert.equal(routeBiasFor('bright').energy, 'full');
    assert.equal(routeBiasFor('steady').energy, 'moderate');
  });

  test('tense and drained both steer away from crowds', () => {
    assert.ok(routeBiasFor('tense').avoidCrowds);
    assert.ok(routeBiasFor('drained').avoidCrowds);
    assert.ok(!routeBiasFor('bright').avoidCrowds);
  });

  test('every mood says what it asks for, in both languages', () => {
    for (const [key, m] of Object.entries(MOODS)) {
      assert.ok(m.label.en.length > 2, `${key} has no English label`);
      assert.ok(m.label.th.length > 1, `${key} has no Thai label`);
      assert.ok(m.asks.th.length > 4, `${key} does not say what it asks for in Thai`);
    }
  });
});
