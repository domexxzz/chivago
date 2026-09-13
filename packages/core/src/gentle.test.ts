import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  GENTLE_MOODS, RECHARGE_MAX_AQI, SUPPORT_LINE, gentleAsks, gentleStepsFor, needsGentle, rechargeFrom,
  type RechargeCandidate,
} from './gentle.ts';
import { MOODS, MOOD_KEYS } from './wellness.ts';

describe('a gentle step pays nothing, and cannot be made to', () => {
  // The rule the whole module exists for. If this suite ever needs changing,
  // the change is the thing to argue about, not the test.
  test('no step carries a reward, a score or a count of any kind', () => {
    for (const mood of MOOD_KEYS) {
      for (const step of gentleStepsFor(mood)) {
        const fields = Object.keys(step);
        for (const banned of ['points', 'reward', 'exp', 'score', 'streak', 'badge', 'rank']) {
          assert.ok(!fields.includes(banned), `${step.key} carries ${banned}; resting must not be paid`);
        }
        assert.deepEqual(fields.sort(), ['detail', 'key', 'minutes', 'outside', 'title']);
      }
    }
  });

  test('the words never promise a feeling or claim an effect', () => {
    // "This will calm you down" is a clinical claim this product cannot make.
    for (const mood of MOOD_KEYS) {
      for (const step of gentleStepsFor(mood)) {
        for (const text of [step.title.en, step.detail.en]) {
          assert.doesNotMatch(text, /\b(cure|heal|treat|fix|therapy|diagnos)/i, `${step.key}: ${text}`);
        }
      }
    }
  });

  test('every step is small enough to finish on a bad day', () => {
    for (const mood of GENTLE_MOODS) {
      const steps = gentleStepsFor(mood);
      assert.ok(steps.length > 0);
      for (const s of steps) assert.ok(s.minutes <= 20, `${s.key} asks for ${s.minutes} minutes`);
    }
  });

  test('the first step offered never requires leaving the room', () => {
    // Smallest first, and the smallest thing must be possible from a chair.
    for (const mood of GENTLE_MOODS) {
      assert.equal(gentleStepsFor(mood)[0]!.outside, false, `${mood} opens by asking someone to go outside`);
    }
  });

  test('both languages are filled, because this is the worst place to fall back', () => {
    for (const mood of GENTLE_MOODS) {
      for (const s of gentleStepsFor(mood)) {
        for (const b of [s.title, s.detail]) {
          assert.ok(b.en.trim().length > 0 && b.th.trim().length > 0, s.key);
        }
      }
    }
  });
});

describe('the set opens on what somebody said, and nothing else', () => {
  test('only the two moods that asked for it', () => {
    assert.deepEqual(GENTLE_MOODS, ['drained', 'tense']);
    assert.equal(needsGentle('drained'), true);
    assert.equal(needsGentle('tense'), true);
    assert.equal(needsGentle('steady'), false);
    assert.equal(needsGentle('bright'), false);
  });

  test('a mood that did not ask gets no steps at all, not a shorter list', () => {
    assert.deepEqual(gentleStepsFor('steady'), []);
    assert.deepEqual(gentleStepsFor('bright'), []);
  });

  test('what the mood asks of the day is the check-in’s own words, not a second copy', () => {
    for (const mood of MOOD_KEYS) assert.deepEqual(gentleAsks(mood), MOODS[mood].asks);
  });
});

describe('the support line is shown to everyone who sees a set', () => {
  test('it is a real number, said plainly, with where it came from', () => {
    assert.match(SUPPORT_LINE.dial, /^\d{4}$/);
    assert.equal(SUPPORT_LINE.dial, '1323');
    assert.ok(SUPPORT_LINE.source.startsWith('https://'));
    assert.match(SUPPORT_LINE.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(SUPPORT_LINE.note.th.length > 0);
  });

  test('it does not make somebody qualify as a crisis first', () => {
    assert.match(SUPPORT_LINE.note.en, /do not have to be in a crisis/i);
  });
});

describe('somewhere to go, chosen from what was measured', () => {
  const place = (over: Partial<RechargeCandidate> & { id: string }): RechargeCandidate => ({
    name: { en: over.id, th: over.id }, layer: 'Green', crowd: 0, aqi: 20, metresAway: 100, ...over,
  });

  test('the quietest open-ground place with air worth breathing', () => {
    const pick = rechargeFrom([
      place({ id: 'busy', crowd: 40 }),
      place({ id: 'quiet', crowd: 2 }),
      place({ id: 'empty-but-far', crowd: 2, metresAway: 9000 }),
    ]);
    assert.equal(pick!.id, 'quiet', 'ties on crowd break on distance');
  });

  test('bad air disqualifies a place however empty it is', () => {
    const pick = rechargeFrom([
      place({ id: 'smoggy', crowd: 0, aqi: RECHARGE_MAX_AQI }),
      place({ id: 'busier-but-clean', crowd: 30, aqi: 18 }),
    ]);
    assert.equal(pick!.id, 'busier-but-clean');
  });

  test('a place whose air was never measured is not offered', () => {
    // Null is not "probably fine". It is "nobody looked".
    assert.equal(rechargeFrom([place({ id: 'unknown', aqi: null, crowd: 0 })]), null);
  });

  test('nothing measured qualifies, so nothing is suggested', () => {
    assert.equal(rechargeFrom([]), null);
    assert.equal(rechargeFrom([place({ id: 'all-smoggy', aqi: 90 })]), null);
  });

  test('open ground is preferred, but a clean quiet beach beats nothing', () => {
    const onlyBeach = rechargeFrom([place({ id: 'beach', layer: 'Safe', crowd: 1 })]);
    assert.equal(onlyBeach!.id, 'beach');
    const both = rechargeFrom([
      place({ id: 'beach', layer: 'Safe', crowd: 0 }),
      place({ id: 'park', layer: 'Green', crowd: 5 }),
    ]);
    assert.equal(both!.id, 'park', 'open ground should win even when it is busier');
  });

  test('the same input always picks the same place', () => {
    const rows = [place({ id: 'b', crowd: 3 }), place({ id: 'a', crowd: 3 })];
    assert.equal(rechargeFrom(rows)!.id, rechargeFrom([...rows].reverse())!.id);
  });
});
