/**
 * The rule that decides whether a snapshot of a live database is complete.
 *
 * Every case here is a thing that really happens to the pilot while it is
 * being read: a story expiring on the alarm, a traveller opening the app, a
 * page read twice after a retry. The rule has to call exactly one of them a
 * failure, and these tests are where that is pinned down.
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { checkCount, checkCounts, failures } from './snapshot-check.ts';

describe('a database that held still', () => {
  test('the same count all round is ok', () => {
    const v = checkCount({ table: 'users', inSnapshot: 339, before: 339, after: 339 });
    assert.equal(v.verdict, 'ok');
    assert.match(v.reason, /339 row\(s\), matching the live count/);
  });

  test('a missing row is a failure, and the message says not to rely on it', () => {
    // The failure a rowid cursor exists to prevent: a page boundary that
    // skipped somebody, while every constraint still passes.
    const v = checkCount({ table: 'users', inSnapshot: 338, before: 339, after: 339 });
    assert.equal(v.verdict, 'rows-missing');
    assert.match(v.reason, /do not rely on this snapshot/);
    assert.match(v.reason, /338/);
    assert.match(v.reason, /339/, 'both numbers, so the gap is visible');
  });
});

describe('a database that moved while it was read', () => {
  test('rows ARRIVING during the read is not a failure', () => {
    /*
      Two travellers opened the app mid-export. Their rows are above the
      cursor, so they may or may not be in the file - both are honest for a
      snapshot taken over a few seconds.
    */
    for (const inSnapshot of [339, 340, 341]) {
      const v = checkCount({ table: 'users', inSnapshot, before: 339, after: 341 });
      assert.equal(v.verdict, 'ok', `${inSnapshot} should be acceptable`);
    }
  });

  test('rows LEAVING during the read is not a failure either', () => {
    // The story sweep runs every thirty seconds and deletes what expired.
    for (const inSnapshot of [12, 15]) {
      const v = checkCount({ table: 'stories', inSnapshot, before: 15, after: 12 });
      assert.equal(v.verdict, 'ok', `${inSnapshot} should be acceptable`);
    }
    assert.match(
      checkCount({ table: 'stories', inSnapshot: 13, before: 15, after: 12 }).reason,
      /moved while it was read/,
      'and it says so rather than claiming a match',
    );
  });

  test('but fewer than the LOWER of the two is still missing rows', () => {
    // A sweep taking three stories cannot explain a file that is four short.
    const v = checkCount({ table: 'stories', inSnapshot: 11, before: 15, after: 12 });
    assert.equal(v.verdict, 'rows-missing');
    assert.match(v.reason, /at least 12/);
  });

  test('more rows than ever existed means a page came twice', () => {
    // What a retried request that already succeeded would look like.
    const v = checkCount({ table: 'ledger', inSnapshot: 902, before: 900, after: 901 });
    assert.equal(v.verdict, 'rows-repeated');
    assert.match(v.reason, /read twice/);
  });
});

describe('an empty table', () => {
  test('nothing in, nothing out, no complaint', () => {
    assert.equal(checkCount({ table: 'proofs', inSnapshot: 0, before: 0, after: 0 }).verdict, 'ok');
  });

  test('a table that had rows and a file with none is a failure', () => {
    // The shape of "the loop never ran for this table".
    assert.equal(
      checkCount({ table: 'proofs', inSnapshot: 0, before: 4, after: 4 }).verdict,
      'rows-missing',
    );
  });
});

describe('the whole snapshot', () => {
  test('failures are what is left after the tables that are fine', () => {
    const verdicts = checkCounts([
      { table: 'users', inSnapshot: 339, before: 339, after: 339 },
      { table: 'wallets', inSnapshot: 338, before: 339, after: 339 },
      { table: 'stories', inSnapshot: 13, before: 15, after: 12 },
    ]);
    assert.equal(verdicts.length, 3);
    const bad = failures(verdicts);
    assert.equal(bad.length, 1);
    assert.equal(bad[0]?.table, 'wallets');
  });

  test('a snapshot with nothing wrong has no failures', () => {
    assert.deepEqual(
      failures(checkCounts([{ table: 'users', inSnapshot: 1, before: 1, after: 1 }])),
      [],
    );
  });

  test('what the live system says LATER never decides the verdict', () => {
    /*
      Deliberate. A backup checked an hour after it was taken is compared with
      a database that has moved on; failing on that would make the check
      useless exactly when somebody is using it in a hurry. `liveNow` is
      printed, not judged.
    */
    const v = checkCount({
      table: 'users', inSnapshot: 339, before: 339, after: 339, liveNow: 402,
    });
    assert.equal(v.verdict, 'ok');
  });
});
