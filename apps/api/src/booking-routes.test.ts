import { strict as assert } from 'node:assert';
import { before, describe, test } from 'node:test';

// Route-level coverage uses its own process and never opens the pilot DB.
delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';
const { app, db } = await import('./server-node.ts');
const { seedArea } = await import('./seed-area.ts');

const COURT = 'sinthani-badminton';
const BOOKING = 'https://badminton-booking-ihw1.onrender.com/';

before(() => { seedArea(db, 'rmutt'); });

const place = async (id: string) => {
  const res = await app.request(`/places/${id}`, { headers: { origin: 'http://localhost:8085' } });
  assert.equal(res.status, 200);
  return ((await res.json()) as { data: { bookingUrl: string | null; province: string } }).data;
};

describe('a place you book before you go', () => {
  test('opening RMUTT adds the court with its booking page, and the API serves it', async () => {
    const court = await place(COURT);
    assert.equal(court.province, 'TH-13');
    assert.equal(court.bookingUrl, BOOKING);
  });

  test('a place with no booking page says null, not an empty link', async () => {
    assert.equal((await place('rmutt-library')).bookingUrl, null);
  });

  test('a link edited into the row by hand that is not plain https never reaches a phone', async () => {
    for (const bad of ['http://badminton-booking-ihw1.onrender.com/', 'javascript:alert(1)', 'https://a@evil.example/']) {
      db.prepare('UPDATE places SET booking_url = ? WHERE id = ?').run(bad, COURT);
      assert.equal((await place(COURT)).bookingUrl, null, bad);
    }
    db.prepare('UPDATE places SET booking_url = ? WHERE id = ?').run(BOOKING, COURT);
  });
});
