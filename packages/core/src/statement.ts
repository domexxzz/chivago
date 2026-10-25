/**
 * A statement of verified activity - the evidence layer a hotel does not have.
 *
 * The numbers a hotel reports today are its own. HCMI (the Hotel Carbon
 * Measurement Initiative) and Cornell's CHSB index are computed by the hotel
 * and submitted by the hotel; Thailand's CF-Hotels is a carbon calculator the
 * hotel fills in itself. Every one of them is a back-office figure with no
 * surface a guest ever touches. None of them can show a third party that a
 * specific thing happened on a specific day and that somebody stood behind it.
 *
 * That is the one thing this ledger holds. So this product does not measure
 * a building - it is the layer those reports cannot produce: activity a named
 * host verified, inside a fence, on a date, attached to a hotel's existing
 * report as evidence rather than replacing a number in it.
 *
 * A statement is what a host hands over. Three properties make it evidence
 * rather than one more self-reported figure:
 *
 *   ISSUED, NOT COMPUTED ON DEMAND. Once issued it is immutable; a re-issue is
 *   a new statement with a new id. The paper a hotel files cannot drift from
 *   the record.
 *
 *   CHECKABLE BY ANYONE. Every statement has a public id and a digest of its
 *   canonical form. An auditor holding the hotel's report fetches the id and
 *   compares - no account, no trust in the hotel required.
 *
 *   NOBODY IS IN IT. Lines are per activity per day with a count. Participants
 *   are counted distinctly and never named; a guest's history across places
 *   is exactly what the platform must not hand a business (see the PDPA
 *   note in docs/31).
 *
 * And a fourth refusal on top of the ESG report's three: this is not a
 * property carbon figure and does not replace HCMI, CHSB or CF-Hotels.
 */

import type { Bilingual, QuestHost } from './types.ts';
import { ASSURANCE, NOT_CLAIMABLE, type EsgPeriod, type EsgPillar } from './esg.ts';

/**
 * One host approval, on one day, with whoever it was. The input side: ids are
 * needed to count people once, and they stop here.
 */
export interface StatementActivity {
  questId: string;
  name: Bilingual;
  pillar: EsgPillar | null;
  /** The UTC day of the host's approval, YYYY-MM-DD. */
  day: string;
  /** Opaque ids. Counted distinctly, never carried into the statement. */
  participants: string[];
  /** Weight recorded on the approved proofs, in kg, when the quest records one. */
  weightKg: number | null;
}

/** One line of the statement: an activity, a day, a count. No people. */
export interface StatementLine {
  questId: string;
  name: Bilingual;
  pillar: EsgPillar | null;
  day: string;
  verified: number;
  weightKg: number | null;
}

/** Everything the digest covers. */
export interface StatementBody {
  host: QuestHost;
  period: EsgPeriod;
  issuedAt: string;
  /** The named person who issued it, when the console knew one. */
  issuedBy: string | null;
  lines: StatementLine[];
  /** Approvals in the period, all lines summed. */
  verified: number;
  /** DISTINCT people across the whole statement. */
  participants: number;
  /** Proofs this host turned down in the period. A host that never says no is not checking. */
  refused: number;
  /** Total weight on the approved proofs, or null when no line recorded one. */
  weightKg: number | null;
  assurance: Bilingual;
  boundary: Bilingual;
  notClaimable: Bilingual[];
}

/** A statement as issued: the body, its id, and the digest anyone can recompute. */
export interface ActivityStatement extends StatementBody {
  id: string;
  /** SHA-256, hex, of `canonicalJson` of the body. */
  digest: string;
}

/**
 * Crockford's base32 - no I, L, O or U, so an id read off paper over the
 * phone survives the trip. A year up front so a stack of them sorts itself.
 */
export const STATEMENT_ID_PATTERN = /^CG-\d{4}-[0-9A-HJKMNP-TV-Z]{6}$/;

export const STATEMENT_BOUNDARY: Bilingual = {
  en: 'Activity on this host’s own quests, approved by this host between the dates shown. Work verified by other hosts is excluded, and so is anything a traveller recorded without a host.',
  th: 'เฉพาะกิจกรรมในภารกิจของผู้จัดรายนี้ ที่ผู้จัดรายนี้ตรวจผ่านภายในช่วงวันที่ระบุ งานที่ผู้จัดรายอื่นตรวจ และสิ่งที่นักเดินทางบันทึกเองโดยไม่มีผู้จัด ไม่ถูกนับ',
  zh: '仅限本主办方自有任务中的活动，且由本主办方在所示日期之间批准。由其他主办方核实的工作不计入，旅行者在没有主办方的情况下自行记录的内容也不计入。',
};

/**
 * The refusal that is specific to a hotel. The other three are inherited from
 * the ESG report, with additionality reworded for a host rather than a funder.
 */
export const HOTEL_CARBON_NOT_CLAIMABLE: Bilingual = {
  en: 'A property carbon figure. This statement measures no building and does not replace HCMI, CHSB or CF-Hotels. Attach it to such a report as activity evidence; it changes no number in them.',
  th: 'ตัวเลขคาร์บอนของอาคาร รายการนี้ไม่ได้วัดอาคารใด และไม่แทนที่ HCMI, CHSB หรือ CF-Hotels ใช้แนบกับรายงานเหล่านั้นเป็นหลักฐานกิจกรรมได้ แต่ไม่เปลี่ยนตัวเลขใดในนั้น',
  zh: '物业碳排放数字。本报表不测量任何建筑，也不替代 HCMI、CHSB 或 CF-Hotels。可作为活动证据附在此类报告之后；它不会改变其中的任何数字。',
};

export const STATEMENT_NOT_CLAIMABLE: Bilingual[] = [
  NOT_CLAIMABLE[0]!,
  NOT_CLAIMABLE[1]!,
  {
    en: 'Additionality. Nothing here establishes what would have happened without this host, or without this platform.',
    th: 'ส่วนเพิ่มที่แท้จริง รายการนี้ไม่ได้พิสูจน์ว่าถ้าไม่มีผู้จัดรายนี้ หรือไม่มีแพลตฟอร์มนี้ จะเกิดอะไรขึ้นหรือไม่',
    zh: '额外性。此处没有任何内容能确定，若没有这家主办方、或没有这个平台，事情会如何发生。',
  },
  HOTEL_CARBON_NOT_CLAIMABLE,
];

/**
 * JSON with keys sorted at every level and no whitespace, so the same body
 * always digests the same. `undefined` is dropped like JSON.stringify does;
 * arrays keep their order, which is why `lines` is sorted before it gets here.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

const byDayThenQuest = (a: StatementLine, b: StatementLine): number =>
  a.day < b.day ? -1 : a.day > b.day ? 1 : a.questId < b.questId ? -1 : a.questId > b.questId ? 1 : 0;

/** Sum that stays null until a real weight turns up, so 0 kg is never invented. */
const addWeight = (total: number | null, w: number | null): number | null =>
  w === null ? total : (total ?? 0) + w;

/**
 * Assemble the body. Activities must already be this host's and inside the
 * period - the database knows the dates and this function does not guess.
 * Two approvals of the same quest on the same day become one line with a
 * count of two, so a statement reads as a record and not as a log.
 */
export function activityStatement(args: {
  host: QuestHost;
  period: EsgPeriod;
  activities: StatementActivity[];
  refused: number;
  issuedAt: string;
  issuedBy?: string | null;
}): StatementBody {
  const lines = new Map<string, StatementLine>();
  const everyone = new Set<string>();

  for (const a of args.activities) {
    const key = `${a.day} ${a.questId}`;
    const line = lines.get(key) ?? {
      questId: a.questId, name: a.name, pillar: a.pillar, day: a.day, verified: 0, weightKg: null,
    };
    lines.set(key, {
      ...line,
      verified: line.verified + a.participants.length,
      weightKg: addWeight(line.weightKg, a.weightKg),
    });
    for (const id of a.participants) everyone.add(id);
  }

  const sorted = [...lines.values()].sort(byDayThenQuest);
  return {
    host: { id: args.host.id, name: args.host.name, type: args.host.type },
    period: { from: args.period.from, to: args.period.to },
    issuedAt: args.issuedAt,
    issuedBy: args.issuedBy ?? null,
    lines: sorted,
    verified: sorted.reduce((n, l) => n + l.verified, 0),
    participants: everyone.size,
    refused: args.refused,
    weightKg: sorted.reduce<number | null>((t, l) => addWeight(t, l.weightKg), null),
    assurance: ASSURANCE,
    boundary: STATEMENT_BOUNDARY,
    notClaimable: STATEMENT_NOT_CLAIMABLE,
  };
}

/**
 * The one line that will be pasted into a hotel's report. The host's name and
 * the dates are inside the sentence, because out of context is where it will
 * be read.
 */
export function statementHeadline(s: StatementBody): Bilingual {
  if (s.verified === 0) {
    return {
      en: `${s.host.name} verified no activity between ${s.period.from} and ${s.period.to}.`,
      th: `${s.host.name} ไม่มีกิจกรรมที่ตรวจผ่านระหว่าง ${s.period.from} ถึง ${s.period.to}`,
      zh: `${s.host.name} 在 ${s.period.from} 至 ${s.period.to} 之间没有核实任何活动。`,
    };
  }
  const acts = s.verified;
  const people = s.participants;
  return {
    en: `${acts} ${acts === 1 ? 'activity' : 'activities'} verified by ${s.host.name}, involving ${people} ${people === 1 ? 'person' : 'people'}, between ${s.period.from} and ${s.period.to}.`,
    th: `${s.host.name} ตรวจผ่านกิจกรรม ${acts} ครั้ง มีผู้ร่วม ${people} คน ระหว่าง ${s.period.from} ถึง ${s.period.to}`,
    zh: `${s.host.name} 在 ${s.period.from} 至 ${s.period.to} 之间核实了 ${acts} 项活动，参与者 ${people} 人。`,
  };
}
