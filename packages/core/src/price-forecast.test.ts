import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  BASELINE, SPREAD,
  cheapestMonth, confidenceFor, forecastPrice, outlookAhead, withinWindow,
} from './price-forecast.ts';

// A fixed "today" so every band is reproducible.
const NOW = new Date('2026-09-01T05:00:00.000Z'); // 12:00 island time

describe('a price is always a band, never a number', () => {
  test('low is under typical is under high', () => {
    const f = forecastPrice('stay', '2026-09-05', NOW);
    assert.ok(f.band.low < f.band.typical, `${f.band.low} !< ${f.band.typical}`);
    assert.ok(f.band.typical < f.band.high);
    assert.equal(f.band.currency, 'THB');
  });

  test('every band says what moved it, in both languages', () => {
    // A forecast nobody can argue with is a forecast nobody can correct.
    const f = forecastPrice('stay', '2026-12-30', NOW);
    assert.ok(f.drivers.length >= 2, 'New Year in peak season is at least two drivers');
    for (const d of f.drivers) {
      assert.ok(d.label.en.length > 2, 'a driver with no English label');
      assert.ok(d.label.th.length > 1, 'a driver with no Thai label');
      assert.ok(d.effect > 0);
    }
  });

  test('the caveat is on every single response, in both languages', () => {
    for (const cat of ['stay', 'ferry', 'flight', 'scooter'] as const) {
      const f = forecastPrice(cat, '2026-09-05', NOW);
      assert.match(f.caveat.en, /not a quote/i, `${cat} does not say it is not a quote`);
      assert.match(f.caveat.en, new RegExp(BASELINE.asOf));
      assert.ok(f.caveat.th.length > 20, `${cat} has no Thai caveat`);
    }
  });
});

describe('confidence falls with the horizon', () => {
  test('there is deliberately no level above indicative', () => {
    // "Firm" would need partner inventory. Inventing a confident tier is the
    // single most misleading thing this file could do.
    assert.equal(confidenceFor(0), 'indicative');
    assert.equal(confidenceFor(14), 'indicative');
    assert.equal(confidenceFor(15), 'rough');
    assert.equal(confidenceFor(91), 'speculative');
  });

  test('a wider horizon gives a wider band, not a bolder number', () => {
    const soon = forecastPrice('stay', '2026-09-05', NOW);
    const distant = forecastPrice('stay', '2027-05-05', NOW);
    const width = (f: typeof soon) => (f.band.high - f.band.low) / f.band.typical;
    assert.ok(width(distant) > width(soon), 'the far band should be the wider one');
    assert.ok(SPREAD.speculative > SPREAD.rough && SPREAD.rough > SPREAD.indicative);
  });
});

describe('ordinary days and festival days are told apart', () => {
  test('New Year is flagged and costs more than the same season around it', () => {
    const newYear = forecastPrice('stay', '2026-12-30', NOW);
    const ordinary = forecastPrice('stay', '2026-12-15', NOW);
    assert.equal(newYear.isFestival, true);
    assert.equal(ordinary.isFestival, false);
    assert.ok(newYear.band.typical > ordinary.band.typical);
  });

  test('Songkran is flagged', () => {
    assert.equal(forecastPrice('stay', '2027-04-13', NOW).isFestival, true);
    assert.equal(forecastPrice('stay', '2027-04-25', NOW).isFestival, false);
  });

  test('a festival window that wraps the new year still matches', () => {
    // 28 Dec to 3 Jan is one window, not two.
    assert.ok(withinWindow('12-31', '12-28', '01-03'));
    assert.ok(withinWindow('01-02', '12-28', '01-03'));
    assert.ok(!withinWindow('01-10', '12-28', '01-03'));
  });
});

describe('the model reflects Samui, not the mainland', () => {
  test('November is cheaper than high season, and December beats the monsoon', () => {
    // Samui takes the northeast monsoon: wettest Oct-Dec while Phuket is dry.
    const nov = forecastPrice('stay', '2026-11-18', NOW).band.typical;
    const dec = forecastPrice('stay', '2026-12-16', NOW).band.typical;
    const feb = forecastPrice('stay', '2027-02-18', NOW).band.typical;
    assert.ok(nov < feb, 'the wettest month should undercut high season');
    assert.ok(dec > nov, 'peak season should beat the monsoon');
  });

  test('a weekend costs more than the midweek day beside it', () => {
    const friday = forecastPrice('stay', '2026-09-04', NOW).band.typical;
    const tuesday = forecastPrice('stay', '2026-09-01', NOW).band.typical;
    assert.ok(friday > tuesday, `${friday} should beat ${tuesday}`);
  });

  test('a scooter hire ignores weekends and festivals in its price', () => {
    // The shop hiring it does not care what week it is.
    const festival = forecastPrice('scooter', '2026-12-30', NOW);
    assert.equal(festival.drivers.length, 1, 'season only');
    assert.equal(festival.isFestival, true, 'still worth SAYING there is a festival');
  });
});

describe('the outlook, for deciding when to come', () => {
  test('it covers the months asked for, in order', () => {
    const out = outlookAhead('stay', NOW, 6);
    assert.equal(out.length, 6);
    assert.equal(out[0]!.month, '2026-09');
    const months = out.map((m) => m.month);
    assert.deepEqual([...months].sort(), months, 'months came back out of order');
  });

  test('it finds the cheapest month, and it is a low-season one', () => {
    const out = outlookAhead('stay', NOW, 6);
    const best = cheapestMonth(out)!;
    assert.ok(best, 'no cheapest month in six');
    assert.ok(['2026-09', '2026-10', '2026-11'].includes(best.month), best.month);
    assert.ok(out.every((m) => m.band.typical >= best.band.typical));
  });

  test('a festival month is marked so nobody books into one unknowingly', () => {
    const out = outlookAhead('stay', NOW, 6);
    const december = out.find((m) => m.month === '2026-12');
    assert.equal(december?.hasFestival, true, 'December carries New Year');
  });

  test('an empty outlook has no cheapest month rather than a fake one', () => {
    assert.equal(cheapestMonth([]), null);
  });
});

describe('ordinary and festival are genuinely separated', () => {
  test('a month headline is an ordinary day, not whichever day was sampled', () => {
    // Sampling the 15th put Loy Krathong inside November's headline, which
    // inflated the cheapest month on the island by 20% and hid it from
    // anyone scanning the column.
    const out = outlookAhead('stay', NOW, 6);
    const nov = out.find((m) => m.month === '2026-11')!;
    const loyKrathong = forecastPrice('stay', '2026-11-15', NOW);
    assert.ok(
      nov.band.typical < loyKrathong.band.typical,
      'the month headline is carrying a festival',
    );
    assert.equal(nov.hasFestival, true, 'but the festival must still be flagged');
  });

  test('with the fix, November is the cheapest month it actually is', () => {
    const out = outlookAhead('stay', NOW, 6);
    assert.equal(cheapestMonth(out)!.month, '2026-11');
  });
});
