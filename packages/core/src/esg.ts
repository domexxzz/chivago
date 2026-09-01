/**
 * An ESG report somebody could hand an auditor.
 *
 * The sponsor engine already answers "what did my money do". A partner filing
 * a 56-1 One Report, or reporting to SET, needs something narrower and
 * stricter: a number for a stated period, with a stated boundary, that
 * survives being asked "how do you know".
 *
 * The fit is not a stretch. The central failure of corporate ESG reporting is
 * the unverifiable self-reported claim — "our staff contributed 500 volunteer
 * hours" with nothing behind it — and that is the exact problem this whole
 * product exists to solve. Every figure below traces to a named host approving
 * a specific submission on a specific date.
 *
 * THREE THINGS THIS REPORT REFUSES TO SAY, and they are the reason to trust
 * the rest of it:
 *
 *   NO CARBON FIGURE. Turning "nine verified beach cleanups" into tCO2e needs
 *   an emission factor this platform does not hold. Inventing one is how a
 *   cleanup becomes a carbon credit, and it is the single most common lie in
 *   this field.
 *
 *   NO ASSURANCE CLAIM. Verification here is by the named host who ran the
 *   activity. That is far better than self-reporting and it is NOT independent
 *   assurance under ISAE 3000 — saying so is the difference between evidence
 *   and a badge.
 *
 *   NO BASELINE. Nothing here establishes what would have happened anyway.
 *   Additionality is the question most ESG reports never ask, and a platform
 *   that cannot answer it should say which question it is not answering.
 */

import type { Bilingual } from './types.ts';
import type { Sponsor } from './sponsorship.ts';

/** The three pillars, as an auditor would expect them separated. */
export type EsgPillar = 'environmental' | 'social' | 'governance';

export const ESG_PILLARS: EsgPillar[] = ['environmental', 'social', 'governance'];

export const PILLAR_LABEL: Record<EsgPillar, Bilingual> = {
  environmental: { en: 'Environmental', th: 'สิ่งแวดล้อม' },
  social: { en: 'Social', th: 'สังคม' },
  governance: { en: 'Governance', th: 'ธรรมาภิบาล' },
};

/**
 * One funded activity, inside the reporting period.
 *
 * `participants` is a list of opaque ids rather than a count, and that is the
 * whole reason this type exists. Summing per-activity counts is how "we
 * reached 10,000 people" happens when 2,000 people each did five things — the
 * most common inflation in social reporting, and it is arithmetic rather than
 * dishonesty, which is why it survives review.
 */
export interface EsgActivity {
  questId: string;
  name: Bilingual;
  pillar: EsgPillar;
  hostName: string;
  /** Submissions a named host approved, within the period. */
  verified: number;
  /** Opaque participant ids. Never surfaced — only counted, distinctly. */
  participants: string[];
  fundedTHB: number;
  /** Reached the host, counted from approvals. */
  paidTHB: number;
}

export interface PillarTotals {
  verified: number;
  /** DISTINCT within the pillar. */
  participants: number;
  paidTHB: number;
  activities: number;
}

export interface EsgPeriod { from: string; to: string }

export interface EsgReport {
  partner: Sponsor;
  period: EsgPeriod;
  activities: EsgActivity[];
  byPillar: Record<EsgPillar, PillarTotals>;
  /** DISTINCT across the whole report, not the sum of the pillars. */
  participants: number;
  verified: number;
  paidTHB: number;
  fundedTHB: number;
  /** What each figure's verification actually is, stated with the figures. */
  assurance: Bilingual;
  /** What this report will not claim, and why. */
  notClaimable: Bilingual[];
  /** Where the boundary is drawn. An unstated boundary is an unbounded claim. */
  boundary: Bilingual;
  /**
   * Funded activity inside the period that carries no ESG classification, and
   * is therefore NOT in any figure above.
   *
   * Reported rather than absorbed. The alternative is guessing a pillar from
   * whatever else the record happens to hold, which mis-files an activity in
   * a document somebody signs — and a scope exclusion an auditor can see is
   * worth far more than a total that quietly swallowed it.
   */
  excludedUnclassified: number;
}

export const ASSURANCE: Bilingual = {
  en: 'Every figure counts a submission approved by the named host who ran the activity, on a dated ledger entry that cannot be edited.',
  th: 'ทุกตัวเลขนับจากงานที่ผู้จัดกิจกรรมซึ่งระบุชื่อได้เป็นผู้ตรวจ และบันทึกไว้พร้อมวันที่ในระบบที่แก้ไขย้อนหลังไม่ได้',
};

export const BOUNDARY: Bilingual = {
  en: 'Activity funded by this partner and verified between the dates shown. Work outside the period, or funded by others, is excluded.',
  th: 'เฉพาะกิจกรรมที่พันธมิตรรายนี้สนับสนุนและผ่านการตรวจภายในช่วงวันที่ระบุ กิจกรรมนอกช่วงเวลาหรือที่ผู้อื่นสนับสนุนไม่ถูกนับ',
};

/**
 * The three refusals, shipped with every report.
 *
 * Not a footnote and not an appendix. A reader who takes the verified count
 * and calls it a carbon saving has been failed by the report, not by their own
 * carelessness.
 */
export const NOT_CLAIMABLE: Bilingual[] = [
  {
    en: 'Carbon. Converting verified activity into tCO2e needs an emission factor this platform does not hold, and will not estimate.',
    th: 'คาร์บอน การแปลงกิจกรรมที่ตรวจแล้วเป็น tCO2e ต้องใช้ค่าสัมประสิทธิ์ที่แพลตฟอร์มนี้ไม่มี และจะไม่ประมาณเอาเอง',
  },
  {
    en: 'Independent assurance. Verification is by the host who ran the activity, not by an accredited assurance provider under ISAE 3000.',
    th: 'การรับรองโดยผู้ตรวจสอบอิสระ การตรวจที่นี่ทำโดยผู้จัดกิจกรรม ไม่ใช่ผู้ให้บริการรับรองที่ได้รับการรับรองตาม ISAE 3000',
  },
  {
    en: 'Additionality. Nothing here establishes what would have happened without this funding.',
    th: 'ส่วนเพิ่มที่แท้จริง รายงานนี้ไม่ได้พิสูจน์ว่าถ้าไม่มีการสนับสนุนนี้ จะเกิดอะไรขึ้นหรือไม่',
  },
];

const emptyPillar = (): PillarTotals =>
  ({ verified: 0, participants: 0, paidTHB: 0, activities: 0 });

/**
 * Assemble the report.
 *
 * `activities` must already be filtered to the period by the caller — the
 * database knows the dates and this function does not guess. The period is
 * carried through so the report states its own boundary rather than leaving
 * the reader to assume one.
 */
export function esgReport(
  partner: Sponsor,
  period: EsgPeriod,
  activities: EsgActivity[],
  excludedUnclassified = 0,
): EsgReport {
  const byPillar = {
    environmental: emptyPillar(),
    social: emptyPillar(),
    governance: emptyPillar(),
  } satisfies Record<EsgPillar, PillarTotals>;

  const perPillarPeople: Record<EsgPillar, Set<string>> = {
    environmental: new Set(), social: new Set(), governance: new Set(),
  };
  const everyone = new Set<string>();

  for (const a of activities) {
    const p = byPillar[a.pillar];
    p.verified += a.verified;
    p.paidTHB += a.paidTHB;
    p.activities += 1;
    for (const id of a.participants) {
      perPillarPeople[a.pillar].add(id);
      everyone.add(id);
    }
  }
  for (const pillar of ESG_PILLARS) {
    byPillar[pillar].participants = perPillarPeople[pillar].size;
  }

  return {
    partner,
    period,
    activities,
    byPillar,
    // The union, not the sum. Somebody who joined an environmental and a
    // social activity is one person who did two things.
    participants: everyone.size,
    verified: activities.reduce((n, a) => n + a.verified, 0),
    paidTHB: activities.reduce((n, a) => n + a.paidTHB, 0),
    fundedTHB: activities.reduce((n, a) => n + a.fundedTHB, 0),
    assurance: ASSURANCE,
    notClaimable: NOT_CLAIMABLE,
    boundary: BOUNDARY,
    excludedUnclassified,
  };
}

/**
 * The one line a partner will paste into a deck, written so it cannot mislead.
 *
 * Verified first, people second, money third — and it says "verified by named
 * hosts" inside the sentence rather than trusting a caption to survive the
 * copy-paste. A headline that reads well out of context is the only kind that
 * matters, because out of context is where it will be read.
 */
export function esgHeadline(report: EsgReport): Bilingual {
  if (report.verified === 0) {
    return {
      en: 'No activity has been verified in this period.',
      th: 'ยังไม่มีกิจกรรมที่ผ่านการตรวจในช่วงเวลานี้',
    };
  }
  const people = report.participants;
  const acts = report.verified;
  return {
    en: `${acts} ${acts === 1 ? 'activity' : 'activities'} verified by named hosts, involving ${people} ${people === 1 ? 'person' : 'people'}, with ${report.paidTHB.toLocaleString('en-US')} THB reaching community hosts.`,
    th: `กิจกรรมผ่านการตรวจโดยผู้จัดที่ระบุชื่อได้ ${report.verified} ครั้ง มีผู้ร่วม ${people} คน และเงิน ${report.paidTHB.toLocaleString('en-US')} บาทถึงมือผู้จัดในชุมชน`,
  };
}
