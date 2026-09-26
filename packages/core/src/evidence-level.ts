/**
 * How well a thing is known, on the ladder the team wrote.
 *
 * The framework note of 26 September grades evidence in four rungs, and its
 * fifth section says the rung is AGREED BEFORE THE PROJECT STARTS, beside the
 * KPI and the data scope. That ordering is the whole reason this is not one
 * number: what a contract requires and what a submission achieved are
 * different facts, and a system that stored only one of them cannot tell
 * anybody they fell short.
 *
 *   1  the traveller said so
 *   2  a digital trace — a geofenced arrival, or a photograph
 *   3  the partner who ran it approved, and is named
 *   4  a third party checked that approval
 *
 * THE AGREED LEVEL IS STORED. It is somebody's decision, made once, and there
 * is nothing to derive it from.
 *
 * THE ATTAINED LEVEL IS DERIVED, every time, from the rows as they are. A
 * stored one would be a second copy of the truth that drifts the moment a
 * proof is withdrawn — the same argument `monster-service.ts` makes about HP,
 * and the same one the reversal sprint spent six pull requests proving.
 *
 * LEVEL 4 IS NEVER RETURNED TODAY. Nothing in this system lets a third party
 * countersign, so a function that could return 4 would be describing a
 * capability that does not exist. `evidence.ts` says the same thing in
 * prose; this says it by never producing the number.
 */

import type { Bilingual } from './types.ts';

/** 0 means nothing was submitted at all, which is not a rung. */
export type EvidenceLevel = 0 | 1 | 2 | 3 | 4;

export const EVIDENCE_LEVELS: readonly EvidenceLevel[] = [1, 2, 3, 4];

export const LEVEL_LABEL: Record<EvidenceLevel, Bilingual> = {
  0: { en: 'Nothing submitted', th: 'ยังไม่มีการส่งหลักฐาน' },
  1: { en: 'Self-reported', th: 'ผู้ใช้รายงานเอง' },
  2: { en: 'Digital trace', th: 'มีหลักฐานดิจิทัล' },
  3: { en: 'Partner verified', th: 'พาร์ตเนอร์ยืนยัน' },
  4: { en: 'Third party checked', th: 'บุคคลที่สามตรวจ' },
};

/** What the rows actually hold about one submission. */
export interface EvidenceFacts {
  submitted: boolean;
  /** Arrival inside the quest's fence. `arriveAtQuest` refuses outside it. */
  geofencedArrival: boolean;
  photos: number;
  /** A partner passed it AND the console recorded which person. */
  partnerApproved: boolean;
  reviewerNamed: boolean;
  /** Reserved. Nothing can set this yet, and the type says so rather than lying. */
  thirdPartyChecked?: false;
}

export const isEvidenceLevel = (n: number): n is EvidenceLevel =>
  Number.isInteger(n) && n >= 0 && n <= 4;

/**
 * The highest rung the rows support.
 *
 * A PARTNER APPROVAL WITHOUT A NAME IS NOT RUNG THREE. The rung says a named
 * partner stood behind it; an approval whose reviewer the console never
 * recorded cannot be asked about, which is the only thing rung three is worth.
 * It falls back to whatever the trace supports.
 */
export function attainedLevel(f: EvidenceFacts): EvidenceLevel {
  if (!f.submitted) return 0;
  if (f.partnerApproved && f.reviewerNamed) return 3;
  if (f.geofencedArrival || f.photos > 0) return 2;
  return 1;
}

/**
 * Whether a submission cleared the bar its quest agreed to.
 *
 * `null` required means nobody agreed a level, which is NOT the same as
 * clearing one. It comes back as `unagreed` so a report can say so instead of
 * quietly passing everything.
 */
export type LevelVerdict = 'meets' | 'short' | 'unagreed';

export function levelVerdict(required: EvidenceLevel | null, attained: EvidenceLevel): LevelVerdict {
  if (required === null) return 'unagreed';
  return attained >= required ? 'meets' : 'short';
}

/**
 * What a set of submissions says about the bar it was held to.
 *
 * `short` leads, because a shortfall is the only one of the three that
 * anybody has to do something about. `unagreed` is reported rather than
 * folded into either: a quest nobody set a level for has not passed a test,
 * it has not been given one.
 */
export interface LevelSummary {
  meets: number;
  short: number;
  unagreed: number;
  note: Bilingual;
}

export function levelSummary(
  submissions: readonly { required: EvidenceLevel | null; attained: EvidenceLevel }[],
): LevelSummary {
  let meets = 0;
  let short = 0;
  let unagreed = 0;
  for (const s of submissions) {
    const v = levelVerdict(s.required, s.attained);
    if (v === 'meets') meets += 1;
    else if (v === 'short') short += 1;
    else unagreed += 1;
  }
  return { meets, short, unagreed, note: noteFor(meets, short, unagreed) };
}

function noteFor(meets: number, short: number, unagreed: number): Bilingual {
  const total = meets + short + unagreed;
  if (total === 0) {
    return { en: 'Nothing to hold to a level.', th: 'ยังไม่มีรายการให้เทียบระดับ' };
  }
  const parts: string[] = [];
  const partsTh: string[] = [];
  if (short > 0) {
    parts.push(`${short} of ${total} fall short of the level their quest agreed`);
    partsTh.push(`${short} จาก ${total} รายการต่ำกว่าระดับที่ภารกิจตกลงไว้`);
  }
  if (unagreed > 0) {
    parts.push(`${unagreed} belong to a quest with no agreed level, and are held to none`);
    partsTh.push(`${unagreed} รายการอยู่ในภารกิจที่ไม่ได้ตกลงระดับไว้ จึงไม่ถูกเทียบกับระดับใด`);
  }
  if (parts.length === 0) {
    return {
      en: `All ${total} meet the level their quest agreed.`,
      th: `ทั้ง ${total} รายการอยู่ในระดับที่ภารกิจตกลงไว้`,
    };
  }
  return { en: `${parts.join('. ')}.`, th: `${partsTh.join(' ')}` };
}
