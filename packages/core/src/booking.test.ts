import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isBookingLink } from './booking.ts';
import { SEED_PLACES } from './seed.ts';

describe('a booking link the app will open', () => {
  test('an https page on a named host is one', () => {
    assert.ok(isBookingLink('https://badminton-booking-ihw1.onrender.com/'));
    assert.ok(isBookingLink('https://example.co.th/book?court=2'));
  });

  test('anything that could take somebody somewhere else is not', () => {
    for (const bad of [
      'http://badminton-booking-ihw1.onrender.com/',
      'javascript:alert(1)',
      'https://user:pass@example.com/',
      'https://example.com@evil.example/',
      'https:///nohost',
      'https://localhost/',
      ' https://example.com/',
      '',
      null,
      undefined,
    ]) {
      assert.equal(isBookingLink(bad), false, String(bad));
    }
  });

  test('every booking link in the seed passes', () => {
    const linked = SEED_PLACES.filter((p) => p.bookingUrl != null);
    assert.ok(linked.length > 0, 'the seed carries at least one booking link');
    for (const p of linked) assert.ok(isBookingLink(p.bookingUrl), `${p.id}: ${p.bookingUrl}`);
  });
});
