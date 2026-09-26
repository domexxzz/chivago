import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  LEVEL_LABEL, attainedLevel, isEvidenceLevel, levelSummary, levelVerdict,
  type EvidenceFacts,
} from './evidence-level.ts';

/**
 * What a contract required, and what a submission achieved.
 *
 * Two facts, and the whole value is in keeping them apart: a system storing
 * only one of them cannot tell anybody they fell short.
 */

const facts = (over: Partial<EvidenceFacts> = {}): EvidenceFacts => ({
  submitted: true,
  geofencedArrival: false,
  photos: 0,
  partnerApproved: false,
  reviewerNamed: false,
  ...over,
});

describe('the rung the rows support', () => {
  test('nothing submitted is not a rung at all', () => {
    assert.equal(attainedLevel(facts({ submitted: false })), 0);
    assert.match(LEVEL_LABEL[0].en, /Nothing submitted/);
  });

  test('a submission with nothing under it is the traveller saying so', () => {
    assert.equal(attainedLevel(facts()), 1);
  });

  test('a photograph or a fenced arrival is a digital trace', () => {
    assert.equal(attainedLevel(facts({ photos: 1 })), 2);
    assert.equal(attainedLevel(facts({ geofencedArrival: true })), 2);
  });

  test('a named partner approving it is rung three', () => {
    assert.equal(attainedLevel(facts({ partnerApproved: true, reviewerNamed: true })), 3);
  });

  test('AN APPROVAL WITH NO NAMED REVIEWER IS NOT RUNG THREE', () => {
    // The rung says a named partner stood behind it. An approval whose
    // reviewer the console never recorded cannot be asked about, which is the
    // only thing rung three is worth. It falls back to what the trace
    // supports, rather than borrowing a rung it cannot answer for.
    assert.equal(attainedLevel(facts({ partnerApproved: true, reviewerNamed: false })), 1);
    assert.equal(
      attainedLevel(facts({ partnerApproved: true, reviewerNamed: false, photos: 2 })), 2,
    );
  });

  test('four is never returned, because nothing can countersign yet', () => {
    // A function that could return 4 would be describing a capability this
    // system does not have. `evidence.ts` says it in prose; this says it by
    // never producing the number.
    const every: EvidenceFacts[] = [
      facts(), facts({ photos: 9 }), facts({ geofencedArrival: true }),
      facts({ partnerApproved: true, reviewerNamed: true, photos: 9, geofencedArrival: true }),
    ];
    for (const f of every) assert.notEqual(attainedLevel(f), 4);
  });

  test('every rung has a label in both languages', () => {
    for (const n of [0, 1, 2, 3, 4] as const) {
      assert.ok(LEVEL_LABEL[n].en.length > 0, `rung ${n} has no English label`);
      assert.ok(LEVEL_LABEL[n].th.length > 0, `rung ${n} has no Thai label`);
    }
    assert.equal(isEvidenceLevel(5), false);
    assert.equal(isEvidenceLevel(2.5), false);
  });
});

describe('against the bar the quest agreed to', () => {
  test('at or above the agreed rung meets it', () => {
    assert.equal(levelVerdict(2, 2), 'meets');
    assert.equal(levelVerdict(2, 3), 'meets');
  });

  test('below it is short, and short is the answer that needs doing something about', () => {
    assert.equal(levelVerdict(3, 2), 'short');
  });

  test('NO AGREED LEVEL IS NOT THE SAME AS CLEARING ONE', () => {
    // A quest nobody set a level for has not passed a test; it has not been
    // given one. Treating null as "anything passes" is how a contract that
    // required rung three gets reported as satisfied by a photograph.
    assert.equal(levelVerdict(null, 1), 'unagreed');
    assert.equal(levelVerdict(null, 3), 'unagreed');
  });
});

describe('what a set of submissions says about the bar', () => {
  test('all clear says so plainly', () => {
    const s = levelSummary([{ required: 2, attained: 3 }, { required: 2, attained: 2 }]);
    assert.deepEqual([s.meets, s.short, s.unagreed], [2, 0, 0]);
    assert.match(s.note.en, /All 2 meet the level/);
  });

  test('a shortfall leads, and names the count', () => {
    const s = levelSummary([
      { required: 3, attained: 3 }, { required: 3, attained: 1 }, { required: 3, attained: 2 },
    ]);
    assert.equal(s.short, 2);
    assert.match(s.note.en, /2 of 3 fall short/);
    assert.match(s.note.th, /2 จาก 3/);
  });

  test('unagreed is reported beside it, never folded into either', () => {
    const s = levelSummary([{ required: 3, attained: 1 }, { required: null, attained: 1 }]);
    assert.deepEqual([s.meets, s.short, s.unagreed], [0, 1, 1]);
    assert.match(s.note.en, /1 of 2 fall short/);
    assert.match(s.note.en, /1 belong to a quest with no agreed level/);
  });

  test('nothing at all says there is nothing to hold to a level', () => {
    const s = levelSummary([]);
    assert.match(s.note.en, /Nothing to hold to a level/);
    assert.deepEqual([s.meets, s.short, s.unagreed], [0, 0, 0]);
  });
});
