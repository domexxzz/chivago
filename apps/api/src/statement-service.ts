/**
 * Statements of verified activity - the stateful half of the evidence layer.
 * See packages/core/src/statement.ts for what a statement is and refuses.
 *
 * Three rules live here and nowhere else:
 *
 *   A statement is ISSUED. `draftStatement` reads the ledger for a period and
 *   costs nothing; `issueStatement` writes the same body down with an id and
 *   a digest, and from then on it is the record. The table refuses UPDATE
 *   (migrations.ts), so the only way to change what a hotel filed is to file
 *   another one.
 *
 *   A statement is CHECKED ON READ. The digest is recomputed from the stored
 *   body every time, so a row somebody edited in SQLite is refused loudly
 *   rather than served with a stale digest under it.
 *
 *   A statement is SCOPED TO ITS HOST'S OWN QUESTS. A hotel that also
 *   sponsors an NGO's cleanup has the ESG report for that; what it can state
 *   here is what its own named reviewers approved.
 */

import { createHash, randomBytes } from 'node:crypto';
import {
  activityStatement, canonicalJson, type ActivityStatement, type Bilingual, type EsgPeriod,
  type EsgPillar, type QuestHost, type StatementActivity, type StatementBody,
} from '@chivago/core';
import { row, rows, type DB } from './db.ts';

export class UnknownHost extends Error {
  constructor(id: string) {
    super(`No host has the id ${id}.`);
    this.name = 'UnknownHost';
  }
}

export class InvalidPeriod extends Error {
  constructor(detail: string) {
    super(`That is not a period this statement can cover: ${detail}.`);
    this.name = 'InvalidPeriod';
  }
}

/** A stored row whose body no longer matches its digest. An incident, not a 404. */
export class StatementTampered extends Error {
  constructor(id: string) {
    super(`Statement ${id} does not match its own digest. It has been altered in storage.`);
    this.name = 'StatementTampered';
  }
}

const isDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** Both dates well-formed and in order. A statement "to" before "from" is an empty claim dressed as one. */
export function assertPeriod(period: EsgPeriod): void {
  if (!isDate(period.from)) throw new InvalidPeriod(`from is ${JSON.stringify(period.from)}`);
  if (!isDate(period.to)) throw new InvalidPeriod(`to is ${JSON.stringify(period.to)}`);
  if (period.from > period.to) throw new InvalidPeriod(`${period.from} is after ${period.to}`);
}

export function hostById(db: DB, id: string): QuestHost {
  const h = row<{ id: string; name: string; type: QuestHost['type'] }>(
    db.prepare('SELECT id, name, type FROM hosts WHERE id = ?').get(id),
  );
  if (!h) throw new UnknownHost(id);
  return { id: h.id, name: h.name, type: h.type };
}

const PILLARS = new Set<string>(['environmental', 'social', 'governance']);
const isPillar = (v: string | null): v is EsgPillar => v !== null && PILLARS.has(v);

/**
 * The period is inclusive of both dates. `verified_at` is an ISO timestamp
 * and the dates are days, so the upper bound is the end of that day - the
 * same convention as the ESG report, so the two never disagree about whether
 * 31 December is in the year.
 */
const bounds = (period: EsgPeriod) => ({
  from: `${period.from}T00:00:00.000Z`,
  to: `${period.to}T23:59:59.999Z`,
});

/**
 * Every approval on this host's quests inside the period, one entry per
 * person, plus how many proofs the host turned down. Weight is read from the
 * proof the host approved - the figure a named reviewer looked at and
 * accepted - never from a pending or refused one.
 */
export function activityFor(
  db: DB, hostId: string, period: EsgPeriod,
): { activities: StatementActivity[]; refused: number } {
  const { from, to } = bounds(period);

  const approvals = rows<{
    quest_id: string; user_id: string; verified_at: string;
    name_en: string; name_th: string; pillar: string | null; weight_kg: number | null;
  }>(
    db.prepare(
      `SELECT qp.quest_id, qp.user_id, qp.verified_at, q.name_en, q.name_th,
              q.esg_pillar AS pillar,
              (SELECT p.weight_kg FROM proofs p
                WHERE p.user_id = qp.user_id AND p.quest_id = qp.quest_id AND p.approved = 1
                ORDER BY p.reviewed_at DESC LIMIT 1) AS weight_kg
       FROM quest_progress qp
       JOIN quests q ON q.id = qp.quest_id
       WHERE q.host_id = ? AND qp.verified_at IS NOT NULL
         AND qp.verified_at >= ? AND qp.verified_at <= ?
       ORDER BY qp.verified_at`,
    ).all(hostId, from, to),
  );

  const activities: StatementActivity[] = approvals.map((r) => ({
    questId: r.quest_id,
    name: { en: r.name_en, th: r.name_th },
    pillar: isPillar(r.pillar) ? r.pillar : null,
    day: r.verified_at.slice(0, 10),
    participants: [r.user_id],
    weightKg: r.weight_kg ?? null,
  }));

  const refused = row<{ n: number }>(
    db.prepare(
      `SELECT COUNT(*) AS n FROM proofs p JOIN quests q ON q.id = p.quest_id
       WHERE q.host_id = ? AND p.approved = 0 AND p.reviewed_at >= ? AND p.reviewed_at <= ?`,
    ).get(hostId, from, to),
  )?.n ?? 0;

  return { activities, refused };
}

/** What the statement would say, without saying it. Free to call, nothing written. */
export function draftStatement(
  db: DB, hostId: string, period: EsgPeriod, now = new Date(), issuedBy: string | null = null,
): StatementBody {
  assertPeriod(period);
  const host = hostById(db, hostId);
  const { activities, refused } = activityFor(db, hostId, period);
  return activityStatement({ host, period, activities, refused, issuedAt: now.toISOString(), issuedBy });
}

/** SHA-256 over the canonical body. Anyone with the JSON can recompute it. */
export const digestOf = (body: StatementBody): string =>
  createHash('sha256').update(canonicalJson(body)).digest('hex');

/** Crockford's alphabet: no I, L, O, U. 256 is a multiple of 32, so a byte mod 32 is uniform. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function newStatementId(now: Date): string {
  const bytes = randomBytes(6);
  let tail = '';
  for (const b of bytes) tail += ALPHABET[b % 32];
  return `CG-${now.getUTCFullYear()}-${tail}`;
}

interface StatementRow {
  id: string; host_id: string; period_from: string; period_to: string;
  issued_at: string; issued_by: string | null; body: string; digest: string;
}

const SELECT = 'SELECT id, host_id, period_from, period_to, issued_at, issued_by, body, digest FROM statements';

/**
 * Write the statement down. The body stored is the canonical text, so what
 * the digest covers and what is on disk are the same bytes.
 */
export function issueStatement(
  db: DB, hostId: string, period: EsgPeriod, issuedBy: string | null, now = new Date(),
): ActivityStatement {
  const body = draftStatement(db, hostId, period, now, issuedBy);
  const digest = digestOf(body);
  const insert = db.prepare(
    `INSERT INTO statements (id, host_id, period_from, period_to, issued_at, issued_by, body, digest)
     VALUES (?,?,?,?,?,?,?,?)`,
  );
  // Thirty random bits per try. A collision is a primary-key refusal, and a
  // second draw settles it; five is paranoia.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = newStatementId(now);
    try {
      insert.run(id, hostId, period.from, period.to, body.issuedAt, issuedBy, canonicalJson(body), digest);
      return { ...body, id, digest };
    } catch (e) {
      if (!/UNIQUE|PRIMARY KEY/i.test(String((e as Error).message))) throw e;
    }
  }
  throw new Error('could not allot a statement id in five tries');
}

function fromRow(r: StatementRow): ActivityStatement {
  const body = JSON.parse(r.body) as StatementBody;
  const digest = digestOf(body);
  if (digest !== r.digest) throw new StatementTampered(r.id);
  return { ...body, id: r.id, digest };
}

/** The record, or null. The digest is recomputed on every read. */
export function readStatement(db: DB, id: string): ActivityStatement | null {
  const r = row<StatementRow>(db.prepare(`${SELECT} WHERE id = ?`).get(id));
  return r ? fromRow(r) : null;
}

/** Everything this host has issued, newest first. */
export function statementsFor(db: DB, hostId: string): ActivityStatement[] {
  return rows<StatementRow>(
    db.prepare(`${SELECT} WHERE host_id = ? ORDER BY issued_at DESC, id`).all(hostId),
  ).map(fromRow);
}

/** What a traveller is told: the statement, and which of their quests it counts. Nothing about anyone else. */
export interface FiledStatement {
  id: string;
  host: QuestHost;
  period: EsgPeriod;
  issuedAt: string;
  quests: { id: string; name: Bilingual }[];
}

/**
 * Statements that include this traveller's verified work.
 *
 * Membership is read from the statement's own lines, not recomputed from the
 * period: work verified after a statement was issued is inside the dates and
 * NOT in the statement, and telling the traveller otherwise would be telling
 * them something the hotel never filed.
 */
export function statementsIncluding(db: DB, userId: string): FiledStatement[] {
  const mine = rows<{ quest_id: string; verified_at: string; host_id: string }>(
    db.prepare(
      `SELECT qp.quest_id, qp.verified_at, q.host_id
       FROM quest_progress qp JOIN quests q ON q.id = qp.quest_id
       WHERE qp.user_id = ? AND qp.verified_at IS NOT NULL`,
    ).all(userId),
  );
  if (mine.length === 0) return [];

  const hosts = [...new Set(mine.map((m) => m.host_id))];
  const holes = hosts.map(() => '?').join(',');
  const issued = rows<StatementRow>(
    db.prepare(`${SELECT} WHERE host_id IN (${holes}) ORDER BY issued_at DESC, id`).all(...hosts),
  ).map(fromRow);

  return issued.flatMap((s) => {
    const lines = new Map(s.lines.map((l) => [`${l.day} ${l.questId}`, l]));
    const quests = new Map<string, { id: string; name: Bilingual }>();
    for (const m of mine) {
      if (m.host_id !== s.host.id) continue;
      const line = lines.get(`${m.verified_at.slice(0, 10)} ${m.quest_id}`);
      if (line) quests.set(m.quest_id, { id: m.quest_id, name: line.name });
    }
    return quests.size === 0
      ? []
      : [{ id: s.id, host: s.host, period: s.period, issuedAt: s.issuedAt, quests: [...quests.values()] }];
  });
}
