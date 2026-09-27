import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, rows, type DB } from './db.ts';
import { notReversed, REVERSAL_PREFIX, awardStands } from './ledger-sql.ts';
import {
  applyMovement, awardQuestReward, ensureWallet, reverseMovement,
} from './wallet-service.ts';

/**
 * The one definition, held to what actually happens.
 *
 * Seven reads across six files ask whether a ledger row was taken back, and
 * after #51 they all ask it with this fragment. That is worth doing only if
 * something binds the fragment to `reverseMovement` — otherwise the six copies
 * become one copy that is wrong in one place instead of six, which is not an
 * improvement, only a tidier failure.
 *
 * So nothing here writes a `reversal:` row by hand. Every test awards with the
 * real award and unwinds with the real reversal, and the fragment has to find
 * it. On the day `reverseMovement` changes how it writes, this file fails
 * before any bar, badge, ranking or sponsor report does.
 */

let db: DB;
const NOW = '2026-09-25T00:00:00.000Z';

beforeEach(() => {
  db = openTestDb();
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)').run('ana', 'Ana', NOW);
  ensureWallet(db, 'ana');
});

/** Rows the fragment lets through, for an arbitrary alias. */
const surviving = (alias = 'l'): string[] =>
  rows<{ source_ref: string }>(
    db.prepare(
      `SELECT ${alias}.source_ref FROM ledger ${alias}
        WHERE ${notReversed(alias)} ORDER BY ${alias}.source_ref`,
    ).all(),
  ).map((r) => r.source_ref);

const award = (questId: string) => awardQuestReward(db, {
  userId: 'ana', questId, questName: questId, host: 'Host', points: 100, currency: 'green',
});

describe('the fragment knows what a reversal really looks like', () => {
  test('a row unwound by reverseMovement stops surviving', () => {
    award('q1');
    assert.deepEqual(surviving(), ['quest:q1:user:ana']);

    reverseMovement(db, {
      userId: 'ana', originalSourceRef: 'quest:q1:user:ana', reason: 'proof was not what it claimed',
    });
    // The reversal row itself survives - nothing reversed IT - and that is
    // correct: every read that uses this fragment also filters by `kind`, and
    // a reversal is an 'adjustment'.
    assert.deepEqual(surviving(), [`${REVERSAL_PREFIX}quest:q1:user:ana`]);
  });

  test('reversing one award leaves the others alone', () => {
    award('q1');
    award('q2');
    reverseMovement(db, {
      userId: 'ana', originalSourceRef: 'quest:q1:user:ana', reason: 'x',
    });
    assert.ok(surviving().includes('quest:q2:user:ana'), 'an untouched award was dropped');
    assert.ok(!surviving().includes('quest:q1:user:ana'), 'the reversed award survived');
  });

  test('an opening balance is an adjustment and is not a reversal', () => {
    // THE OVER-FIX THIS GUARDS. `kind <> 'adjustment'` would look right on
    // every test above and would quietly stop counting the gift handed to a
    // new account, which is an adjustment too.
    applyMovement(db, {
      userId: 'ana', label: 'Welcome', host: 'ChivaGo', amount: 1240, currency: 'green',
      kind: 'adjustment', sourceRef: 'opening:green:user:ana',
    });
    assert.deepEqual(surviving(), ['opening:green:user:ana']);
  });

  test('the alias is the caller’s, because every call site names its row differently', () => {
    award('q1');
    reverseMovement(db, { userId: 'ana', originalSourceRef: 'quest:q1:user:ana', reason: 'x' });
    assert.deepEqual(surviving('led'), surviving('l'), 'the fragment only works under one alias');
  });

  test('a caller aliasing its row `r` is fine, because the subquery no longer does', () => {
    // This failed when the fragment was first extracted: the subquery named
    // its own row `r`, so a caller using `r` had the row compared to itself
    // and NOTHING was ever reversed. It failed open, which is the direction
    // nobody notices, and it was one letter away from shipping six times.
    award('q1');
    reverseMovement(db, { userId: 'ana', originalSourceRef: 'quest:q1:user:ana', reason: 'x' });
    assert.ok(
      !surviving('r').includes('quest:q1:user:ana'),
      'aliasing the outer row `r` made the check pass everything',
    );
  });

  test('an alias that would collide is refused rather than allowed to fail open', () => {
    assert.throws(() => notReversed('reversal_row'), /collides/);
    assert.throws(() => notReversed('REVERSAL_ROW'), /collides/);
  });

  test('an alias that is not an identifier never reaches SQLite', () => {
    // The alias is interpolated into SQL. Every call site passes a literal
    // written in the source and none of them can be reached from a request -
    // but the fragment is now shared by seven reads, and the cost of being
    // sure is one regex.
    for (const bad of ['l; DROP TABLE ledger', "l'", 'l l', '']) {
      assert.throws(() => notReversed(bad), /not a plain SQL alias/);
    }
  });
});

/**
 * The second fragment, and the same fail-open hazard.
 *
 * `notReversed` was found to pass everything when a caller shadowed its inner
 * alias. `awardStands` names TWO rows of its own, so it has two ways to be
 * shadowed and both are refused here.
 */
describe('awardStands', () => {
  test('it judges the progress row against the award that paid for it', () => {
    const sql = awardStands('qp');
    assert.match(sql, /qp\.user_id/);
    assert.match(sql, /'quest:' \|\| qp\.quest_id \|\| ':user:' \|\| qp\.user_id/);
    assert.match(sql, /kind = 'quest_reward'/);
  });

  test('IT REFUSES AN ALIAS THAT WOULD SHADOW EITHER ROW IT NAMES', () => {
    // Shadowing makes the row compare to itself, nothing looks reversed, and
    // the check fails open — billing a sponsor for work somebody took back,
    // which is the direction nobody notices.
    assert.throws(() => awardStands('award_row'), /collides/);
    assert.throws(() => awardStands('reversal_row'), /collides/);
    assert.throws(() => awardStands('AWARD_ROW'), /collides/);
  });

  test('it refuses anything that is not a plain identifier', () => {
    for (const bad of ['qp; DROP TABLE ledger', 'qp.user', '', '1qp', 'qp-1']) {
      assert.throws(() => awardStands(bad), /not a plain SQL alias/, bad);
    }
  });

  test('it carries the reversal check rather than a copy of it', () => {
    // If the two ever drift, the day `reverseMovement` changes how it writes
    // is the day one of them silently stops working.
    assert.ok(awardStands('qp').includes(notReversed('award_row')));
  });
});
