import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import {
  InvalidFunding, UnknownOrganisation, addOrganisation, addSponsorship, basisFor,
  listOrganisations, organisationById, recordPayment, removeSponsorship, sponsorshipsFor,
} from './organisation-service.ts';

let db: DB;
const T = new Date('2026-09-13T04:00:00.000Z');

beforeEach(() => {
  db = openTestDb();
  db.prepare("INSERT INTO hosts (id,name,type) VALUES ('h1','Host','ngo')").run();
  for (const id of ['q1', 'q2']) {
    db.prepare(
      `INSERT INTO quests (id,code,name_en,name_th,where_label,duration,reward_points,host_id,kind,lat,lng,geofence_radius_m)
       VALUES (?,?,?,?,'x','1 hr',10,'h1','today',9.5,100.0,250)`,
    ).run(id, id.toUpperCase(), id, id);
  }
});

const uni = () => addOrganisation(db, { name: 'KU Sriracha', nameTh: 'ม.เกษตร ศรีราชา', kind: 'university' }, 'Nok', T);

describe('a deployment starts with no funders at all', () => {
  test('the list is empty, which is the answer and not a missing one', () => {
    assert.deepEqual(listOrganisations(db), []);
  });

  test('asking for one that does not exist says so', () => {
    assert.throws(() => organisationById(db, 'nope'), UnknownOrganisation);
  });
});

describe('adding a funder', () => {
  test('a university is a kind of its own, not a brand', () => {
    const org = uni();
    assert.equal(org.kind, 'university');
    assert.deepEqual(organisationById(db, org.id).name, { en: 'KU Sriracha', th: 'ม.เกษตร ศรีราชา' });
  });

  test('a missing Thai name falls back to the English one, never to a blank', () => {
    const org = addOrganisation(db, { name: 'Acme', kind: 'company' }, null, T);
    assert.equal(org.name.th, 'Acme', 'a blank Thai name is worse than an untranslated one');
  });

  test('a nameless or unknown-kind organisation is refused', () => {
    assert.throws(() => addOrganisation(db, { name: '   ', kind: 'company' }, null, T), InvalidFunding);
    assert.throws(() => addOrganisation(db, { name: 'X', kind: 'wizard' }, null, T), InvalidFunding);
  });
});

describe('what it funded, and whether anything stands behind it', () => {
  test('a new sponsorship is declared unless somebody says otherwise', () => {
    const org = uni();
    addSponsorship(db, { orgId: org.id, questId: 'q1', fundedTHB: 50_000, perVerifiedTHB: 500 }, 'Nok', T);
    assert.equal(basisFor(db, org.id), 'declared', 'the cautious default is the one to get wrong');
  });

  test('all signed reads signed; one declared among them does not', () => {
    const org = uni();
    addSponsorship(db, { orgId: org.id, questId: 'q1', fundedTHB: 10_000, perVerifiedTHB: 100, basis: 'signed' }, 'Nok', T);
    assert.equal(basisFor(db, org.id), 'signed');
    addSponsorship(db, { orgId: org.id, questId: 'q2', fundedTHB: 5_000, perVerifiedTHB: 50 }, 'Nok', T);
    assert.equal(basisFor(db, org.id), 'declared', 'the weakest link decides, or a report overclaims');
  });

  test('an organisation with nothing funded is declared, not signed', () => {
    assert.equal(basisFor(db, uni().id), 'declared');
  });

  test('paying more per approval than was funded is a typo, and is refused', () => {
    const org = uni();
    assert.throws(
      () => addSponsorship(db, { orgId: org.id, questId: 'q1', fundedTHB: 1_000, perVerifiedTHB: 5_000 }, null, T),
      InvalidFunding,
    );
    assert.deepEqual(sponsorshipsFor(db, org.id), []);
  });

  test('negative money is refused on both figures', () => {
    const org = uni();
    for (const bad of [{ fundedTHB: -1, perVerifiedTHB: 0 }, { fundedTHB: 10, perVerifiedTHB: -5 }]) {
      assert.throws(() => addSponsorship(db, { orgId: org.id, questId: 'q1', ...bad }, null, T), InvalidFunding);
    }
  });

  test('funding a quest nobody has, or an organisation nobody has, is refused', () => {
    const org = uni();
    assert.throws(() => addSponsorship(db, { orgId: org.id, questId: 'ghost', fundedTHB: 1, perVerifiedTHB: 1 }, null, T), InvalidFunding);
    assert.throws(() => addSponsorship(db, { orgId: 'ghost', questId: 'q1', fundedTHB: 1, perVerifiedTHB: 1 }, null, T), UnknownOrganisation);
  });

  test('funding the same quest twice corrects the figure instead of duplicating it', () => {
    // A mistyped amount must be fixable without removing a funder mid-period.
    const org = uni();
    addSponsorship(db, { orgId: org.id, questId: 'q1', fundedTHB: 5_000, perVerifiedTHB: 50 }, 'Nok', T);
    addSponsorship(db, { orgId: org.id, questId: 'q1', fundedTHB: 8_000, perVerifiedTHB: 80 }, 'Nok', T);
    const rows = sponsorshipsFor(db, org.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.fundedTHB, 8_000);
  });

  test('removing one takes it off the list and leaves the rest', () => {
    const org = uni();
    addSponsorship(db, { orgId: org.id, questId: 'q1', fundedTHB: 1_000, perVerifiedTHB: 10 }, null, T);
    addSponsorship(db, { orgId: org.id, questId: 'q2', fundedTHB: 2_000, perVerifiedTHB: 20 }, null, T);
    assert.equal(removeSponsorship(db, org.id, 'q1'), true);
    assert.deepEqual(sponsorshipsFor(db, org.id).map((s) => s.questId), ['q2']);
    assert.equal(removeSponsorship(db, org.id, 'q1'), false, 'removing twice should not claim a second removal');
  });

  test('one organisation never sees another’s funding', () => {
    const a = uni();
    const b = addOrganisation(db, { name: 'Acme', kind: 'company' }, null, T);
    addSponsorship(db, { orgId: a.id, questId: 'q1', fundedTHB: 1_000, perVerifiedTHB: 10 }, null, T);
    assert.equal(sponsorshipsFor(db, a.id).length, 1);
    assert.deepEqual(sponsorshipsFor(db, b.id), []);
  });
});

/**
 * Agreed and received are two facts, and only one of them is money.
 *
 * `funded_thb` is a figure a moderator types; `basis` already separates
 * somebody's entry from a signed contract. Neither means PAID — and
 * `sponsorOutcome` was reporting the remainder as "still held", which is a
 * claim about cash nothing in this system had ever recorded arriving.
 *
 * So the two live in different columns and are written by different calls, on
 * purpose: agreeing an amount and receiving it are different acts, usually
 * days apart and often by different people.
 */
describe('a pledge and a payment are written separately', () => {
  const fundQ1 = (thb = 10_000) => {
    const org = uni();
    addSponsorship(db, { orgId: org.id, questId: 'q1', fundedTHB: thb, perVerifiedTHB: 200 }, 'Nok', T);
    return org;
  };
  const line = (orgId: string, questId = 'q1') =>
    sponsorshipsFor(db, orgId).find((s) => s.questId === questId)!;

  test('a new line has been agreed and not paid', () => {
    const org = fundQ1();
    assert.equal(line(org.id).fundedTHB, 10_000);
    assert.equal(line(org.id).receivedTHB, 0);
    assert.equal(line(org.id).receivedAt, null);
  });

  test('a payment is recorded with the day it landed', () => {
    const org = fundQ1();
    const paid = new Date('2026-09-26T03:00:00.000Z');
    recordPayment(db, { orgId: org.id, questId: 'q1', receivedTHB: 4_000 }, paid);
    assert.equal(line(org.id).receivedTHB, 4_000);
    assert.equal(line(org.id).receivedAt, paid.toISOString());
  });

  test('a second instalment replaces the balance rather than adding to itself', () => {
    // Cumulative by design: every call says what the balance IS. A caller
    // maintaining a running total is a caller who will double it one day.
    const org = fundQ1();
    recordPayment(db, { orgId: org.id, questId: 'q1', receivedTHB: 4_000 }, T);
    recordPayment(db, { orgId: org.id, questId: 'q1', receivedTHB: 10_000 }, T);
    assert.equal(line(org.id).receivedTHB, 10_000);
  });

  test('EDITING THE AGREEMENT DOES NOT FORGET THE TRANSFER', () => {
    // The one that would have been lost quietly. `addSponsorship` upserts, and
    // a correction to the funded figure - a typo, a renegotiation - must not
    // take a payment that already landed with it.
    const org = fundQ1();
    recordPayment(db, { orgId: org.id, questId: 'q1', receivedTHB: 10_000 }, T);

    addSponsorship(
      db,
      { orgId: org.id, questId: 'q1', fundedTHB: 12_000, perVerifiedTHB: 200, basis: 'signed' },
      'Nok', T,
    );
    assert.equal(line(org.id).fundedTHB, 12_000);
    assert.equal(line(org.id).receivedTHB, 10_000, 'the payment was wiped by an edit');
  });

  test('what addSponsorship returns carries the payment it did not touch', () => {
    // It used to assemble its return value from its own arguments, which knew
    // nothing about `received_thb`. A caller believing that zero would be
    // reading a balance the database does not hold.
    const org = fundQ1();
    recordPayment(db, { orgId: org.id, questId: 'q1', receivedTHB: 10_000 }, T);
    const again = addSponsorship(
      db, { orgId: org.id, questId: 'q1', fundedTHB: 10_000, perVerifiedTHB: 200 }, 'Nok', T,
    );
    assert.equal(again.receivedTHB, 10_000);
  });

  test('a refund to zero clears the date with it', () => {
    const org = fundQ1();
    recordPayment(db, { orgId: org.id, questId: 'q1', receivedTHB: 10_000 }, T);
    recordPayment(db, { orgId: org.id, questId: 'q1', receivedTHB: 0 }, T);
    assert.equal(line(org.id).receivedTHB, 0);
    assert.equal(line(org.id).receivedAt, null, 'a date stayed behind on a balance of nothing');
  });

  test('money that is not a number of baht is refused', () => {
    const org = fundQ1();
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(
        () => recordPayment(db, { orgId: org.id, questId: 'q1', receivedTHB: bad }, T),
        InvalidFunding,
      );
    }
  });

  test('a payment against a line that does not exist is refused, not created', () => {
    const org = uni();
    assert.throws(
      () => recordPayment(db, { orgId: org.id, questId: 'q1', receivedTHB: 100 }, T),
      InvalidFunding,
    );
  });

  test('more arriving than was agreed is kept, not capped', () => {
    // A sponsor who sends more than agreed has sent it. Capping would hide
    // their money rather than the mistake; the report shows nothing owed.
    const org = fundQ1();
    recordPayment(db, { orgId: org.id, questId: 'q1', receivedTHB: 12_000 }, T);
    assert.equal(line(org.id).receivedTHB, 12_000);
  });

  test('a database written before the split reads as agreed, nothing received', () => {
    // The migration's default, checked rather than assumed: every row that
    // existed before today is a pledge whose payment nobody recorded, and
    // that is the safe direction to be wrong in.
    const org = fundQ1();
    db.prepare('UPDATE org_sponsorships SET received_thb = 0, received_at = NULL').run();
    assert.equal(line(org.id).receivedTHB, 0);
    assert.equal(line(org.id).receivedAt, null);
  });
});
