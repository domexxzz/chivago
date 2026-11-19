/**
 * Deleting an account: the PDPA right to erasure, behind DELETE /profile and
 * the "Delete account" button in the app.
 *
 * Almost everything a user owns goes by itself: tables point at users(id)
 * with ON DELETE CASCADE, so one `DELETE FROM users` takes them with it. Five
 * party tables do not, and foreign keys are enforced, so for anyone who had
 * done something in a party SOMEBODY ELSE created, that one statement threw
 * and the route answered 500. Measured 19 November 2026, while adding the
 * button; account-deletion.test.ts reproduces it.
 *
 * Changing those constraints means rebuilding live tables in the one
 * production database. Clearing the references here, in the same transaction
 * as the delete, fixes it without that. The test walks the schema, so a new
 * table that would block deletion fails CI until it is listed below or given
 * an ON DELETE.
 */

import { transact, type DB } from './db.ts';

export interface Reference { table: string; column: string }

/**
 * Rows that are the person's own and go with them: what they wrote in a
 * party chat, a meeting pin they dropped, their place on a quest roster.
 */
export const OWN_ROWS_REMOVED: readonly Reference[] = [
  { table: 'party_messages', column: 'user_id' },
  { table: 'party_meeting_points', column: 'set_by' },
  { table: 'party_quest_participants', column: 'user_id' },
];

/**
 * Rows that belong to the whole party and only NAME the person: a stop on the
 * shared plan, the quest everyone is doing. Deleting them would take the
 * other members' plan and quest with the account, so they are re-credited to
 * the party's creator instead, and the deleted name is no longer on them.
 *
 * When the person IS the creator, the party itself cascades away with them,
 * as it always has (parties.created_by is ON DELETE CASCADE).
 */
export const ATTRIBUTIONS_KEPT: readonly Reference[] = [
  { table: 'party_itinerary', column: 'added_by' },
  { table: 'party_quest_instances', column: 'selected_by' },
];

/**
 * Delete an account and everything that is only theirs. All or nothing: a
 * failure part-way rolls back, so an account is never left half-erased.
 *
 * @returns false when there was no such account.
 */
export function deleteAccount(db: DB, userId: string): boolean {
  return transact(db, () => {
    for (const { table, column } of OWN_ROWS_REMOVED) {
      db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(userId);
    }
    for (const { table, column } of ATTRIBUTIONS_KEPT) {
      db.prepare(
        `UPDATE ${table} SET ${column} = (SELECT created_by FROM parties WHERE parties.id = ${table}.party_id)
          WHERE ${column} = ?`,
      ).run(userId);
    }
    return db.prepare('DELETE FROM users WHERE id = ?').run(userId).changes > 0;
  });
}
