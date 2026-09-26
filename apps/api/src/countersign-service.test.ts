import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { signatureStanding } from '@chivago/core';
import { openTestDb, type DB } from './db.ts';
import {
  InvalidCountersignature, countersignaturesFor, recordCountersignature, withdrawCountersignature,
} from './countersign-service.ts';
import { issueStatement } from './statement-service.ts';

/**
 * An assurer's conclusion, carried without being made.
 *
 * The schema holds two of the four refusals: the digest binding, and that a
 * conclusion is appended rather than edited. These are about those two.
 */

let db: DB;
const PERIOD = { from: '2026-01-01', to: '2026-12-31' };
const AT = new Date('2026-07-01T00:00:00.000Z');

const sign = (statementId: string, over: Record<string, string> = {}) => recordCountersignature(db, {
  statementId,
  signerName: 'Somsak Wattana',
  signerFirm: 'Andaman Assurance',
  standard: 'isae3000_limited',
  opinion: 'unmodified',
  recordedBy: 'Nok',
  ...over,
}, AT);

const issued = () => {
  db.prepare("INSERT INTO hosts (id, name, type) VALUES ('h1','Samui Municipality','municipality')").run();
  return issueStatement(db, 'h1', PERIOD, 'Nok', AT);
};

beforeEach(() => { db = openTestDb(); });

describe('a conclusion is bound to the bytes it was given', () => {
  test('THE DIGEST IS READ OFF THE STATEMENT, NEVER TAKEN FROM THE CALLER', () => {
    // A digest somebody types is a digest somebody could mistype into
    // matching, which is the one way this binding could be defeated.
    const s = issued();
    const sig = sign(s.id, { digest: 'whatever-i-like' } as Record<string, string>);
    assert.equal(sig.digest, s.digest);
    assert.equal(signatureStanding(sig, s.digest), 'applies');
  });

  test('it does not apply to a record with a different digest', () => {
    const s = issued();
    assert.equal(signatureStanding(sign(s.id), 'some-other-digest'), 'digest_mismatch');
  });

  test('a conclusion on a statement that does not exist is refused', () => {
    assert.throws(() => sign('CG-2026-NOPE00'), InvalidCountersignature);
  });
});

describe('a conclusion is appended, never edited', () => {
  test('THE ROW REFUSES TO BE CHANGED INTO A DIFFERENT CONCLUSION', () => {
    const s = issued();
    const sig = sign(s.id, { opinion: 'adverse' });
    assert.throws(
      () => db.prepare("UPDATE statement_countersignatures SET opinion = 'unmodified' WHERE id = ?")
        .run(sig.id),
      /append-only/,
    );
    assert.throws(
      () => db.prepare("UPDATE statement_countersignatures SET signer_firm = 'Someone Else' WHERE id = ?")
        .run(sig.id),
      /append-only/,
    );
  });

  test('withdrawing is not deleting', () => {
    const s = issued();
    const sig = sign(s.id);
    const after = withdrawCountersignature(db, sig.id, 'scope changed', new Date('2026-10-01T00:00:00.000Z'));

    assert.equal(after.withdrawnAt, '2026-10-01T00:00:00.000Z');
    assert.equal(after.withdrawnReason, 'scope changed');
    assert.equal(countersignaturesFor(db, s.id).length, 1, 'the row was removed');
    assert.equal(signatureStanding(after, s.digest), 'withdrawn');
    // The conclusion itself is untouched: it WAS given, and that stays true.
    assert.equal(after.opinion, 'unmodified');
  });

  test('withdrawing twice keeps the FIRST date', () => {
    // A later call must not rewrite the day on which the conclusion stopped
    // applying.
    const s = issued();
    const sig = sign(s.id);
    withdrawCountersignature(db, sig.id, 'first', new Date('2026-10-01T00:00:00.000Z'));
    const again = withdrawCountersignature(db, sig.id, 'second', new Date('2026-11-01T00:00:00.000Z'));
    assert.equal(again.withdrawnAt, '2026-10-01T00:00:00.000Z');
    assert.equal(again.withdrawnReason, 'first');
  });

  test('a second conclusion sits beside the first rather than replacing it', () => {
    const s = issued();
    sign(s.id, { opinion: 'modified' });
    sign(s.id, { opinion: 'unmodified', signerFirm: 'Other Firm' });
    const all = countersignaturesFor(db, s.id);
    assert.equal(all.length, 2);
    assert.deepEqual(all.map((c) => c.opinion).sort(), ['modified', 'unmodified']);
  });
});

describe('what it refuses to record', () => {
  test('a conclusion with nobody’s name on it', () => {
    // A conclusion nobody can be asked about is not worth carrying.
    const s = issued();
    assert.throws(() => sign(s.id, { signerName: '   ' }), InvalidCountersignature);
    assert.throws(() => sign(s.id, { signerFirm: '' }), InvalidCountersignature);
  });

  test('a standard or a conclusion outside the vocabulary', () => {
    const s = issued();
    assert.throws(() => sign(s.id, { standard: 'iso14064' }), InvalidCountersignature);
    assert.throws(() => sign(s.id, { opinion: 'clean' }), InvalidCountersignature);
  });

  test('the channel says how it arrived, and there is only one route today', () => {
    const s = issued();
    assert.equal(sign(s.id).channel, 'entered_by_staff');
    assert.throws(
      () => db.prepare(
        `INSERT INTO statement_countersignatures
           (id, statement_id, digest, signer_name, signer_firm, standard, opinion, channel, recorded_at)
         VALUES ('x',?,?,'A','B','other','unmodified','signed_in_person',?)`,
      ).run(s.id, s.digest, AT.toISOString()),
      /CHECK/,
    );
  });

  test('the statement is not changed by any of this', () => {
    // The figures, the digest and the page are exactly what they were. A
    // signature is an attached fact, not a correction.
    const s = issued();
    sign(s.id, { opinion: 'adverse' });
    const after = db.prepare('SELECT digest, body FROM statements WHERE id = ?').get(s.id) as
      unknown as { digest: string; body: string };
    assert.equal(after.digest, s.digest);
    assert.equal(JSON.parse(after.body).verified, s.verified);
  });
});
