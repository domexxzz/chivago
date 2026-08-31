import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  balanceOf,
  canAfford,
  emptyBalances,
  formatAmount,
  formatLedgerDate,
  inQuietHours,
  islandDateKey,
  nextQuietHoursEnd,
  shortfall,
} from './wallet.ts';

describe('ledger formatting', () => {
  test('credits get a plus, debits get U+2212 MINUS SIGN not a hyphen', () => {
    assert.equal(formatAmount(150), '+150');
    assert.equal(formatAmount(-180), '−180');
    assert.notEqual(formatAmount(-180), '-180');
  });

  test('thousands are grouped', () => {
    assert.equal(formatAmount(-1200), '−1,200');
  });

  test('relative dates are island-local, not device-local', () => {
    // 2026-10-14 09:00 UTC == 16:00 on Koh Samui.
    const now = new Date('2026-10-14T09:00:00Z');
    assert.equal(formatLedgerDate('2026-10-14T02:00:00Z', now), 'Today');
    // 2026-10-13 09:00 UTC == 16:00 Oct 13 on the island -> yesterday.
    assert.equal(formatLedgerDate('2026-10-13T09:00:00Z', now), 'Yesterday');
    assert.equal(formatLedgerDate('2026-10-12T04:00:00Z', now), '12 Oct');
  });

  test('a late-evening UTC stamp is already the next day on the island', () => {
    // 2026-10-13 22:00 UTC == 2026-10-14 05:00 on Samui, so it is Today there
    // even though a UTC-based reading would call it yesterday.
    const now = new Date('2026-10-14T09:00:00Z');
    assert.equal(formatLedgerDate('2026-10-13T22:00:00Z', now), 'Today');
  });

  test('the label does not shift with the device timezone', () => {
    // A tourist whose phone is still on Europe/Berlin must see the same label
    // as the merchant standing next to them.
    const now = new Date('2026-10-14T09:00:00Z');
    const before = process.env.TZ;
    try {
      process.env.TZ = 'Europe/Berlin';
      assert.equal(formatLedgerDate('2026-10-13T22:00:00Z', now), 'Today');
      process.env.TZ = 'Pacific/Kiritimati';
      assert.equal(formatLedgerDate('2026-10-13T22:00:00Z', now), 'Today');
    } finally {
      process.env.TZ = before;
    }
  });

  test('a future-dated entry does not read as Yesterday', () => {
    const now = new Date('2026-10-14T09:00:00Z');
    assert.equal(formatLedgerDate('2026-10-15T10:00:00Z', now), 'Today');
  });
});

describe('affordability', () => {
  const held = { trip: 320, green: 1240 };

  test('exact balance can afford the offer', () => {
    assert.equal(canAfford({ trip: 0, green: 180 }, 'green', 180), true);
    assert.equal(shortfall({ trip: 0, green: 180 }, 'green', 180), 0);
  });

  test('shortfall tells the user how far off they are', () => {
    assert.equal(canAfford(held, 'green', 1200), true);
    assert.equal(canAfford(held, 'green', 1500), false);
    assert.equal(shortfall(held, 'green', 1500), 260);
  });

  test('shortfall never goes negative', () => {
    assert.equal(shortfall(held, 'green', 180), 0);
  });

  // The reason canAfford takes the whole balance set rather than a number:
  // a rich Green balance must not silently pay for a Trip-priced offer.
  test('one currency cannot pay for the other', () => {
    assert.equal(canAfford(held, 'trip', 500), false, '320 Trip cannot buy 500');
    assert.equal(canAfford(held, 'green', 500), true, '1240 Green can');
    assert.equal(shortfall(held, 'trip', 500), 180);
  });

  test('balanceOf reads the named purse, never the other one', () => {
    assert.equal(balanceOf(held, 'trip'), 320);
    assert.equal(balanceOf(held, 'green'), 1240);
    assert.deepEqual(emptyBalances(), { trip: 0, green: 0 });
  });
});

describe('island date key', () => {
  // The check-in idempotency key is built from this, so a wrong answer means
  // a second free check-in - or none at all across a midnight.
  test('is the ISLAND date, not the device date', () => {
    // 2026-10-13 22:00 UTC is already 05:00 on 14 Oct in Bangkok.
    assert.equal(islandDateKey(new Date('2026-10-13T22:00:00Z')), '2026-10-14');
    assert.equal(islandDateKey(new Date('2026-10-13T16:00:00Z')), '2026-10-13');
  });

  test('does not move with the device timezone', () => {
    const before = process.env.TZ;
    try {
      process.env.TZ = 'Europe/Berlin';
      const a = islandDateKey(new Date('2026-10-13T22:00:00Z'));
      process.env.TZ = 'Pacific/Kiritimati';
      const b = islandDateKey(new Date('2026-10-13T22:00:00Z'));
      assert.equal(a, '2026-10-14');
      assert.equal(a, b);
    } finally {
      process.env.TZ = before;
    }
  });
});

describe('quiet hours', () => {
  /** Island hours are what matter; these are the UTC instants for them. */
  const at = (islandHour: number) =>
    new Date(Date.UTC(2026, 7, 31, (islandHour + 24 - 7) % 24, 0, 0));

  test('the default window wraps midnight', () => {
    for (const h of [22, 23, 0, 3, 6]) {
      assert.equal(inQuietHours(at(h)), true, `${h}:00 should be quiet`);
    }
    for (const h of [7, 12, 21]) {
      assert.equal(inQuietHours(at(h)), false, `${h}:00 should not be`);
    }
  });

  test('a custom window that does NOT wrap is a plain range', () => {
    // The bug this catches: treating every window as wrapping made
    // `hour >= 1 || hour < 9` true for almost every hour of the day, so
    // somebody who set 01:00-09:00 was never notified at all.
    for (const h of [1, 5, 8]) {
      assert.equal(inQuietHours(at(h), 1, 9), true, `${h}:00 inside 01-09`);
    }
    for (const h of [0, 9, 14, 23]) {
      assert.equal(inQuietHours(at(h), 1, 9), false, `${h}:00 outside 01-09`);
    }
  });

  test('the boundaries belong to the waking side', () => {
    // 22:00 is quiet, 07:00 is not: the window is [from, until).
    assert.equal(inQuietHours(at(22)), true);
    assert.equal(inQuietHours(at(7)), false);
  });

  test('it reads the island clock, not the device', () => {
    const before = process.env.TZ;
    try {
      // 02:00 on Samui is quiet whatever the phone thinks the time is.
      process.env.TZ = 'Europe/Berlin';
      assert.equal(inQuietHours(at(2)), true);
      process.env.TZ = 'Pacific/Kiritimati';
      assert.equal(inQuietHours(at(2)), true);
    } finally {
      process.env.TZ = before;
    }
  });

  test('a held notification is released at the next morning boundary', () => {
    // Explicit instants rather than the at() helper: it keeps the UTC DATE
    // fixed, so an island hour before 07:00 lands on the FOLLOWING island day
    // and the two cases would silently coincide.

    // 2026-08-31 23:00 island -> 07:00 the following morning.
    assert.equal(
      nextQuietHoursEnd(new Date('2026-08-31T16:00:00Z')).toISOString(),
      '2026-09-01T00:00:00.000Z',
    );
    // 2026-08-31 02:00 island -> 07:00 the SAME morning, five hours away.
    assert.equal(
      nextQuietHoursEnd(new Date('2026-08-30T19:00:00Z')).toISOString(),
      '2026-08-31T00:00:00.000Z',
    );
  });
});
