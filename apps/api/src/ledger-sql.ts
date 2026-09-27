/**
 * Fragments of SQL about the ledger that more than one service needs to agree
 * on.
 *
 * WHY THIS FILE EXISTS. `monster-service.ts` worked out, in #50, how to ask
 * whether a ledger row had since been taken back. The same question is asked
 * by standings, by parties, by invitations, by a sponsor's report and by the
 * creature that grows from a verified quest — six more reads, each of which
 * would otherwise carry its own copy of the answer.
 *
 * Six copies is not a tidiness problem. It is six places that must all be
 * found and changed on the day `reverseMovement` changes how it writes, and
 * the one that is missed goes on quietly crediting work somebody took back.
 * A test can hold one definition honest. It cannot hold six copies in step.
 */

/**
 * A deed that has been taken back is not a deed.
 *
 * `reverseMovement` in `wallet-service.ts` never edits or deletes the row it
 * unwinds: it inserts the opposite movement with `source_ref` set to
 * `reversal:` + the original's. So "was this reversed" is one lookup, and it
 * is an index SEEK rather than a scan because `source_ref` is UNIQUE — the
 * one property that makes this affordable to ask on every row of a sweep.
 *
 * A FUNCTION, NOT A CONSTANT, because the fragment has to name the row it is
 * judging and every caller aliases the ledger differently.
 *
 * IT REFUSES AN ALIAS IT CANNOT SURVIVE. The subquery needs an alias of its
 * own, and a caller using the same one shadows it: the row would be compared
 * to itself, nothing would ever look reversed, and the check would FAIL OPEN -
 * silently crediting work somebody took back, which is the exact direction
 * nobody notices. A test found this on the day the fragment was extracted, so
 * the inner name is distinctive and a collision throws rather than passing.
 *
 * The same guard covers the other hazard: the alias is interpolated into SQL,
 * so it must never come from request input. Every call site passes a literal
 * written in the source, and anything that is not a plain identifier is
 * refused here rather than reaching SQLite.
 *
 * WHY NOT `kind <> 'adjustment'`. Because a reversal is not the only
 * adjustment: the opening balance handed to a new account is one too
 * (`opening:…`), and excluding every adjustment would quietly stop counting
 * things nobody reversed. The question being asked is narrow on purpose -
 * "was THIS row taken back" - and it is answered by the row that took it back.
 */
/** The prefix `reverseMovement` writes. Exported so a test can bind the two. */
export const REVERSAL_PREFIX = 'reversal:';

const INNER = 'reversal_row';

export function notReversed(alias: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
    throw new Error(`notReversed: ${alias} is not a plain SQL alias`);
  }
  if (alias.toLowerCase() === INNER) {
    throw new Error(
      `notReversed: the alias ${alias} collides with this fragment's own row, `
      + 'which would make the check pass everything',
    );
  }
  return `NOT EXISTS (SELECT 1 FROM ledger ${INNER}`
    + ` WHERE ${INNER}.source_ref = '${REVERSAL_PREFIX}' || ${alias}.source_ref)`;
}


/**
 * An approval whose reward was taken back is not work that stands.
 *
 * WHY THIS IS A SECOND FRAGMENT AND NOT A SECOND COPY. `notReversed` judges a
 * LEDGER row. This judges a `quest_progress` row, which is a different table
 * with no `source_ref` of its own - the link between the two is the shape of
 * the reference `awardQuestReward` writes, and that shape was already spelled
 * out by hand in `kpi-service.ts` and again in `plan-lock-service.ts`. Two
 * copies of a join that only one function understands is how the third copy
 * gets written slightly wrong.
 *
 * WHAT IT MEANS, AND WHAT IT DELIBERATELY DOES NOT.
 *
 *   A HOST'S APPROVAL IS NOT DELETED AND IS NOT DOUBTED. `verified_at` stays
 *   exactly where it is. Somebody looked at the proof on that date and passed
 *   it, and that remains true whatever happens afterwards.
 *
 *   A REVERSAL IS A LATER, SEPARATE FACT: the platform decided the award does
 *   not stand. So this is not "was this really approved" - it is "is this
 *   work the platform still counts", and those are different questions that
 *   happen to be asked of the same row.
 *
 *   AN APPROVAL WITH NO AWARD ROW STILL COUNTS. There is nothing to reverse.
 *   A host approved it and no reward was ever issued, which is a quest
 *   configuration question and not a withdrawal.
 *
 * The alias is the `quest_progress` one, and it is checked the same way
 * `notReversed` checks its own, for the same two reasons: a shadowed alias
 * would fail open, and an alias is interpolated into SQL.
 */
const AWARD = 'award_row';

export function awardStands(progressAlias: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(progressAlias)) {
    throw new Error(`awardStands: ${progressAlias} is not a plain SQL alias`);
  }
  if (progressAlias.toLowerCase() === AWARD || progressAlias.toLowerCase() === INNER) {
    throw new Error(
      `awardStands: the alias ${progressAlias} collides with a row this fragment names, `
      + 'which would make the check pass everything',
    );
  }
  const p = progressAlias;
  return `NOT EXISTS (
    SELECT 1 FROM ledger ${AWARD}
     WHERE ${AWARD}.kind = 'quest_reward'
       AND ${AWARD}.user_id = ${p}.user_id
       AND ${AWARD}.source_ref = 'quest:' || ${p}.quest_id || ':user:' || ${p}.user_id
       AND NOT (${notReversed(AWARD)}))`;
}
