import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  EXCLUSIVITY_BOUNDARY, alsoClaimedBy, claimState, exclusivityNote, fundersAt,
  type Funder,
} from './claims.ts';

/**
 * The double count nobody else can find.
 *
 * Two companies fund the same cleanup and each reports it from its own
 * records. Neither is lying and neither can see the other. It is findable here
 * only because both funded through one ledger — which is the single thing a
 * shared platform has that a consultant does not.
 */

const jan: Funder = { sponsorId: 'acme', startedAt: '2026-01-01T00:00:00.000Z' };
const mar: Funder = { sponsorId: 'beta', startedAt: '2026-03-01T00:00:00.000Z' };
const FEB = '2026-02-15T06:00:00.000Z';
const APR = '2026-04-15T06:00:00.000Z';

describe('whether one approval belongs to one filer', () => {
  test('one funder is exclusive', () => {
    assert.equal(claimState([jan], FEB), 'exclusive');
    assert.deepEqual(alsoClaimedBy([jan], FEB, 'acme'), []);
  });

  test('two funders at the time of approval is shared', () => {
    assert.equal(claimState([jan, mar], APR), 'shared');
    assert.deepEqual(alsoClaimedBy([jan, mar], APR, 'acme'), ['beta']);
  });

  test('a partner who joined later cannot dilute work already done', () => {
    // THE ONE THAT MAKES THIS PER-SUBMISSION RATHER THAN PER-QUEST. February's
    // approval was funded by one partner and stays exclusive after March, when
    // a second joined. Deciding exclusivity per QUEST would retroactively make
    // a filed claim shared because somebody else turned up afterwards.
    assert.equal(claimState([jan, mar], FEB), 'exclusive');
    assert.equal(claimState([jan, mar], APR), 'shared');
  });

  test('funding that starts at the same instant counts', () => {
    // Money that started being spent at noon paid for an approval at noon.
    assert.equal(claimState([{ sponsorId: 'acme', startedAt: FEB }], FEB), 'exclusive');
  });

  test('an approval nobody was funding is unfunded, not exclusive', () => {
    // Its own answer on purpose. Calling it exclusive would hand it to
    // whichever partner asked for a report first.
    assert.equal(claimState([mar], FEB), 'unfunded');
    assert.equal(claimState([], FEB), 'unfunded');
  });

  test('the same partner funding twice is still one partner', () => {
    // Two funding lines on one quest from one org - a top-up - is not a
    // co-funding, and a naive length check would have called it shared.
    const topUp: Funder = { sponsorId: 'acme', startedAt: '2026-02-01T00:00:00.000Z' };
    assert.equal(claimState([jan, topUp], FEB), 'exclusive');
    assert.deepEqual(fundersAt([jan, topUp], FEB), ['acme']);
  });

  test('the active funders come back sorted, so a report reads the same twice', () => {
    assert.deepEqual(fundersAt([mar, jan], APR), ['acme', 'beta']);
    assert.deepEqual(fundersAt([jan, mar], APR), ['acme', 'beta']);
  });
});

describe('what the report is allowed to say about it', () => {
  test('all exclusive earns the sentence nobody else can print', () => {
    const said = exclusivityNote(0, 40);
    assert.match(said.en, /Every one of these 40/);
    assert.match(said.en, /alone/);
    assert.match(said.th, /เพียงรายเดียว/);
  });

  test('any shared one loses the guarantee and names the number', () => {
    const said = exclusivityNote(9, 40);
    assert.match(said.en, /9 of these 40/);
    assert.ok(!/alone/.test(said.en), 'the guarantee survived a shared activity');
    assert.match(said.th, /9 จาก 40/);
  });

  test('a shared report says why it does not split', () => {
    // Splitting 50/50 would be an invented attribution wearing the clothes of
    // arithmetic. An auditor told "nine of forty" can act; one handed 4.5
    // cannot.
    const said = exclusivityNote(9, 40);
    assert.match(said.en, /not divided here/);
    assert.match(said.en, /invented attribution/);
    assert.match(said.th, /ไม่แบ่งสัดส่วน/);
  });

  test('nothing approved says so rather than claiming exclusivity over nothing', () => {
    const said = exclusivityNote(0, 0);
    assert.match(said.en, /No approved activity/);
    assert.ok(!/Every one/.test(said.en), 'an empty period was called exclusive');
  });

  test('the guarantee ships with its limit', () => {
    // Exclusivity is provable across this platform and nowhere else. Letting
    // "claimed by one partner" read as "claimed once in the world" would be
    // making the larger claim while proving the smaller one.
    assert.match(EXCLUSIVITY_BOUNDARY.en, /through this platform/);
    assert.match(EXCLUSIVITY_BOUNDARY.en, /cannot speak for/);
    assert.match(EXCLUSIVITY_BOUNDARY.th, /นอกแพลตฟอร์ม/);
  });
});
