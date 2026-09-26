import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { declaringOrgs, standingUses, useStanding } from '@chivago/core';
import { openTestDb, type DB } from './db.ts';
import {
  InvalidStatementUse, declareUse, usesBy, usesOf, withdrawUse,
} from './statement-use-service.ts';
import { issueStatement } from './statement-service.ts';

/**
 * A declaration that a statement was used in somebody's report.
 *
 * The schema holds three things this file is about: the digest binding, that a
 * declaration is appended rather than edited, and the partial unique index
 * that makes one report one declaration WITHOUT letting a withdrawal swallow a
 * report that was later really filed.
 */

let db: DB;
const PERIOD = { from: '2026-01-01', to: '2026-12-31' };
const AT = new Date('2026-07-01T00:00:00.000Z');
const LATER = new Date('2026-11-01T00:00:00.000Z');

const org = (id: string, en: string, th: string) => {
  db.prepare(
    "INSERT INTO organisations (id, name_en, name_th, kind, created_at) VALUES (?,?,?,'company',?)",
  ).run(id, en, th, AT.toISOString());
  return id;
};

const issued = () => {
  db.prepare("INSERT INTO hosts (id, name, type) VALUES ('h1','Samui Municipality','municipality')").run();
  return issueStatement(db, 'h1', PERIOD, 'Nok', AT);
};

const declare = (statementId: string, over: Record<string, unknown> = {}) => declareUse(db, {
  statementId,
  orgId: 'org-siam',
  kind: 'one_report',
  reportingYear: 2026,
  declaredBy: 'Nok',
  ...over,
} as Parameters<typeof declareUse>[1], AT);

beforeEach(() => {
  db = openTestDb();
  org('org-siam', 'Siam Retail', 'สยามรีเทล');
});

describe('a declaration is bound to the bytes it was about', () => {
  test('THE DIGEST IS READ OFF THE STATEMENT, NEVER TAKEN FROM THE CALLER', () => {
    const s = issued();
    const u = declare(s.id, { digest: 'whatever-i-like' });
    assert.equal(u.digest, s.digest);
    assert.equal(useStanding(u, s.digest), 'applies');
  });

  test('it is not about a record with a different digest', () => {
    const s = issued();
    assert.equal(useStanding(declare(s.id), 'other-digest'), 'digest_mismatch');
  });

  test('a declaration against a statement that does not exist is refused', () => {
    assert.throws(() => declare('CG-2026-NOPE00'), InvalidStatementUse);
  });

  test('A DECLARATION BY AN ORGANISATION NOBODY CAN LOOK UP IS REFUSED', () => {
    // A contested statement is only useful if the reader can go and find
    // both declarers.
    const s = issued();
    assert.throws(() => declare(s.id, { orgId: 'org-ghost' }), InvalidStatementUse);
  });
});

describe('what the record refuses to hold', () => {
  test('a disclosure kind it does not know', () => {
    const s = issued();
    assert.throws(() => declare(s.id, { kind: 'carbon_credit' }), InvalidStatementUse);
  });

  test('a reporting year that is not a year', () => {
    const s = issued();
    for (const y of [0, 1999, 2201, 20260, 2026.5]) {
      assert.throws(() => declare(s.id, { reportingYear: y }), InvalidStatementUse, `${y}`);
    }
  });

  test('an empty place note is stored as absent, not as an empty string', () => {
    const s = issued();
    assert.equal(declare(s.id, { placeNote: '   ' }).placeNote, null);
  });
});

describe('one report is one declaration', () => {
  test('DECLARING THE SAME REPORT TWICE DOES NOT MAKE IT TWO USES', () => {
    const s = issued();
    const first = declare(s.id);
    const again = declare(s.id, { placeNote: 'section 4.2' });
    assert.equal(again.id, first.id);
    assert.equal(usesOf(db, s.id).length, 1);
    // And the second attempt did not overwrite the first, either.
    assert.equal(again.placeNote, null);
  });

  test('a different kind or year is a different report', () => {
    const s = issued();
    declare(s.id);
    declare(s.id, { kind: 'sustainability_report' });
    declare(s.id, { reportingYear: 2027 });
    assert.equal(usesOf(db, s.id).length, 3);
    // Still one organisation: it is reporting its own activity, not contesting.
    assert.deepEqual(declaringOrgs(usesOf(db, s.id), s.digest), ['org-siam']);
  });

  test('A WITHDRAWAL DOES NOT SWALLOW A REPORT THAT WAS LATER REALLY FILED', () => {
    // The failure this guards: declare, withdraw because the report was never
    // filed, then actually file it. Without the WHERE clause on the index the
    // withdrawn row would be returned and the real use would vanish.
    const s = issued();
    const first = declare(s.id);
    withdrawUse(db, first.id, 'report was not filed', LATER);

    const second = declareUse(db, {
      statementId: s.id, orgId: 'org-siam', kind: 'one_report',
      reportingYear: 2026, declaredBy: 'Nok',
    }, LATER);

    assert.notEqual(second.id, first.id);
    assert.equal(second.withdrawnAt, null);
    // Both rows survive: one withdrawn, one standing.
    assert.equal(usesOf(db, s.id).length, 2);
    assert.deepEqual(standingUses(usesOf(db, s.id), s.digest).map((u) => u.id), [second.id]);
  });

  test('two standing declarations of the same report cannot be forced in', () => {
    const s = issued();
    declare(s.id);
    assert.throws(
      () => db.prepare(
        `INSERT INTO statement_uses
           (id, statement_id, digest, org_id, kind, reporting_year, declared_at)
         VALUES ('forced',?,?,'org-siam','one_report',2026,?)`,
      ).run(s.id, s.digest, AT.toISOString()),
      /UNIQUE/,
    );
  });
});

describe('a declaration is appended, never edited', () => {
  test('THE ROW REFUSES TO BE CHANGED INTO A DIFFERENT DECLARATION', () => {
    const s = issued();
    const u = declare(s.id);
    assert.throws(
      () => db.prepare("UPDATE statement_uses SET org_id = 'org-other' WHERE id = ?").run(u.id),
      /append-only/,
    );
    assert.throws(
      () => db.prepare('UPDATE statement_uses SET reporting_year = 2025 WHERE id = ?').run(u.id),
      /append-only/,
    );
    assert.throws(
      () => db.prepare("UPDATE statement_uses SET digest = 'other' WHERE id = ?").run(u.id),
      /append-only/,
    );
  });

  test('withdrawing is not deleting', () => {
    const s = issued();
    const u = declare(s.id);
    const gone = withdrawUse(db, u.id, 'section was cut', LATER);
    assert.equal(gone.withdrawnAt, LATER.toISOString());
    assert.equal(gone.withdrawnReason, 'section was cut');
    assert.equal(usesOf(db, s.id).length, 1);
    assert.equal(useStanding(gone, s.digest), 'withdrawn');
  });

  test('THE FIRST WITHDRAWAL IS THE ONE THAT STANDS', () => {
    // A second withdrawal must not rewrite the date on which the declaration
    // stopped applying.
    const s = issued();
    const u = declare(s.id);
    withdrawUse(db, u.id, 'section was cut', LATER);
    const twice = withdrawUse(db, u.id, 'changed my mind again', new Date('2027-01-01T00:00:00.000Z'));
    assert.equal(twice.withdrawnAt, LATER.toISOString());
    assert.equal(twice.withdrawnReason, 'section was cut');
  });

  test('withdrawing something that was never declared is refused', () => {
    assert.throws(() => withdrawUse(db, 'no-such-id', 'x', LATER), InvalidStatementUse);
  });
});

describe('two organisations on one record', () => {
  test('BOTH ARE SHOWN, AND THE COUNT IS BY ORGANISATION', () => {
    const s = issued();
    org('org-ptt', 'PTT Green', 'ปตท. กรีน');
    declare(s.id);
    declare(s.id, { orgId: 'org-ptt' });
    assert.equal(usesOf(db, s.id).length, 2);
    assert.deepEqual(declaringOrgs(usesOf(db, s.id), s.digest).sort(), ['org-ptt', 'org-siam']);
  });

  test('a withdrawal drops the organisation out of the count but not the record', () => {
    const s = issued();
    org('org-ptt', 'PTT Green', 'ปตท. กรีน');
    declare(s.id);
    const theirs = declare(s.id, { orgId: 'org-ptt' });
    withdrawUse(db, theirs.id, 'not ours after all', LATER);
    assert.deepEqual(declaringOrgs(usesOf(db, s.id), s.digest), ['org-siam']);
    assert.equal(usesOf(db, s.id).length, 2);
  });
});

describe('reading from the organisation’s side', () => {
  test('every statement one organisation has declared', () => {
    const s = issued();
    declare(s.id);
    declare(s.id, { kind: 'ifrs_s' });
    assert.equal(usesBy(db, 'org-siam').length, 2);
    assert.equal(usesBy(db, 'org-ptt').length, 0);
  });

  test('THE NAME IS JOINED, NOT COPIED, SO A RENAME IS NOT TWO COMPANIES', () => {
    const s = issued();
    declare(s.id);
    db.prepare("UPDATE organisations SET name_en = 'Siam Retail PCL' WHERE id = 'org-siam'").run();
    assert.equal(usesOf(db, s.id)[0]!.orgName.en, 'Siam Retail PCL');
    assert.equal(usesOf(db, s.id)[0]!.orgName.th, 'สยามรีเทล');
  });
});
