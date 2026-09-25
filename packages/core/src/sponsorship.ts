/**
 * What a sponsor's money actually produced.
 *
 * The pitch to a sponsor is easy and the reporting is where it goes wrong.
 * Every platform in this space reports reach, impressions and joins, because
 * those numbers are large and arrive early. This one reports the number the
 * sponsor is actually buying — a quest a host stood behind and signed off —
 * and reports the large numbers beside it, plainly labelled as not that.
 *
 * THE RULE THIS MODULE EXISTS TO ENFORCE: `joined` is not an outcome. A
 * traveller tapping Join has cost the sponsor money and delivered nothing. A
 * dashboard that leads with joins is selling the sponsor their own optimism,
 * and it is the single easiest place in this product to lie.
 *
 * Everything here is derived from counts the ledger already holds. Nothing is
 * estimated, modelled or extrapolated, and the type has no field for reach
 * because there is no honest way to fill one.
 */

import type { Bilingual } from './types.ts';

/**
 * Who funds a quest.
 *
 * `university` and `company` joined the list when the organisations table did:
 * the pilot's first two buyers are a campus and an employer, and folding
 * either into 'brand' would have put a university's engagement report under a
 * marketing heading.
 */
export type SponsorKind = 'brand' | 'government' | 'ngo' | 'municipality' | 'university' | 'company';

/**
 * Whether an agreement actually exists.
 *
 * The sponsor page carried its funding in a constant for months rather than a
 * table, because a row in a database reads as a contract and there were none.
 * The table exists now and this is what makes that safe: 'declared' is
 * somebody's entry with nothing signed behind it, 'signed' is a real
 * agreement, and every page that prints money prints which of the two it is.
 */
export type FundingBasis = 'declared' | 'signed';

export interface Sponsor {
  id: string;
  name: Bilingual;
  kind: SponsorKind;
}

/**
 * One sponsor funding one quest.
 *
 * `fundedTHB` is what they paid. `perVerifiedTHB` is what the host receives
 * each time a submission is approved — so the two numbers together say what
 * the platform keeps, which a sponsor is entitled to know without asking.
 */
export interface Sponsorship {
  sponsorId: string;
  questId: string;
  /** What the agreement says. Typed in by a moderator, and not a receipt. */
  fundedTHB: number;
  /**
   * What actually arrived, in baht.
   *
   * Separate from `fundedTHB` because they are separate facts and only one of
   * them is cash. A pledge nobody has honoured is worth reporting as a pledge;
   * reporting it as money is how a partner page comes to show a balance
   * nobody holds.
   */
  receivedTHB: number;
  /** When the last payment landed, or null while none has. */
  receivedAt: string | null;
  perVerifiedTHB: number;
  /** When this money started being spent. Outcomes before it are not theirs. */
  startedAt: string;
}

/** The counts the ledger can prove, for one sponsored quest. */
export interface QuestCounts {
  questId: string;
  joined: number;
  arrived: number;
  verified: number;
  rejected: number;
  greenPointsIssued: number;
}

export interface SponsorOutcome {
  sponsor: Sponsor;
  fundedTHB: number;
  /** Of that, what has actually arrived. */
  receivedTHB: number;
  /**
   * Pledged and not paid.
   *
   * On its own line rather than folded into anything, because a sponsor whose
   * report shows work delivered against money they have not sent should see
   * that said plainly, and so should we.
   */
  owedBySponsorTHB: number;
  /**
   * THB EARNED by hosts, counted from approvals — never from budget.
   *
   * Earned, not "reached". Whether it was disbursed is a third fact this
   * system does not hold either, and the headline no longer says it did.
   */
  toCommunityTHB: number;
  /**
   * Money in hand that no outcome has claimed yet.
   *
   * Counted from what ARRIVED, not from what was pledged. It used to be
   * `funded - earned`, which described a sum nobody had sent as one being
   * held. Zero when the work has already earned more than the sponsor has
   * paid — which is not a rounding case but a real state, and the console
   * says so when it happens.
   */
  unspentTHB: number;
  joined: number;
  arrived: number;
  verified: number;
  rejected: number;
  greenPointsIssued: number;
  /** Null while nothing has been verified: dividing by zero is not a price. */
  costPerVerifiedTHB: number | null;
  /**
   * How many joins ended in an approved submission.
   *
   * Reported because a sponsor should see it fall. A quest that everybody
   * starts and nobody finishes is a quest that needs changing, and hiding that
   * ratio is how a platform keeps billing for it.
   */
  completionRate: number | null;
  /** Said out loud on every report. See `UNMEASURED`. */
  notMeasured: Bilingual[];
}

/**
 * The things this report will never contain, stated on the report.
 *
 * A sponsor reading a number is entitled to know which numbers are missing.
 * Saying so is also the honest answer to "why is your engagement figure lower
 * than everyone else's" — because everyone else is counting these.
 */
export const UNMEASURED: Bilingual[] = [
  {
    en: 'Reach and impressions. Nobody is tracked, so there is no number to give.',
    th: 'การเข้าถึงและการมองเห็น ไม่มีการติดตามผู้ใช้ จึงไม่มีตัวเลขให้',
  },
  {
    en: 'Sales attributed to this quest. A voucher redeemed is counted; a purchase made afterwards is not.',
    th: 'ยอดขายที่เกิดจากภารกิจนี้ นับเฉพาะคูปองที่ถูกใช้ ไม่นับการซื้อที่เกิดขึ้นหลังจากนั้น',
  },
  {
    en: 'Brand sentiment. Not measured, and not inferable from any of the above.',
    th: 'ความรู้สึกต่อแบรนด์ ไม่ได้วัด และอนุมานจากตัวเลขข้างต้นไม่ได้',
  },
];

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Add up one sponsor's quests.
 *
 * Pure, so the same counts always produce the same report and a sponsor can be
 * handed the arithmetic rather than asked to trust it.
 */
export function sponsorOutcome(
  sponsor: Sponsor,
  sponsorships: Sponsorship[],
  counts: QuestCounts[],
): SponsorOutcome {
  const mine = sponsorships.filter((s) => s.sponsorId === sponsor.id);
  const byQuest = new Map(counts.map((c) => [c.questId, c]));

  let fundedTHB = 0;
  let receivedTHB = 0;
  let toCommunityTHB = 0;
  const total = { joined: 0, arrived: 0, verified: 0, rejected: 0, greenPointsIssued: 0 };

  for (const s of mine) {
    fundedTHB += s.fundedTHB;
    receivedTHB += s.receivedTHB;
    const c = byQuest.get(s.questId);
    if (!c) continue;
    total.joined += c.joined;
    total.arrived += c.arrived;
    total.verified += c.verified;
    total.rejected += c.rejected;
    total.greenPointsIssued += c.greenPointsIssued;
    // Counted from approvals, and capped by what was actually funded: a quest
    // cannot pay out more than its sponsor put in, and a report that showed it
    // doing so would be describing a debt rather than a contribution.
    toCommunityTHB += Math.min(c.verified * s.perVerifiedTHB, s.fundedTHB);
  }

  return {
    sponsor,
    fundedTHB,
    receivedTHB,
    owedBySponsorTHB: Math.max(0, fundedTHB - receivedTHB),
    toCommunityTHB,
    unspentTHB: Math.max(0, receivedTHB - toCommunityTHB),
    ...total,
    costPerVerifiedTHB: total.verified > 0 ? round2(toCommunityTHB / total.verified) : null,
    completionRate: total.joined > 0 ? round2(total.verified / total.joined) : null,
    notMeasured: UNMEASURED,
  };
}

/**
 * One line a sponsor can read without the table.
 *
 * Leads with verified, names the cost, and puts joins last — the opposite
 * order to how this is usually sold, and the order the money is actually in.
 */
export function sponsorHeadline(o: SponsorOutcome): Bilingual {
  if (o.verified === 0) {
    return {
      en: `Nothing verified yet. ${o.joined} started; ${o.receivedTHB.toLocaleString('en-US')} THB received and unspent.`,
      th: `ยังไม่มีภารกิจที่ผ่านการตรวจ เริ่มแล้ว ${o.joined} ครั้ง เงินที่รับมาแล้วและยังไม่ถูกใช้ ${o.receivedTHB.toLocaleString('en-US')} บาท`,
    };
  }
  return {
    en: `${o.verified} verified, ${o.toCommunityTHB.toLocaleString('en-US')} THB earned by hosts, `
      + `${o.costPerVerifiedTHB} THB each. ${o.joined} started.`,
    th: `ผ่านการตรวจ ${o.verified} ครั้ง ผู้จัดได้รับสิทธิ์ ${o.toCommunityTHB.toLocaleString('en-US')} บาท `
      + `เฉลี่ยครั้งละ ${o.costPerVerifiedTHB} บาท เริ่มแล้ว ${o.joined} ครั้ง`,
  };
}
