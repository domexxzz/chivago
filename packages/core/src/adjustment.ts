/**
 * A partner standing down from a claim, so another partner can make it.
 *
 * WHERE THIS CAME FROM. `claims.ts` settled that a co-funded activity is
 * DISCLOSED rather than divided, because splitting needs to know whose baht
 * paid for which cleanup and nothing knows that. The framework note wanted
 * proportions assigned. `docs/59` recorded the disagreement as unresolved and
 * said the code held the stricter reading.
 *
 * The carbon-market note supplied the third option neither side had. Where two
 * parties could claim the same mitigation, the standards do not halve it and
 * do not merely disclose it: one side applies a CORRESPONDING ADJUSTMENT and
 * subtracts it from their own account entirely. Somebody stands down.
 *
 * That is buildable here without inventing any arithmetic, because it is not
 * arithmetic. It is a statement by the partner who is giving the claim up.
 *
 * WHAT THIS IS NOT, AND THE NAME IS THE RISK.
 *
 *   IT IS NOT AN ARTICLE 6 CORRESPONDING ADJUSTMENT. That is an adjustment to
 *   a country's greenhouse gas inventory, made by a government, under a treaty.
 *   This is one company telling us it is not counting a beach cleanup. The
 *   mechanism is borrowed; the authority is not, and `NOT_ARTICLE_SIX` says so
 *   wherever this is shown.
 *
 *   IT CREATES NOTHING. It only removes a competing claim. An adjustment on a
 *   quest with one funder does not make somebody else's report richer - it
 *   leaves the activity claimed by NOBODY, and `relinquished` exists so that
 *   state has a name instead of being rounded to the nearest convenient one.
 *
 *   IT IS THE STANDING-DOWN PARTNER'S STATEMENT, NOT THE BENEFICIARY'S. The
 *   whole value collapses if the partner who gains the exclusivity can record
 *   it. Staff enter it from something the relinquishing partner supplied, the
 *   record says so on its face, and nobody here confirmed it.
 *
 *   IT DOES NOT MAKE A SHARED ACTIVITY UNSHARED IN THE REPORT'S OWN WORDS. An
 *   approval that became exclusive this way is counted apart from one that was
 *   exclusive all along, because "funded by this partner alone" would be false
 *   about it. See `exclusivityNote` in `claims.ts`.
 *
 * RESUMING IS NOT VOIDING, AND THE DIFFERENCE IS THE POINT. A partner who
 * stood down for 2026 and claims again from 2027 has not undone 2026 - a
 * filing was made on it. A record entered by mistake, though, must come out
 * retroactively, or one typo permanently strips a partner's claim. So there
 * are two ways for an adjustment to stop applying and they behave differently.
 */

import { fundersAt, type Funder } from './claims.ts';
import type { Bilingual } from './types.ts';

/** How the statement reached us. One route today, and it is named. */
export type AdjustmentChannel = 'entered_by_staff';

export const ADJUSTMENT_CHANNEL_LABEL: Record<AdjustmentChannel, Bilingual> = {
  entered_by_staff: {
    en: 'Entered by ChivaGo staff from a written statement supplied by the partner standing down. '
      + 'That partner did not enter it here, and ChivaGo did not witness it.',
    th: 'บันทึกโดยทีมงาน ChivaGo จากหนังสือที่พันธมิตรผู้สละสิทธิ์ส่งมา '
      + 'พันธมิตรรายนั้นไม่ได้เป็นผู้กรอกในระบบนี้ และ ChivaGo ไม่ได้เป็นพยาน',
  },
};

export interface ClaimAdjustment {
  id: string;
  /** The partner giving the claim up. Never the one who gains by it. */
  orgId: string;
  questId: string;
  /** Approvals verified at or after this instant are given up. ISO-8601. */
  effectiveFrom: string;
  /** Why, in the relinquishing partner's words. */
  reason: string | null;
  channel: AdjustmentChannel;
  recordedAt: string;
  recordedBy: string | null;
  /**
   * When this partner began claiming again. NOT retroactive: approvals inside
   * the window stay given up, because a filing was made on them.
   */
  resumedAt: string | null;
  resumedReason: string | null;
  /**
   * When this record was found to be wrong. RETROACTIVE: it never applied to
   * anything, because one mistyped id must not permanently strip a claim.
   */
  voidedAt: string | null;
  voidedReason: string | null;
}

/**
 * Whether this adjustment gives up an approval verified at this instant.
 *
 * Voided is checked first and unconditionally: a record that should never have
 * existed did not apply to anything, whatever its dates say.
 *
 * The window is closed at the start and open at the end, exactly like
 * `fundersAt`: money that started at noon paid for an approval at noon, and a
 * partner who resumed at noon is claiming an approval verified at noon.
 */
export function adjustmentApplies(adj: ClaimAdjustment, verifiedAt: string): boolean {
  if (adj.voidedAt !== null) return false;
  const at = Date.parse(verifiedAt);
  if (at < Date.parse(adj.effectiveFrom)) return false;
  return adj.resumedAt === null || at < Date.parse(adj.resumedAt);
}

/**
 * The partners who were funding this approval AND have not stood down from it.
 *
 * Built on `fundersAt` rather than beside it, so a partner who stood down from
 * a quest they never funded changes nothing - there was no claim to give up.
 */
export function claimingFundersAt(
  funders: readonly Funder[],
  adjustments: readonly ClaimAdjustment[],
  verifiedAt: string,
): string[] {
  const active = fundersAt(funders, verifiedAt);
  const stoodDown = new Set(
    adjustments.filter((a) => adjustmentApplies(a, verifiedAt)).map((a) => a.orgId),
  );
  return active.filter((id) => !stoodDown.has(id));
}

/**
 * What one approval's claim looks like once stand-downs are taken into account.
 *
 * `relinquished` is the state this module exists to be able to say. It means
 * somebody WAS funding the activity and nobody is claiming it, which is not
 * the same as `unfunded` - where nobody was funding it at all - and must not
 * be rounded into `exclusive` just because one name is left standing after the
 * others withdrew. There is no name left standing. That is the point.
 */
export type AdjustedClaimState = 'exclusive' | 'exclusive_by_adjustment' | 'shared'
  | 'relinquished' | 'unfunded';

export function adjustedClaimState(
  funders: readonly Funder[],
  adjustments: readonly ClaimAdjustment[],
  verifiedAt: string,
): AdjustedClaimState {
  const active = fundersAt(funders, verifiedAt);
  if (active.length === 0) return 'unfunded';
  const claiming = claimingFundersAt(funders, adjustments, verifiedAt);
  if (claiming.length === 0) return 'relinquished';
  if (claiming.length > 1) return 'shared';
  // One claimant. Whether that is a fact about the funding or a fact about a
  // partner's letter is a difference the report is not allowed to lose.
  return active.length === 1 ? 'exclusive' : 'exclusive_by_adjustment';
}

export const CLAIM_STATE_LABEL: Record<AdjustedClaimState, Bilingual> = {
  exclusive: { en: 'Sole funder', th: 'ผู้สนับสนุนรายเดียว' },
  exclusive_by_adjustment: { en: 'Sole claimant, by a partner standing down', th: 'ผู้อ้างสิทธิ์รายเดียว โดยมีพันธมิตรสละสิทธิ์' },
  shared: { en: 'Co-funded', th: 'ร่วมสนับสนุน' },
  relinquished: { en: 'Claimed by nobody', th: 'ไม่มีผู้อ้างสิทธิ์' },
  unfunded: { en: 'Unfunded', th: 'ไม่มีผู้สนับสนุน' },
};

/**
 * What the platform is saying by carrying one of these, with the relinquishing
 * partner as the subject of the sentence.
 */
export function adjustmentNote(adj: ClaimAdjustment, partnerName: Bilingual): Bilingual {
  const from = adj.effectiveFrom.slice(0, 10);
  if (adj.voidedAt !== null) {
    return {
      en: `This record was withdrawn as an error and never applied to any approval. `
        + 'It is kept visible because it was once entered.',
      th: 'บันทึกนี้ถูกเพิกถอนเพราะลงผิด และไม่เคยมีผลกับรายการใด '
        + 'ยังคงแสดงไว้เพราะเคยมีการบันทึกจริง',
    };
  }
  const until = adj.resumedAt === null
    ? { en: 'onwards', th: 'เป็นต้นไป' }
    : { en: `until ${adj.resumedAt.slice(0, 10)}`, th: `ถึง ${adj.resumedAt.slice(0, 10)}` };
  return {
    en: `${partnerName.en} states it is not claiming this quest's verified activity from `
      + `${from} ${until.en}. ChivaGo records that statement; it did not witness it, and it `
      + 'has not asked any other partner whether they agree.',
    th: `${partnerName.th} ระบุว่าจะไม่อ้างสิทธิ์กิจกรรมที่ผ่านการตรวจของภารกิจนี้ ตั้งแต่ `
      + `${from} ${until.th} ChivaGo เป็นผู้บันทึกข้อความนั้น ไม่ได้เป็นพยาน `
      + 'และไม่ได้สอบถามพันธมิตรรายอื่นว่าเห็นด้วยหรือไม่',
  };
}

/**
 * The borrowed name, handed back at the door.
 *
 * Same discipline as refusing to call a declared use a retirement. A reader
 * who knows what a Corresponding Adjustment is under Article 6 must not take
 * this for one, and a reader who does not must not be left to assume.
 */
export const NOT_ARTICLE_SIX: Bilingual = {
  en: 'The mechanism is borrowed from Article 6, where a government adjusts its own national '
    + 'greenhouse gas inventory under a treaty. Nothing of the kind happens here. This is one '
    + 'organisation stating it will not count an activity in its own reporting, recorded so '
    + 'another organisation can say the activity is not also in somebody else’s.',
  th: 'กลไกนี้ยืมแนวคิดมาจาก Article 6 ซึ่งเป็นการที่รัฐบาลปรับบัญชีก๊าซเรือนกระจกของประเทศตนตามสนธิสัญญา '
    + 'ที่นี่ไม่มีสิ่งนั้นเกิดขึ้น นี่คือการที่องค์กรหนึ่งระบุว่าจะไม่นับกิจกรรมหนึ่งในรายงานของตน '
    + 'และถูกบันทึกไว้เพื่อให้อีกองค์กรหนึ่งระบุได้ว่ากิจกรรมนั้นไม่ได้อยู่ในรายงานของผู้อื่นด้วย',
};

/** Shipped with every adjustment, including the ones that look tidy. */
export const ADJUSTMENT_LIMIT: Bilingual = {
  en: 'A stand-down removes a claim; it never creates one. It does not move money, does not '
    + 'change who funded anything, and does not make the activity this partner gave up belong '
    + 'to anybody else unless exactly one other partner was funding it.',
  th: 'การสละสิทธิ์เป็นการถอนการอ้างสิทธิ์ ไม่ใช่การสร้างขึ้นใหม่ ไม่ได้โยกย้ายเงิน '
    + 'ไม่ได้เปลี่ยนว่าใครเป็นผู้สนับสนุน และไม่ได้ทำให้กิจกรรมที่สละไปตกเป็นของผู้ใด '
    + 'เว้นแต่มีพันธมิตรอีกรายเดียวที่สนับสนุนอยู่',
};
