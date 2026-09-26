/**
 * Recording somebody else's conclusion about a statement we issued.
 *
 * See `packages/core/src/countersign.ts` for what this refuses. The rules
 * that live HERE and nowhere else are the two the database can hold:
 *
 *   A SIGNATURE IS BOUND TO THE DIGEST THE STATEMENT HAD. Read from the
 *   statement at the moment of recording, never accepted from a form. A
 *   digest somebody typed is a digest somebody could mistype into matching.
 *
 *   A CONCLUSION IS NOT EDITED. The trigger in `migrations.ts` refuses an
 *   UPDATE of every column except the withdrawal, so changing one's mind is
 *   an append and taking it back leaves the original standing.
 */

import { randomUUID } from 'node:crypto';
import {
  isAssuranceOpinion, isAssuranceStandard,
  type AssuranceOpinion, type AssuranceStandard, type Countersignature,
} from '@chivago/core';
import { row, rows, type DB } from './db.ts';
import { readStatement } from './statement-service.ts';

export class InvalidCountersignature extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCountersignature';
  }
}

interface Row {
  id: string; statement_id: string; digest: string; signer_name: string; signer_firm: string;
  standard: string; opinion: string; scope_note: string | null; channel: string;
  recorded_at: string; recorded_by: string | null;
  withdrawn_at: string | null; withdrawn_reason: string | null;
}

const fromRow = (r: Row): Countersignature => ({
  id: r.id,
  statementId: r.statement_id,
  digest: r.digest,
  signerName: r.signer_name,
  signerFirm: r.signer_firm,
  standard: r.standard as AssuranceStandard,
  opinion: r.opinion as AssuranceOpinion,
  scopeNote: r.scope_note,
  channel: 'entered_by_staff',
  recordedAt: r.recorded_at,
  recordedBy: r.recorded_by,
  withdrawnAt: r.withdrawn_at,
  withdrawnReason: r.withdrawn_reason,
});

/** Every conclusion recorded against this statement, oldest first. */
export function countersignaturesFor(db: DB, statementId: string): Countersignature[] {
  return rows<Row>(
    db.prepare(
      'SELECT * FROM statement_countersignatures WHERE statement_id = ? ORDER BY recorded_at, id',
    ).all(statementId),
  ).map(fromRow);
}

export function recordCountersignature(
  db: DB,
  args: {
    statementId: string;
    signerName: string;
    signerFirm: string;
    standard: string;
    opinion: string;
    scopeNote?: string | null;
    recordedBy: string | null;
  },
  now = new Date(),
): Countersignature {
  const statement = readStatement(db, args.statementId);
  if (!statement) throw new InvalidCountersignature(`No statement has the id ${args.statementId}.`);

  const name = args.signerName.trim();
  const firm = args.signerFirm.trim();
  // A conclusion with nobody's name on it cannot be asked about, which is the
  // only thing a conclusion is worth.
  if (name === '') throw new InvalidCountersignature('A conclusion needs the name of the person who signed it.');
  if (firm === '') throw new InvalidCountersignature('A conclusion needs the firm that signed it.');
  if (!isAssuranceStandard(args.standard)) {
    throw new InvalidCountersignature(`${args.standard} is not a standard this records.`);
  }
  if (!isAssuranceOpinion(args.opinion)) {
    throw new InvalidCountersignature(`${args.opinion} is not a conclusion this records.`);
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO statement_countersignatures
       (id, statement_id, digest, signer_name, signer_firm, standard, opinion,
        scope_note, channel, recorded_at, recorded_by)
     VALUES (?,?,?,?,?,?,?,?,'entered_by_staff',?,?)`,
    // The digest is read off the statement, never taken from the caller.
  ).run(id, statement.id, statement.digest, name, firm, args.standard, args.opinion,
        (args.scopeNote ?? '').trim() || null, now.toISOString(), args.recordedBy);

  return countersignaturesFor(db, statement.id).find((c) => c.id === id)!;
}

/**
 * Take a conclusion back.
 *
 * Idempotent on purpose: a firm withdrawing twice is not an error, and the
 * FIRST withdrawal is the one that stands - a later call must not rewrite
 * the date on which the conclusion stopped applying.
 */
export function withdrawCountersignature(
  db: DB, id: string, reason: string, now = new Date(),
): Countersignature {
  const held = row<Row>(
    db.prepare('SELECT * FROM statement_countersignatures WHERE id = ?').get(id),
  );
  if (!held) throw new InvalidCountersignature(`No conclusion has the id ${id}.`);
  if (held.withdrawn_at === null) {
    db.prepare(
      'UPDATE statement_countersignatures SET withdrawn_at = ?, withdrawn_reason = ? WHERE id = ?',
    ).run(now.toISOString(), reason.trim() || null, id);
  }
  return fromRow(
    row<Row>(db.prepare('SELECT * FROM statement_countersignatures WHERE id = ?').get(id))!,
  );
}
