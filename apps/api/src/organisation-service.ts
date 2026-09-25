/**
 * Organisations that fund quests: universities, companies, brands, councils.
 *
 * This replaces the constant the sponsor page carried for months. That
 * constant existed for a good reason - a row in a database reads as a
 * contract, and there were none - and the comment above it said the constant
 * would become a table when somebody signed. The table is here now, and the
 * worry that kept it out is answered by `basis` rather than by absence:
 * 'declared' is an entry somebody typed with nothing signed behind it,
 * 'signed' is a real agreement, and every page that prints money prints
 * which of the two it is reading.
 *
 * WHAT IS REAL AND WHAT IS TYPED. The funding figures here are typed in by a
 * moderator and this module makes no attempt to verify them. The COUNTS they
 * are set against are not: those come from `quest_progress` and the ledger,
 * the same rows a host's Approve click writes, and nothing in this file can
 * change one. That split is the whole design - a buyer can dispute what they
 * were charged and cannot dispute what was verified.
 *
 * Ships empty. A deployment with no organisations shows a page that says so.
 */

import { randomUUID } from 'node:crypto';
import type { FundingBasis, Sponsor, SponsorKind, Sponsorship } from '@chivago/core';
import { row, rows, type DB } from './db.ts';

export const ORG_KINDS: SponsorKind[] = ['university', 'company', 'brand', 'ngo', 'government', 'municipality'];
export const isOrgKind = (v: string): v is SponsorKind => (ORG_KINDS as string[]).includes(v);
export const isFundingBasis = (v: string): v is FundingBasis => v === 'declared' || v === 'signed';

export class UnknownOrganisation extends Error {
  constructor(id: string) {
    super(`No organisation has the id ${id}.`);
    this.name = 'UnknownOrganisation';
  }
}

export class InvalidFunding extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFunding';
  }
}

interface OrgRow {
  id: string;
  name_en: string;
  name_th: string;
  kind: string;
  created_at: string;
  created_by: string | null;
}

interface SponsorshipRow {
  org_id: string;
  quest_id: string;
  funded_thb: number;
  received_thb: number;
  received_at: string | null;
  per_verified_thb: number;
  basis: string;
  started_at: string;
}

const toSponsor = (r: OrgRow): Sponsor => ({
  id: r.id,
  name: { en: r.name_en, th: r.name_th },
  kind: r.kind as SponsorKind,
});

/** Every organisation, oldest first, so a list does not reorder itself between visits. */
export function listOrganisations(db: DB): Sponsor[] {
  return rows<OrgRow>(
    db.prepare('SELECT * FROM organisations ORDER BY created_at, id').all(),
  ).map(toSponsor);
}

export function organisationById(db: DB, id: string): Sponsor {
  const r = row<OrgRow>(db.prepare('SELECT * FROM organisations WHERE id = ?').get(id));
  if (!r) throw new UnknownOrganisation(id);
  return toSponsor(r);
}

/** What this organisation funded. Empty is a real answer, not a missing one. */
export function sponsorshipsFor(db: DB, orgId: string): Sponsorship[] {
  return rows<SponsorshipRow>(
    db.prepare('SELECT * FROM org_sponsorships WHERE org_id = ? ORDER BY started_at, quest_id').all(orgId),
  ).map((r) => ({
    sponsorId: r.org_id,
    questId: r.quest_id,
    fundedTHB: r.funded_thb,
    receivedTHB: r.received_thb,
    receivedAt: r.received_at,
    perVerifiedTHB: r.per_verified_thb,
    startedAt: r.started_at,
  }));
}

/**
 * Whether anything this organisation funded rests on a signed agreement.
 *
 * Read as the weakest link on purpose: one declared line among signed ones
 * makes the whole page 'declared', because a report that called itself signed
 * while one of its figures was somebody's estimate would be worse than one
 * that says declared throughout.
 */
export function basisFor(db: DB, orgId: string): FundingBasis {
  const bases = rows<{ basis: string }>(
    db.prepare('SELECT basis FROM org_sponsorships WHERE org_id = ?').all(orgId),
  ).map((r) => r.basis);
  if (bases.length === 0) return 'declared';
  return bases.every((b) => b === 'signed') ? 'signed' : 'declared';
}

export function addOrganisation(
  db: DB,
  input: { name: string; nameTh?: string | null; kind: string },
  by: string | null,
  now = new Date(),
): Sponsor {
  const name = input.name.trim();
  if (name.length === 0) throw new InvalidFunding('An organisation needs a name.');
  if (!isOrgKind(input.kind)) throw new InvalidFunding(`${input.kind} is not a kind of organisation we know.`);
  const id = randomUUID();
  // The Thai name falls back to the English one rather than to an empty
  // string: a blank on a Thai console page is worse than an untranslated name.
  const nameTh = (input.nameTh ?? '').trim() || name;
  db.prepare(
    'INSERT INTO organisations (id, name_en, name_th, kind, created_at, created_by) VALUES (?,?,?,?,?,?)',
  ).run(id, name, nameTh, input.kind, now.toISOString(), by);
  return { id, name: { en: name, th: nameTh }, kind: input.kind };
}

/**
 * Record what an organisation funded on one quest.
 *
 * Replaces the row if it already exists, because correcting a figure somebody
 * mistyped must not require deleting and re-adding a funder mid-period.
 */
export function addSponsorship(
  db: DB,
  input: {
    orgId: string;
    questId: string;
    fundedTHB: number;
    perVerifiedTHB: number;
    basis?: string;
    startedAt?: string;
  },
  by: string | null,
  now = new Date(),
): Sponsorship {
  organisationById(db, input.orgId);
  const quest = row<{ id: string }>(db.prepare('SELECT id FROM quests WHERE id = ?').get(input.questId));
  if (!quest) throw new InvalidFunding(`No quest has the id ${input.questId}.`);

  for (const [label, n] of [['Funding', input.fundedTHB], ['Per verified', input.perVerifiedTHB]] as const) {
    if (!Number.isFinite(n) || n < 0) throw new InvalidFunding(`${label} must be a number of baht, and not a negative one.`);
  }
  // A quest that pays out more per approval than was ever funded is either a
  // typo or a commitment nobody made. Caught here rather than discovered when
  // the report goes negative.
  if (input.perVerifiedTHB > input.fundedTHB) {
    throw new InvalidFunding('The amount per verified submission cannot be more than the total funded.');
  }
  const basis = input.basis ?? 'declared';
  if (!isFundingBasis(basis)) throw new InvalidFunding(`${basis} is not a funding basis.`);

  const startedAt = input.startedAt ?? now.toISOString();
  db.prepare(
    `INSERT INTO org_sponsorships (org_id, quest_id, funded_thb, per_verified_thb, basis, started_at, created_by)
     VALUES (?,?,?,?,?,?,?)
     -- received_thb and received_at are deliberately absent from this list.
     -- Editing the agreement must never touch what arrived: a typo corrected
     -- in the funded figure is not a reason to forget a transfer that landed.
     ON CONFLICT(org_id, quest_id) DO UPDATE SET
       funded_thb = excluded.funded_thb,
       per_verified_thb = excluded.per_verified_thb,
       basis = excluded.basis,
       started_at = excluded.started_at,
       created_by = excluded.created_by`,
  ).run(input.orgId, input.questId, input.fundedTHB, input.perVerifiedTHB, basis, startedAt, by);

  // Read back rather than assembled, so the payment an edit did not touch is
  // in the returned value instead of a zero the caller would believe.
  return sponsorshipsFor(db, input.orgId)
    .find((s) => s.questId === input.questId)!;
}

/**
 * Record money that arrived.
 *
 * SEPARATE FROM `addSponsorship` ON PURPOSE. Agreeing an amount and receiving
 * it are different acts, usually days apart and often by different people, and
 * a single form that took both would invite the figure to be typed once and
 * read as cash.
 *
 * Cumulative, not a running total the caller maintains: every call says what
 * the balance IS, and `received_at` moves with it. A sponsor paying in two
 * instalments is the ordinary case, not an edge one.
 */
export function recordPayment(
  db: DB,
  args: { orgId: string; questId: string; receivedTHB: number },
  now = new Date(),
): Sponsorship {
  const held = sponsorshipsFor(db, args.orgId).find((s) => s.questId === args.questId);
  if (!held) throw new InvalidFunding(`No funding line joins ${args.orgId} to ${args.questId}.`);
  if (!Number.isFinite(args.receivedTHB) || args.receivedTHB < 0) {
    throw new InvalidFunding('Money received must be a number of baht, and not a negative one.');
  }
  // More arriving than was agreed is not refused - sponsors overpay, and a
  // system that threw the difference away would be hiding the sponsor's money
  // rather than the mistake. It simply shows as nothing owed.
  db.prepare(
    'UPDATE org_sponsorships SET received_thb = ?, received_at = ? WHERE org_id = ? AND quest_id = ?',
  ).run(args.receivedTHB, args.receivedTHB > 0 ? now.toISOString() : null, args.orgId, args.questId);

  return sponsorshipsFor(db, args.orgId).find((s) => s.questId === args.questId)!;
}

export function removeSponsorship(db: DB, orgId: string, questId: string): boolean {
  const res = db.prepare('DELETE FROM org_sponsorships WHERE org_id = ? AND quest_id = ?').run(orgId, questId);
  return Number(res.changes ?? 0) > 0;
}
