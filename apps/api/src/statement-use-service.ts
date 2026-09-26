/**
 * Recording that an organisation says it used a statement in a disclosure.
 *
 * See `packages/core/src/statement-use.ts` for what this refuses and why it is
 * not called retirement. The rules that live HERE and nowhere else are the
 * ones only the database can hold:
 *
 *   THE DIGEST IS READ OFF THE STATEMENT. Never accepted from a form, for the
 *   same reason as a countersignature: a digest somebody types is a digest
 *   somebody can mistype into matching.
 *
 *   THE ORGANISATION MUST EXIST. A declaration by a name nobody can look up
 *   is a declaration nobody can ask about, and a contested statement is only
 *   useful if the reader can go and find both declarers.
 *
 *   THE SAME REPORT DECLARED TWICE IS ONE DECLARATION. A second attempt at a
 *   report that already has a STANDING declaration returns the one that is
 *   there: it is the same fact arriving again, not a second use. A report
 *   whose declaration was WITHDRAWN can be declared afresh, and that is a new
 *   row - the withdrawal must not swallow a report that was later really
 *   filed. The partial unique index in `migrations.ts` enforces exactly that
 *   boundary rather than leaving it to this file.
 */

import { randomUUID } from 'node:crypto';
import { isDisclosureKind, type DisclosureKind, type StatementUse } from '@chivago/core';
import { row, rows, type DB } from './db.ts';
import { readStatement } from './statement-service.ts';

export class InvalidStatementUse extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStatementUse';
  }
}

interface Row {
  id: string; statement_id: string; digest: string;
  org_id: string; name_en: string; name_th: string;
  kind: string; reporting_year: number; place_note: string | null;
  declared_at: string; declared_by: string | null;
  withdrawn_at: string | null; withdrawn_reason: string | null;
}

const fromRow = (r: Row): StatementUse => ({
  id: r.id,
  statementId: r.statement_id,
  digest: r.digest,
  orgId: r.org_id,
  orgName: { en: r.name_en, th: r.name_th },
  kind: r.kind as DisclosureKind,
  reportingYear: r.reporting_year,
  placeNote: r.place_note,
  declaredAt: r.declared_at,
  declaredBy: r.declared_by,
  withdrawnAt: r.withdrawn_at,
  withdrawnReason: r.withdrawn_reason,
});

// The organisation's name is joined rather than copied into the row, so a
// company that renames itself is not two companies on the same page.
const SELECT = `
  SELECT u.*, o.name_en, o.name_th
    FROM statement_uses u JOIN organisations o ON o.id = u.org_id`;

/** Every declaration against this statement, oldest first. */
export function usesOf(db: DB, statementId: string): StatementUse[] {
  return rows<Row>(
    db.prepare(`${SELECT} WHERE u.statement_id = ? ORDER BY u.declared_at, u.id`)
      .all(statementId),
  ).map(fromRow);
}

/** Every statement this organisation has declared, newest first. */
export function usesBy(db: DB, orgId: string): StatementUse[] {
  return rows<Row>(
    db.prepare(`${SELECT} WHERE u.org_id = ? ORDER BY u.declared_at DESC, u.id`)
      .all(orgId),
  ).map(fromRow);
}

/** The STANDING declaration for one report, if there is one. */
const standing = (db: DB, statementId: string, orgId: string, kind: string, year: number) =>
  row<Row>(
    db.prepare(
      `${SELECT} WHERE u.statement_id = ? AND u.org_id = ? AND u.kind = ? AND u.reporting_year = ?
         AND u.withdrawn_at IS NULL`,
    ).get(statementId, orgId, kind, year),
  );

export function declareUse(
  db: DB,
  args: {
    statementId: string;
    orgId: string;
    kind: string;
    reportingYear: number;
    placeNote?: string | null;
    declaredBy: string | null;
  },
  now = new Date(),
): StatementUse {
  const statement = readStatement(db, args.statementId);
  if (!statement) throw new InvalidStatementUse(`No statement has the id ${args.statementId}.`);

  const org = row<{ id: string }>(
    db.prepare('SELECT id FROM organisations WHERE id = ?').get(args.orgId),
  );
  if (!org) throw new InvalidStatementUse(`No organisation has the id ${args.orgId}.`);

  if (!isDisclosureKind(args.kind)) {
    throw new InvalidStatementUse(`${args.kind} is not a disclosure this records.`);
  }
  // A reporting year is a year. Anything outside this is a typed mistake, and
  // a wrong year on a declaration points a reader at the wrong report.
  if (!Number.isInteger(args.reportingYear)
    || args.reportingYear < 2000 || args.reportingYear > 2200) {
    throw new InvalidStatementUse(`${args.reportingYear} is not a reporting year.`);
  }

  const already = standing(db, statement.id, args.orgId, args.kind, args.reportingYear);
  if (already) return fromRow(already);

  db.prepare(
    `INSERT INTO statement_uses
       (id, statement_id, digest, org_id, kind, reporting_year, place_note, declared_at, declared_by)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    // The digest comes off the statement, never from the caller.
  ).run(randomUUID(), statement.id, statement.digest, args.orgId, args.kind,
        args.reportingYear, (args.placeNote ?? '').trim() || null,
        now.toISOString(), args.declaredBy);

  return fromRow(standing(db, statement.id, args.orgId, args.kind, args.reportingYear)!);
}

/**
 * Take a declaration back.
 *
 * Idempotent, and the FIRST withdrawal is the one that stands: a later call
 * must not rewrite the date on which the declaration stopped applying.
 */
export function withdrawUse(
  db: DB, id: string, reason: string, now = new Date(),
): StatementUse {
  const current = row<Row>(db.prepare(`${SELECT} WHERE u.id = ?`).get(id));
  if (!current) throw new InvalidStatementUse(`No declaration has the id ${id}.`);
  if (current.withdrawn_at === null) {
    db.prepare(
      'UPDATE statement_uses SET withdrawn_at = ?, withdrawn_reason = ? WHERE id = ?',
    ).run(now.toISOString(), reason.trim() || null, id);
  }
  return fromRow(row<Row>(db.prepare(`${SELECT} WHERE u.id = ?`).get(id))!);
}
