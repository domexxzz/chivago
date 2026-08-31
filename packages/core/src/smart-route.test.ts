import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  FARES, MOTO_LIMIT_KM, WALK_LIMIT_KM,
  chooseMode, makeLeg, smartRoute, straightLineKm,
  type Waypoint,
} from './smart-route.ts';

const wp = (id: string, lat: number, lng: number, island = false): Waypoint =>
  ({ id, name: { en: id, th: id }, lat, lng, ...(island ? { island: true } : {}) });

// Real Samui coordinates, so the distances mean something.
const CHAWENG = wp('chaweng', 9.5357, 100.0617);
const LAMAI = wp('lamai', 9.4667, 100.0500);
const THONG_KRUT = wp('thongkrut', 9.4167, 99.9500);
const NEXT_DOOR = wp('next', 9.5360, 100.0625);
/** ~3 km north of Chaweng: 4 km by road, squarely in the band where the
 *  traveller is choosing between time and money. */
const BOPHUT = wp('bophut', 9.5627, 100.0617);
const KOH_TAEN = wp('kohtaen', 9.3833, 99.9333, true);
const PIER = wp('thongkrut-pier', 9.4150, 99.9490);

describe('choosing how to travel', () => {
  test('a short hop is walked, whatever else is on offer', () => {
    assert.equal(chooseMode(0.4, 'fast'), 'walk');
    assert.equal(chooseMode(0.4, 'cheap'), 'walk');
  });

  test('the middle band is where the traveller actually chooses', () => {
    // Both are reasonable at 4 km; one costs time, the other money. That is a
    // choice to offer, not one to make for somebody.
    assert.equal(chooseMode(4, 'fast'), 'moto');
    assert.equal(chooseMode(4, 'cheap'), 'songthaew');
  });

  test('a long haul is a songthaew either way', () => {
    // A motorbike taxi across the island is not a fast option, it is an hour
    // in the sun.
    assert.equal(chooseMode(MOTO_LIMIT_KM + 1, 'fast'), 'songthaew');
    assert.equal(chooseMode(MOTO_LIMIT_KM + 1, 'cheap'), 'songthaew');
  });

  test('the walk limit and the moto limit do not overlap', () => {
    assert.ok(WALK_LIMIT_KM < MOTO_LIMIT_KM);
  });
});

describe('a single leg', () => {
  test('waiting is reported apart from moving', () => {
    // The deck promises "เวลาต่อรถ". A twelve-minute ride is not a
    // twelve-minute journey when the songthaew comes every eight.
    const leg = makeLeg(CHAWENG, LAMAI, 'songthaew');
    assert.ok(leg.waitMinutes > 0, 'a songthaew you never wait for is a taxi');
    assert.ok(leg.moveMinutes > 0);
    assert.notEqual(leg.moveMinutes, leg.moveMinutes + leg.waitMinutes);
  });

  test('walking has no fare and no wait', () => {
    const leg = makeLeg(CHAWENG, NEXT_DOOR, 'walk');
    assert.equal(leg.fareTHB, 0);
    assert.equal(leg.waitMinutes, 0);
  });

  test('road distance exceeds the straight line, because the road is a ring', () => {
    const leg = makeLeg(CHAWENG, THONG_KRUT, 'songthaew');
    assert.ok(leg.km > straightLineKm(CHAWENG, THONG_KRUT), 'no road runs through the middle');
  });

  test('every leg says what it is in both languages', () => {
    for (const mode of ['walk', 'songthaew', 'moto', 'boat'] as const) {
      const leg = makeLeg(CHAWENG, LAMAI, mode);
      assert.ok(leg.why.en.length > 8, `${mode} has no English reason`);
      assert.ok(leg.why.th.length > 4, `${mode} has no Thai reason`);
    }
  });

  test('a motorbike taxi costs more than a songthaew over the same ground', () => {
    const moto = makeLeg(CHAWENG, LAMAI, 'moto');
    const songthaew = makeLeg(CHAWENG, LAMAI, 'songthaew');
    assert.ok(moto.fareTHB > songthaew.fareTHB);
    assert.ok(moto.moveMinutes + moto.waitMinutes < songthaew.moveMinutes + songthaew.waitMinutes);
  });
});

describe('a whole journey', () => {
  test('a walk across the road is one leg and no transfers', () => {
    const route = smartRoute(CHAWENG, NEXT_DOOR);
    assert.equal(route.options[0]!.legs.length, 1);
    assert.equal(route.options[0]!.transfers, 0);
    assert.equal(route.options[0]!.totalTHB, 0);
  });

  test('a cheaper option is offered only when it is actually cheaper', () => {
    // Two identical cards is worse than one honest one.
    const short = smartRoute(CHAWENG, NEXT_DOOR);
    assert.equal(short.options.length, 1, 'a walk has no cheaper alternative');

    const middle = smartRoute(CHAWENG, BOPHUT);
    assert.equal(middle.options.length, 2, 'a 4 km hop is a real choice');
    assert.ok(middle.options[1]!.totalTHB < middle.options[0]!.totalTHB);
    assert.ok(
      middle.options[1]!.totalMinutes >= middle.options[0]!.totalMinutes,
      'the cheaper route should not also be the faster one',
    );
  });

  test('a cross-island haul honestly offers one option, not two identical ones', () => {
    // Chaweng to Lamai is 10.5 km by road - past the point where a motorbike
    // taxi is a reasonable answer, so both preferences agree and there is
    // nothing to choose between.
    const route = smartRoute(CHAWENG, LAMAI);
    assert.equal(route.options.length, 1);
    assert.equal(route.options[0]!.legs[0]!.mode, 'songthaew');
  });

  test('an island forces a boat, routed through the nearest pier', () => {
    const route = smartRoute(THONG_KRUT, KOH_TAEN, [PIER]);
    const legs = route.options[0]!.legs;
    assert.ok(legs.some((l) => l.mode === 'boat'), 'no boat to an island');
    assert.equal(legs[legs.length - 1]!.to.id, 'kohtaen');
  });

  test('coming back from the island is the same journey reversed', () => {
    const out = smartRoute(THONG_KRUT, KOH_TAEN, [PIER]).options[0]!;
    const back = smartRoute(KOH_TAEN, THONG_KRUT, [PIER]).options[0]!;
    assert.equal(back.legs[0]!.mode, 'boat', 'you leave an island by boat');
    assert.equal(back.legs.length, out.legs.length);
  });

  test('a crossing with no pier fails loudly rather than routing over water', () => {
    // Silently driving into the sea is the failure mode worth preventing.
    const route = smartRoute(THONG_KRUT, KOH_TAEN, []);
    assert.equal(route.options.length, 0);
    assert.match(route.caveat.en, /pier/i);
    assert.ok(route.caveat.th.length > 8);
  });

  test('the total is the sum of every leg, waiting included', () => {
    const opt = smartRoute(THONG_KRUT, KOH_TAEN, [PIER]).options[0]!;
    const sum = opt.legs.reduce((n, l) => n + l.moveMinutes + l.waitMinutes, 0);
    assert.equal(opt.totalMinutes, sum, 'a total that drops the waiting is the old lie');
    assert.equal(opt.totalTHB, opt.legs.reduce((n, l) => n + l.fareTHB, 0));
  });

  test('walking between rides is not counted as a transfer', () => {
    // You do not wait for a pavement.
    const route = smartRoute(CHAWENG, BOPHUT);
    for (const opt of route.options) {
      const vehicles = opt.legs.filter((l) => l.mode !== 'walk').length;
      assert.equal(opt.transfers, Math.max(0, vehicles - 1));
    }
  });

  test('every route says what the estimate cannot see', () => {
    // Fares are constants with a date on them, not quotes.
    const route = smartRoute(CHAWENG, BOPHUT);
    assert.match(route.caveat.en, new RegExp(FARES.asOf));
    assert.match(route.caveat.en, /[Nn]ot live pricing/);
    assert.ok(route.caveat.th.length > 20, 'the caveat must reach a Thai reader too');
  });
});
