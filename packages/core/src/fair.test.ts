import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { areaByKey } from './areas.ts';
import { FAIRS, fairLots, fairOrderUrl, fairsIn, fold, searchFair, stepFrom, type FairLot } from './fair.ts';
import { isOrderLink } from './stalls.ts';

const fair = fairsIn('rmutt')[0]!;
const lots = fairLots(fair);
const codes = (found: FairLot[]) => found.map((l) => l.code);

/** Metres between two points, the long way (haversine), to check the short way. */
function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

test('every fair is labelled honestly and laid out where its area is', () => {
  for (const f of FAIRS) {
    const all = fairLots(f);
    const bbox = areaByKey(f.area).bbox;
    assert.equal(new Set(all.map((l) => l.code)).size, all.length, `${f.id}: each lot code once`);
    for (const l of all) {
      assert.match(l.code, /^[A-Z]\d{2}$/);
      assert.ok(l.lat >= bbox.minLat && l.lat <= bbox.maxLat && l.lng >= bbox.minLng && l.lng <= bbox.maxLng, `${l.code} is on the campus`);
    }
    const known = new Set(all.map((l) => l.code));
    for (const s of f.stalls) assert.ok(known.has(s.lot), `${f.id}: stall in ${s.lot}, a lot the plan has`);
    assert.equal(new Set(f.stalls.map((s) => s.lot)).size, f.stalls.length, `${f.id}: one stall per lot`);
    for (const s of f.stalls) if (s.orderSlug) assert.ok(isOrderLink(fairOrderUrl(s.orderSlug)), s.lot);
  }
  assert.equal(fair.example, true, 'no plan has been published: the RMUTT fair is an example until it is');
});

test('a row is its first lot, a direction and a spacing', () => {
  assert.equal(lots.length, 40);
  const a01 = lots.find((l) => l.code === 'A01')!;
  const a02 = lots.find((l) => l.code === 'A02')!;
  const b01 = lots.find((l) => l.code === 'B01')!;
  assert.ok(Math.abs(metres(a01, a02) - 10) < 0.05, 'lots ten metres apart');
  assert.ok(a02.lng > a01.lng && Math.abs(a02.lat - a01.lat) < 1e-9, 'running east');
  assert.ok(Math.abs(metres(a01, b01) - 14) < 0.05 && b01.lat < a01.lat, 'the next row fourteen metres south');
  assert.equal(lots.filter((l) => !l.stall).length, 40 - fair.stalls.length, 'free lots are kept, and said to be free');
});

test('a step on the ground is the distance asked for, in the direction asked', () => {
  const from = { lat: 14.03194, lng: 100.72414 };
  for (const bearing of [0, 45, 90, 180, 270]) {
    assert.ok(Math.abs(metres(from, stepFrom(from, bearing, 25)) - 25) < 0.05, `bearing ${bearing}`);
  }
});

test('people type a lot code every way: a5, A-05, a 05 and A05 are one lot', () => {
  for (const q of ['A05', 'a05', 'a5', 'A-05', 'a 05', 'A.05']) assert.equal(codes(searchFair(lots, q))[0], 'A05', q);
  assert.deepEqual(codes(searchFair(lots, 'a1')).slice(0, 2), ['A01', 'A10'], 'A01 first, then the codes that start a1');
});

test('a stall is found by what it sells, a name match ranks above a goods match', () => {
  assert.deepEqual(codes(searchFair(lots, 'ทุเรียน')), ['A01']);
  const mango = codes(searchFair(lots, 'มะม่วง'));
  assert.equal(mango[0], 'C03', 'ข้าวเหนียวมะม่วง by name, before the stalls that list mango among their goods');
  assert.deepEqual([...mango].sort(), ['A01', 'B01', 'C03', 'C04', 'D04']);
  assert.deepEqual(codes(searchFair(lots, 'ไข่ เค็ม')), ['B05'], 'every word must match');
  assert.deepEqual(codes(searchFair(lots, 'กาแฟ')), ['C05']);
});

test('a free lot is found by its code, never by a word it does not have', () => {
  assert.deepEqual(codes(searchFair(lots, 'A06')), ['A06']);
  assert.equal(searchFair(lots, 'A06')[0]!.stall, null);
  assert.ok(!codes(searchFair(lots, 'ต้นไม้')).includes('A06'), 'a zone word finds the stalls in the zone, not its empty lots');
  assert.ok(codes(searchFair(lots, 'ต้นไม้')).includes('A02'));
});

test('an empty search is the whole directory, and nonsense is nothing', () => {
  assert.equal(searchFair(lots, '').length, fair.stalls.length);
  assert.equal(searchFair(lots, '   ').length, fair.stalls.length);
  assert.deepEqual(searchFair(lots, 'ไม่มีของแบบนี้แน่นอน'), []);
});

test('fold drops what people type differently and keeps what they mean', () => {
  assert.equal(fold(' A-05 '), 'a05');
  assert.equal(fold('ไข่​เค็ม'), 'ไข่เค็ม');
  assert.equal(fold('น้ำผึ้ง · ชันโรง'), 'น้ำผึ้งชันโรง');
});
