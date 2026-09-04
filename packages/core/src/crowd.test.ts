import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { CROWD_WINDOW_MINUTES, crowdLine } from './crowd.ts';

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
