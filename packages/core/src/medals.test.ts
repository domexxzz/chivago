import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { MEDALS, MEDALS_BASIS, medalSummary, medalsFor, newlyEarned } from './medals.ts';
import { SEED_PLACES } from './seed.ts';
import type { ExploredPlace } from './visits.ts';

/**
 * Medals.
 *
 * What is worth holding: a stamp earns nothing, a medal's date is the
 * check-in that finished it, progress counts only what the rule names, and
 * every place a rule names is a place that exists.
 */

const places = SEED_PLACES.map((p) => ({ id: p.id, province: p.province }));
const samuiIds = SEED_PLACES.filter((p) => p.province === 'TH-84').map((p) => p.id);
const campusIds = SEED_PLACES.filter((p) => p.province === 'TH-20').map((p) => p.id);

const visit = (placeId: string, day: number, how: ExploredPlace['how'] = 'checkin'): ExploredPlace => ({
  placeId, firstAt: `2026-09-0${day}T09:00:00.000Z`, how,
});

const state = (explored: ExploredPlace[], key: string) => {
  const found = medalsFor(explored, places).find((m) => m.key === key);
  assert.ok(found, `no medal ${key}`);
  return found;
};

describe('the catalogue is made of real places', () => {
  test('every place a rule names is in the seed, and every key is unique', () => {
    const ids = new Set(SEED_PLACES.map((p) => p.id));
    for (const m of MEDALS) {
      if (m.rule.kind === 'places') {
        for (const id of m.rule.placeIds) assert.ok(ids.has(id), `${m.key} names ${id}, which does not exist`);
      }
      assert.ok(m.name.th && m.how.th, `${m.key} has no Thai`);
    }
    assert.equal(new Set(MEDALS.map((m) => m.key)).size, MEDALS.length);
  });

  test('nothing is earned by nobody, and every medal shows what it wants', () => {
    const all = medalsFor([], places);
    assert.equal(all.length, MEDALS.length);
    for (const m of all) {
      assert.equal(m.earned, false);
      assert.equal(m.earnedAt, null);
      assert.equal(m.progress.done, 0);
      assert.ok(m.progress.total > 0, `${m.key} wants nothing`);
    }
    assert.deepEqual(medalSummary(all), { earned: 0, total: MEDALS.length });
    assert.match(MEDALS_BASIS.en, /250 m/);
  });
});

describe('what counts', () => {
  test('one check-in earns the first medal, dated to that check-in', () => {
    const m = state([visit('chaweng', 3)], 'first-steps');
    assert.equal(m.earned, true);
    assert.equal(m.earnedAt, '2026-09-03T09:00:00.000Z');
    assert.deepEqual(m.progress, { done: 1, total: 1, unit: 'places' });
  });

  test('a self-issued stamp earns nothing', () => {
    // Recorded, not scored (docs/29). A medal a traveller could award
    // themselves is a sticker.
    const m = state([visit('chaweng', 3, 'self')], 'first-steps');
    assert.equal(m.earned, false);
    assert.equal(m.progress.done, 0);
  });

  test('a check-in at a place that does not exist counts for nothing', () => {
    assert.equal(state([visit('nowhere', 3)], 'first-steps').earned, false);
  });

  test('three different places make an explorer, dated to the third', () => {
    const two = state([visit('chaweng', 3), visit('lamai', 4)], 'explorer');
    assert.equal(two.earned, false);
    assert.deepEqual(two.progress, { done: 2, total: 3, unit: 'places' });

    const three = state([visit('lamai', 4), visit('chaweng', 3), visit('namuang', 5)], 'explorer');
    assert.equal(three.earned, true);
    assert.equal(three.earnedAt, '2026-09-05T09:00:00.000Z', 'the visit that made three, not the last in the list');
  });

  test('named places: progress is of the named ones only, and the date is the last of them', () => {
    const partial = state([visit('chaweng', 3), visit('namuang', 4)], 'samui-coast');
    assert.equal(partial.earned, false);
    assert.deepEqual(partial.progress, { done: 1, total: 3, unit: 'places' }, 'Na Muang is not on the coast');

    const done = state([visit('fisherman', 6), visit('chaweng', 3), visit('lamai', 4)], 'samui-coast');
    assert.equal(done.earned, true);
    assert.equal(done.earnedAt, '2026-09-06T09:00:00.000Z');
  });

  test('an area is every place the seed puts in it', () => {
    const four = state(samuiIds.slice(0, 4).map((id, i) => visit(id, i + 1)), 'all-of-samui');
    assert.equal(four.earned, false);
    assert.deepEqual(four.progress, { done: 4, total: samuiIds.length, unit: 'places' });

    const all = state(samuiIds.map((id, i) => visit(id, i + 1)), 'all-of-samui');
    assert.equal(all.earned, true);
    assert.equal(state(samuiIds.map((id, i) => visit(id, i + 1)), 'all-of-campus').progress.done, 0, 'the island is not the campus');
  });

  test('the hopper wants two areas, and is dated to the first check-in in the second', () => {
    const island = state(samuiIds.map((id, i) => visit(id, i + 1)), 'hopper');
    assert.equal(island.earned, false);
    assert.deepEqual(island.progress, { done: 1, total: 2, unit: 'areas' });

    const both = state([visit('chaweng', 1), visit(campusIds[0]!, 7), visit(campusIds[1]!, 8)], 'hopper');
    assert.equal(both.earned, true);
    assert.equal(both.earnedAt, '2026-09-07T09:00:00.000Z');
  });
});

describe('what a check-in just finished', () => {
  test('newly earned is earned now and not before', () => {
    const before = medalsFor([visit('chaweng', 3), visit('lamai', 4)], places);
    const after = medalsFor([visit('chaweng', 3), visit('lamai', 4), visit('fisherman', 5)], places);
    const fresh = newlyEarned(before, after).map((m) => m.key).sort();
    assert.deepEqual(fresh, ['explorer', 'samui-coast']);
    assert.deepEqual(newlyEarned(after, after), [], 'nothing new when nothing changed');
  });
});
