import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { historyBars } from '../src/components/PlaceLive.tsx';

describe('the air chart', () => {
  const history = {
    since: '2026-08-30T01:00:00.000Z',
    days: [
      { day: '2026-09-01', min: 20, max: 60, avg: 40, samples: 3 },
      { day: '2026-09-03', min: 30, max: 30, avg: 30, samples: 1 },
    ],
  };

  test('a gap is a gap: two recorded days make two bars, in thirty slots ending on the last', () => {
    const bars = historyBars(history, 300, 90);
    assert.equal(bars.length, 2);
    assert.equal(bars[1]!.day, '2026-09-03');
    assert.ok(bars[1]!.x > bars[0]!.x, 'later is to the right');
    assert.ok(bars[1]!.x + bars[1]!.w <= 300, 'the last bar is the last slot');
  });

  test('a bar runs from the day\'s max down to its min, with the mean between', () => {
    const [b] = historyBars(history, 300, 90);
    assert.ok(b!.top < b!.mid && b!.mid < b!.bottom);
    assert.ok(b!.top >= 0 && b!.bottom <= 90);
  });

  test('nothing recorded draws nothing', () => {
    assert.deepEqual(historyBars({ since: null, days: [] }, 300, 90), []);
  });
});
