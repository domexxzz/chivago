import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import {
  InvalidFunding, UnknownOrganisation, addOrganisation, addSponsorship, basisFor,
  listOrganisations, organisationById, removeSponsorship, sponsorshipsFor,
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
