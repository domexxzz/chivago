import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { CROWD_SOURCE, CROWD_SOURCE_UNFENCED, CROWD_WINDOW_MINUTES, crowdLine, crowdSource } from './crowd.ts';

describe('the live crowd, in words', () => {
  const at = (n: number) => ({ checkinsLastHour: n, windowMinutes: CROWD_WINDOW_MINUTES, countedAt: '2026-09-05T03:00:00.000Z' });

  test('zero says zero, not "quiet"', () => {
    const line = crowdLine(at(0));
    assert.match(line.en, /No ChivaGo traveller/);
    assert.doesNotMatch(line.en, /quiet|empty/i);
    assert.match(line.th, /ยังไม่มี/);
  });

  test('one and many inflect in English and carry the number in Thai', () => {
    assert.equal(crowdLine(at(1)).en, '1 ChivaGo traveller checked in here in the last hour.');
    assert.match(crowdLine(at(4)).en, /^4 ChivaGo travellers/);
    assert.match(crowdLine(at(4)).th, /4 คน/);
  });

  test('the window is an hour', () => {
    assert.equal(CROWD_WINDOW_MINUTES, 60);
  });
});

/**
 * The claim under the number, and the one condition it depends on.
 *
 * "Counted from geofenced check-ins" is only worth printing while a fence is
 * being enforced. When the server stops checking, the sentence has to change
 * with it - printing it anyway would be a false statement about evidence.
 */
describe('what the visitor count claims', () => {
  test('fenced: it says the count came from a fence', () => {
    assert.match(crowdSource(false).en, /geofenced/i);
    assert.equal(crowdSource(false), CROWD_SOURCE);
  });

  test('unfenced: the word geofenced is gone, in both languages', () => {
    const said = crowdSource(true);
    assert.doesNotMatch(said.en, /geofenced/i);
    assert.doesNotMatch(said.th, /รัศมีจริง/);
    assert.equal(said, CROWD_SOURCE_UNFENCED);
  });

  test('unfenced: it says plainly that nobody is being checked', () => {
    assert.match(crowdSource(true).en, /NOT checking where/);
    assert.ok(crowdSource(true).th.includes('ไม่ได้ตรวจ'));
  });
});
