import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  DEEDS_TO_REST, DEED_WEIGHT, MONSTERS, REST_DAYS, SMOG_AQI,
  monsterState, monstersAt, restingChangesTheReading, type Deed,
} from './monsters.ts';

/**
 * A monster is a real problem wearing a face. These hold the two halves of
 * that: nothing invents one, and nothing pretends beating one changed the
 * world it came from.
 */
describe('what summons a monster', () => {
  const clean = { placeId: 'p', aqi: 14, aqiProvenance: 'live' as const, hasOpenCleanup: false };

  test('good air on a clean day summons nothing at all', () => {
    assert.deepEqual(monstersAt(clean), []);
  });

  test('air over the published boundary summons smog, and says the number', () => {
    const found = monstersAt({ ...clean, aqi: SMOG_AQI });
    assert.deepEqual(found.map((m) => m.key), ['smog']);
    assert.match(found[0]!.because.en, new RegExp(String(SMOG_AQI)));
  });

  test('an ESTIMATE never summons one, however bad the number', () => {
    // Otherwise the monster is a picture of our own guess rather than of the
    // island, which is the one thing it must never be.
    assert.deepEqual(monstersAt({ ...clean, aqi: 300, aqiProvenance: 'estimated' }), []);
    assert.deepEqual(monstersAt({ ...clean, aqi: 300, aqiProvenance: 'stale' }), []);
  });

  test('a host opening a clean-up summons the plastic one', () => {
    const found = monstersAt({ ...clean, hasOpenCleanup: true });
    assert.deepEqual(found.map((m) => m.key), ['plastic']);
  });

  test('both can stand at one place, each carrying its own reason', () => {
    const found = monstersAt({ ...clean, aqi: 120, hasOpenCleanup: true });
    assert.deepEqual(found.map((m) => m.key), ['smog', 'plastic']);
    assert.notEqual(found[0]!.because.en, found[1]!.because.en);
  });

  test('every species says what it is made of, and points at the real thing', () => {
    // The line has to name the SOURCE - a reading, a host's clean-up - so a
    // reader learns where the monster came from rather than being told a
    // story about a creature. "not an animal" is allowed and is the point.
    for (const m of Object.values(MONSTERS)) {
      assert.ok(m.what.th.length > 0, `${m.key} has no Thai`);
      assert.match(m.what.en, /reading|clean-up|host|air/i, `${m.key}: ${m.what.en}`);
      assert.ok(m.cleansedBy.en.length > 0 && m.cleansedBy.th.length > 0);
    }
  });
});

describe('pushing one back', () => {
  const now = new Date('2026-09-10T12:00:00.000Z');
  const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

  test('nothing done is no progress, and it is still standing', () => {
    assert.deepEqual(monsterState([], now), { progress: 0, needed: DEEDS_TO_REST, restingUntil: null });
  });

  test('a verified quest is worth three legs on foot', () => {
    assert.equal(DEED_WEIGHT.verifiedQuest, 3 * DEED_WEIGHT.walkedLeg);
  });

  test('five deeds put it to rest, for seven days from the deed that finished it', () => {
    const deeds: Deed[] = [
      { kind: 'verifiedQuest', at: ago(30) },
      { kind: 'walkedLeg', at: ago(20) },
      { kind: 'walkedLeg', at: ago(10) },
    ];
    const state = monsterState(deeds, now);
    assert.equal(state.progress, DEEDS_TO_REST);
    assert.equal(state.restingUntil, new Date(new Date(ago(10)).getTime() + REST_DAYS * 86_400_000).toISOString());
  });

  test('the bar never runs past full, however much the island does', () => {
    const deeds: Deed[] = Array.from({ length: 9 }, (_, i) => ({ kind: 'verifiedQuest' as const, at: ago(i + 1) }));
    assert.equal(monsterState(deeds, now).progress, DEEDS_TO_REST);
  });

  test('work older than the window does not count, so a monster can come back', () => {
    const old: Deed[] = Array.from({ length: 3 }, () => ({ kind: 'verifiedQuest' as const, at: ago(24 * 8) }));
    assert.deepEqual(monsterState(old, now), { progress: 0, needed: DEEDS_TO_REST, restingUntil: null });
  });

  test('the deed that finishes it is the one the clock starts from, not the last one', () => {
    // Otherwise a straggler deed an hour later would quietly extend the rest.
    const deeds: Deed[] = [
      { kind: 'verifiedQuest', at: ago(40) },
      { kind: 'verifiedQuest', at: ago(39) },
      { kind: 'walkedLeg', at: ago(2) },
    ];
    const finished = new Date(new Date(ago(39)).getTime() + REST_DAYS * 86_400_000).toISOString();
    assert.equal(monsterState(deeds, now).restingUntil, finished);
  });
});

describe('what beating one does not mean', () => {
  test('resting a monster does not move the reading that summoned it', () => {
    // Walking past a smog monster five times does not clean the air. An app
    // that let somebody believe it had would be telling the same kind of lie
    // as a photograph of somewhere else.
    assert.equal(restingChangesTheReading, false);
  });

  test('so a rested place with bad air still summons it again next window', () => {
    const bad = { placeId: 'p', aqi: 140, aqiProvenance: 'live' as const, hasOpenCleanup: false };
    assert.deepEqual(monstersAt(bad).map((m) => m.key), ['smog']);
  });
});
