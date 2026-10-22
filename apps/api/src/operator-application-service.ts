/**
 * The door a business comes in by.
 *
 * Reading order: `packages/core/src/operator-application.ts` says what an
 * application is and what it is not, and `docs/67` is the runbook. This file
 * is the two writes either side of a human decision:
 *
 *   SUBMIT  a stranger's typed request, which grants nothing;
 *   APPROVE a person's decision, which creates the operator account.
 *
 * WHY APPROVAL CALLS add-host.ts RATHER THAN ITS OWN INSERT. The account
 * created here has to be the same account `docs/62` describes - typed
 * `operator`, so the console's allowlist closes the SOS desk and the review
 * queue to it, with its key hashed and shown once. Writing a second INSERT
 * beside `addHost` is how one of them quietly stops matching: the first
 * version of this file set `role` itself and would have handed a boat co-op a
 * moderator's console the day `addHost` changed.
 *
 * WHAT THIS FILE REFUSES TO KNOW. Whether the business exists, whether the
 * person who filled in the form speaks for it, and whether the licence number
 * is real. None of it is checkable from here, and the approving moderator is
 * the party who checked - which is why their name goes on the row.
 */

import { randomUUID } from 'node:crypto';
import {
  applicationProblems,
  isListingKind,
  type ListingKind,
  type OperatorApplication,
  type OperatorApplicationInput,
} from '@chivago/core';
import { row, rows, transact, type DB } from './db.ts';
import { addHost } from './add-host.ts';

export class InvalidApplication extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidApplication';
  }
}

/**
 * The shape of an operator's id.
 *
 * `op-` prefixed, so a glance at a ledger row, a log line or a listing's
 * owner says which accounts are businesses rather than partners who verify
 * work. Lower case ASCII because it appears in URLs and is read aloud down a
 * phone line when a key is handed over.
 *
 * NOT DERIVED FROM THE BUSINESS NAME. A Thai name transliterates several
 * ways and none of them is the owner's choice, so the moderator types the id
 * while they are looking at the application.
 */
export const OPERATOR_ID = /^op-[a-z0-9][a-z0-9-]{1,38}$/;

interface ApplicationRow {
  id: string;
  business_name: string;
  kind: string;
  where_label: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  licence_no: string | null;
  note: string | null;
  state: string;
  submitted_at: string;
  decided_at: string | null;
  decided_by: string | null;
  reason: string | null;
  host_id: string | null;
}

const toApplication = (r: ApplicationRow): OperatorApplication => ({
  id: r.id,
  businessName: r.business_name,
  kind: r.kind as ListingKind,
  whereLabel: r.where_label,
  contactName: r.contact_name,
  contactPhone: r.contact_phone,
  contactEmail: r.contact_email,
  licenceNo: r.licence_no,
  note: r.note,
  state: r.state as OperatorApplication['state'],
  submittedAt: r.submitted_at,
  decidedAt: r.decided_at,
  decidedBy: r.decided_by,
  reason: r.reason,
  hostId: r.host_id,
});

/** Empty strings become null, so "nobody said" and "" are not two answers. */
const orNull = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 ? s : null;
};

/**
 * Take an application. Returns the id, which is all the applicant is shown:
 * it is not a credential and reaches nothing, but it is what a phone call
 * about their form can be about.
 *
 * Validated through `applicationProblems`, which the form also renders, so
 * the page and the write cannot disagree about what is required.
 */
export function submitApplication(
  db: DB,
  input: {
    businessName: unknown; kind: unknown; whereLabel: unknown; contactName: unknown;
    contactPhone: unknown; contactEmail?: unknown; licenceNo?: unknown; note?: unknown;
  },
  now = new Date(),
): OperatorApplication {
  const kind = typeof input.kind === 'string' ? input.kind : '';
  if (!isListingKind(kind)) throw new InvalidApplication(`${kind} is not a kind of listing.`);

  const candidate: OperatorApplicationInput = {
    businessName: String(input.businessName ?? '').trim(),
    kind,
    whereLabel: String(input.whereLabel ?? '').trim(),
    contactName: String(input.contactName ?? '').trim(),
    contactPhone: String(input.contactPhone ?? '').trim(),
    contactEmail: orNull(input.contactEmail),
    licenceNo: orNull(input.licenceNo),
    note: orNull(input.note),
  };

  const problems = applicationProblems(candidate);
  // The Thai half, because the form is Thai-first and this message is read by
  // the applicant. The English is on the page beside it.
  if (problems.length > 0) throw new InvalidApplication(problems.map((p) => p.th).join(' · '));

  const id = randomUUID();
  db.prepare(
    `INSERT INTO operator_applications
       (id, business_name, kind, where_label, contact_name, contact_phone,
        contact_email, licence_no, note, state, submitted_at)
     VALUES (?,?,?,?,?,?,?,?,?,'pending',?)`,
  ).run(
    id, candidate.businessName, candidate.kind, candidate.whereLabel, candidate.contactName,
    candidate.contactPhone, candidate.contactEmail, candidate.licenceNo, candidate.note,
    now.toISOString(),
  );

  return applicationById(db, id)!;
}

export function applicationById(db: DB, id: string): OperatorApplication | null {
  const r = row<ApplicationRow>(
    db.prepare('SELECT * FROM operator_applications WHERE id = ?').get(id),
  );
  return r ? toApplication(r) : null;
}

/** Oldest first: the business that has been waiting longest is answered first. */
export function pendingApplications(db: DB): OperatorApplication[] {
  return rows<ApplicationRow>(
    db.prepare(
      "SELECT * FROM operator_applications WHERE state = 'pending' ORDER BY submitted_at, id",
    ).all(),
  ).map(toApplication);
}

/** What has been decided, most recent first. Kept, never deleted. */
export function decidedApplications(db: DB, limit = 50): OperatorApplication[] {
  return rows<ApplicationRow>(
    db.prepare(
      `SELECT * FROM operator_applications WHERE state <> 'pending'
       ORDER BY decided_at DESC, id LIMIT ?`,
    ).all(limit),
  ).map(toApplication);
}

/** How many are waiting. For the moderator's nav. */
export const applicationsWaiting = (db: DB): number =>
  row<{ n: number }>(
    db.prepare("SELECT COUNT(*) n FROM operator_applications WHERE state = 'pending'").get(),
  )?.n ?? 0;

/**
 * Approve one, creating the operator account.
 *
 * Returns the console key, which is shown ONCE and stored only as a hash -
 * there is no second chance to read it and nothing here keeps a copy. A lost
 * key is rotated the way any host's is (docs/62).
 *
 * IN ONE TRANSACTION. An approval that created the host and then failed to
 * mark the application would leave a business holding a live key that the
 * queue still lists as waiting, and the next moderator would approve it again
 * into a second account.
 */
export function approveApplication(
  db: DB,
  args: { id: string; hostId: string; by: string; now?: Date },
): { application: OperatorApplication; key: string } {
  const existing = applicationById(db, args.id);
  if (!existing) throw new InvalidApplication('No application has that id.');
  if (existing.state !== 'pending') {
    throw new InvalidApplication('That application has already been decided.');
  }

  const hostId = args.hostId.trim().toLowerCase();
  if (!OPERATOR_ID.test(hostId)) {
    throw new InvalidApplication(
      'An operator id looks like op-thong-krut-boats: lower case letters, numbers and dashes.',
    );
  }
  if (row(db.prepare('SELECT 1 FROM hosts WHERE id = ?').get(hostId))) {
    throw new InvalidApplication(`${hostId} is already taken. Choose another id.`);
  }
  if (!args.by.trim()) throw new InvalidApplication('An approval is recorded against a name.');

  const now = args.now ?? new Date();
  const key = transact(db, () => {
    // Typed `operator`, so the console's allowlist applies from the first
    // request: its login reaches its listings and its questions, and no page
    // showing a traveller's emergency.
    const created = addHost(db, {
      id: hostId, name: existing.businessName, type: 'operator', now,
    });
    // `addHost` returns a null key for a host that already had one, and the
    // id was checked free above - so a null here means something changed
    // underneath us, and an approval that cannot hand over a key is not one.
    if (!created.key) throw new InvalidApplication(`${hostId} already has a key. Choose another id.`);

    if (existing.contactEmail) {
      db.prepare('UPDATE hosts SET contact_email = ? WHERE id = ?').run(existing.contactEmail, hostId);
    }

    db.prepare(
      `UPDATE operator_applications
         SET state = 'approved', decided_at = ?, decided_by = ?, host_id = ?
       WHERE id = ? AND state = 'pending'`,
    ).run(now.toISOString(), args.by.trim(), hostId, args.id);

    return created.key;
  });

  return { application: applicationById(db, args.id)!, key };
}

/**
 * Refuse one, with a reason.
 *
 * The reason is required because the applicant is owed a sentence, and
 * because a queue of refusals with no reasons is a record nobody can audit
 * for the thing worth auditing: whether businesses are being turned away for
 * reasons anyone would defend.
 */
export function rejectApplication(
  db: DB,
  args: { id: string; reason: string; by: string; now?: Date },
): OperatorApplication {
  const existing = applicationById(db, args.id);
  if (!existing) throw new InvalidApplication('No application has that id.');
  if (existing.state !== 'pending') {
    throw new InvalidApplication('That application has already been decided.');
  }
  const reason = args.reason.trim();
  if (!reason) throw new InvalidApplication('Say why, so the business can be told.');
  if (!args.by.trim()) throw new InvalidApplication('A refusal is recorded against a name.');

  db.prepare(
    `UPDATE operator_applications
       SET state = 'rejected', decided_at = ?, decided_by = ?, reason = ?
     WHERE id = ? AND state = 'pending'`,
  ).run((args.now ?? new Date()).toISOString(), args.by.trim(), reason, args.id);

  return applicationById(db, args.id)!;
}
