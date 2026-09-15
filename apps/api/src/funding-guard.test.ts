import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';

import { openTestDb, rows, type DB } from './db.ts';
import { addOrganisation, addSponsorship, removeSponsorship } from './organisation-service.ts';
import { awardQuestReward, getBalances } from './wallet-service.ts';

/**
 * FUNDING IS NOT VERIFICATION.
 *
 * `sponsorship.ts` in core already holds the sibling rule — a join is not an
 * outcome — and it holds it in the REPORT: a dashboard cannot present taps as
 * results. This file holds the harder half, one layer down. A sponsor may pay
 * for the opportunity to do work. A sponsor may never pay for the record that
 * the work was done.
 *
 * WHY THIS IS THE ONE WORTH A TEST. Green points are the currency an ESG
 * reviewer is asked to trust, and the only thing that makes them worth
 * trusting is that a host looked at a submission and approved it. The day a
 * figure in `org_sponsorships` can move a figure in `wallets`, green stops
 * being evidence and becomes a price — and it would not look like a breach
 * when it happened. It would look like a helpful feature: top up the quest,
 * the points appear, everybody is pleased.
 *
 * `organisation-service.ts` says in its own header that the split is the whole
 * design: the funding figures are typed in by a moderator and unverified, the
 * counts they are set against come from the ledger and cannot be touched from
 * that file. This is that sentence, enforced.
 *
 * The sponsor-facing direction is covered too. An award must not be able to
 * read a budget either: a reward that knew what the quest was worth to its
 * funder is a reward that can be made to depend on it.
 */

let db: DB;
const T = new Date('2026-09-16T04:00:00.000Z');

/** Every row that could carry a point, as one comparable snapshot. */
const evidence = () => ({
  ledger: rows(db.prepare('SELECT * FROM ledger ORDER BY id').all()),
  wallets: rows(db.prepare('SELECT * FROM wallets ORDER BY user_id').all()),
});

beforeEach(() => {
  db = openTestDb();
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
    .run('ana', 'Ana', T.toISOString());
  db.prepare("INSERT INTO hosts (id,name,type) VALUES ('h1','Beach team','ngo')").run();
  db.prepare(
    `INSERT INTO quests (id,code,name_en,name_th,where_label,duration,reward_points,host_id,kind,lat,lng,geofence_radius_m)
     VALUES ('q1','Q1','Beach clean','เก็บขยะชายหาด','Chaweng','1 hr',40,'h1','today',9.5,100.0,250)`,
  ).run();
});

const fund = (thb: number) =>
  addSponsorship(
    db,
    { orgId: addOrganisation(db, { name: 'A Brand', kind: 'brand' }, 'Nok', T).id,
      questId: 'q1', fundedTHB: thb, perVerifiedTHB: 120, basis: 'signed' },
    'Nok',
    T,
  );

describe('money cannot mint evidence', () => {
  test('recording a sponsorship writes nothing to the ledger or a wallet', () => {
    const before = evidence();
    fund(500_000);
    assert.deepEqual(evidence(), before);
  });

  test('a larger cheque does not buy a larger balance', () => {
    // The plain form of the thing being refused. Two identical islands, one
    // funded a thousand times harder, and the same empty ledger on both.
    fund(1_000);
    const small = getBalances(db, 'ana');
    db.prepare('DELETE FROM org_sponsorships').run();
    fund(1_000_000);
    assert.deepEqual(getBalances(db, 'ana'), small);
    assert.equal(rows(db.prepare('SELECT * FROM ledger').all()).length, 0);
  });

  test('withdrawing the money does not withdraw the proof', () => {
    // The direction that matters more. Work verified while a sponsor was
    // paying stays verified after they stop - a traveller who cleaned a beach
    // does not un-clean it because a contract lapsed, and a host's approval is
    // not a thing a funder gets to take back.
    const s = fund(50_000);
    awardQuestReward(db, {
      userId: 'ana', questId: 'q1', questName: 'Beach clean', host: 'Beach team',
      points: 40, currency: 'green',
    });
    const earned = evidence();
    assert.equal(getBalances(db, 'ana').green, 40);

    assert.equal(removeSponsorship(db, s.sponsorId, 'q1'), true);
    assert.deepEqual(evidence(), earned);
    assert.equal(getBalances(db, 'ana').green, 40);
  });

  test('deleting the whole organisation leaves the evidence standing', () => {
    const s = fund(50_000);
    awardQuestReward(db, {
      userId: 'ana', questId: 'q1', questName: 'Beach clean', host: 'Beach team',
      points: 40, currency: 'green',
    });
    const earned = evidence();
    // ON DELETE CASCADE reaches org_sponsorships, and must stop there.
    db.prepare('DELETE FROM organisations WHERE id = ?').run(s.sponsorId);
    assert.deepEqual(evidence(), earned);
  });
});

/**
 * The structural half.
 *
 * The tests above prove the two files do not touch today. These prove they
 * CANNOT start touching without somebody deleting an assertion that says why
 * not - which is the difference between a rule and a coincidence.
 */
describe('the two sides do not know about each other', () => {
  const source = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');

  test('the funding file cannot write a point', () => {
    const s = source('organisation-service.ts');
    assert.ok(!/wallet-service/.test(s), 'organisation-service.ts imported wallet-service.ts');
    for (const table of ['ledger', 'wallets']) {
      assert.ok(
        !new RegExp(`(INSERT INTO|UPDATE|DELETE FROM)\\s+${table}\\b`, 'i').test(s),
        `organisation-service.ts writes to ${table} - funding is not verification`,
      );
    }
  });

  test('an award cannot read a budget', () => {
    // The subtler direction, and the one that would arrive with a good
    // argument attached: "pay more where the sponsor pays more" is a
    // reasonable-sounding sentence and the end of green meaning anything.
    const s = source('wallet-service.ts');
    assert.ok(!/organisation-service/.test(s), 'wallet-service.ts imported organisation-service.ts');
    assert.ok(
      !/org_sponsorships|funded_thb|per_verified_thb/i.test(s),
      'wallet-service.ts reads the funding table - an award must not know what it is worth to a sponsor',
    );
  });

  test('nothing that writes a point reads the funding table', () => {
    // Widened past the two files above, because the movement could be added
    // anywhere. Every service that awards goes through `applyMovement`, so
    // this is the set that matters.
    for (const f of ['quest-service.ts', 'checkin-service.ts', 'medal-service.ts']) {
      assert.ok(
        !/org_sponsorships|funded_thb|per_verified_thb/i.test(source(f)),
        `${f} reads the funding table`,
      );
    }
  });
});
