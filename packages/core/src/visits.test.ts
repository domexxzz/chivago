import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { SELF_VISITS_PER_YEAR, selfVisitYearKey } from './visits.ts';

describe('the year a self-issued stamp counts against', () => {
  test('is the island year, not the phone year', () => {
    // 23:30 UTC on 31 December is already 06:30 on 1 January in Samui. A
    // phone in London would call this last year; the quota must not.
    assert.equal(selfVisitYearKey(new Date('2026-12-31T23:30:00Z')), '2027');
    assert.equal(selfVisitYearKey(new Date('2026-12-31T16:30:00Z')), '2026');
  });

  test('the quota is a handful, not a passport', () => {
    // Enough for the places a phone genuinely misses on a trip; too few to
    // forge a country with.
    assert.ok(SELF_VISITS_PER_YEAR >= 5 && SELF_VISITS_PER_YEAR <= 20, String(SELF_VISITS_PER_YEAR));
  });
});
