/**
 * One activity, one filer.
 *
 * THE PROBLEM NOBODY IN THIS FIELD CAN SOLVE, AND WE CAN. Two companies fund
 * the same beach cleanup. Each writes its own sustainability report from its
 * own records, and both report the cleanup. Neither is lying; neither can see
 * the other. The activity is counted twice in the world and once in each
 * filing, and no amount of care inside either company finds it — the evidence
 * that would find it is in the other company's spreadsheet.
 *
 * It is found here because both partners fund through the same ledger. That is
 * the one thing a shared platform has that a consultant does not, and it is
 * worth more than any figure this product computes.
 *
 * WHAT IS DECIDED, AND WHAT IS NOT. This module answers whether an approved
 * submission could be claimed by exactly one partner. It does NOT split a
 * shared one between them. Splitting would need to know whose baht paid for
 * which cleanup, and nothing knows that — a 50/50 rule would be an invented
 * attribution wearing the clothes of arithmetic, which is precisely the move
 * this codebase refuses everywhere else.
 *
 * So a shared activity is DISCLOSED rather than divided. An auditor who is
 * told "nine of these forty are also in another partner's report" can act on
 * that. An auditor handed 4.5 cannot.
 *
 * PER SUBMISSION, NOT PER QUEST. A quest funded by one partner in January and
 * co-funded from March has exclusive January submissions and shared ones
 * after. The dates to decide it with are already held: `verified_at` on the
 * approval, `started_at` on each funding line.
 */

import type { Bilingual } from './types.ts';

/** A funding line, reduced to the two facts that decide a claim. */
export interface Funder {
  sponsorId: string;
  /** When this money started being spent. ISO-8601. */
  startedAt: string;
}

export type ClaimState = 'exclusive' | 'shared' | 'unfunded';

/**
 * Who was funding this quest when the submission was approved.
 *
 * Inclusive of the start instant: money that started being spent at noon paid
 * for an approval at noon. A funding line that began AFTER the approval did
 * not pay for it, and is not counted against it — which is what makes a
 * partner joining later unable to dilute the exclusivity of work that was
 * already done and already claimed.
 */
export function fundersAt(funders: readonly Funder[], verifiedAt: string): string[] {
  const at = Date.parse(verifiedAt);
  const active = funders.filter((f) => Date.parse(f.startedAt) <= at).map((f) => f.sponsorId);
  return [...new Set(active)].sort();
}

/**
 * Whether one approval can be claimed by one filer.
 *
 * `unfunded` is its own answer rather than folded into `exclusive`: an
 * approval nobody was funding is not a claim anybody can make, and calling it
 * exclusive would hand it to whoever asked first.
 */
export function claimState(funders: readonly Funder[], verifiedAt: string): ClaimState {
  const active = fundersAt(funders, verifiedAt);
  if (active.length === 0) return 'unfunded';
  return active.length === 1 ? 'exclusive' : 'shared';
}

/** The other partners who could report the same approval. Empty when exclusive. */
export function alsoClaimedBy(
  funders: readonly Funder[], verifiedAt: string, mine: string,
): string[] {
  const active = fundersAt(funders, verifiedAt);
  return active.length <= 1 ? [] : active.filter((id) => id !== mine);
}

/**
 * What the report says about exclusivity, which is a claim in itself.
 *
 * The exclusive wording is deliberately the stronger of the two, because it is
 * the sentence a filer cannot get anywhere else and the one an assurance
 * provider will read first. It is also the sentence that has to be earned: it
 * is only produced when every approval in the report had exactly one funder.
 */
export function exclusivityNote(shared: number, total: number): Bilingual {
  if (total === 0) {
    return {
      en: 'No approved activity in this period, so nothing here is claimed by anybody.',
      th: 'ไม่มีกิจกรรมที่ผ่านการตรวจในช่วงนี้ จึงไม่มีสิ่งใดถูกนับโดยผู้ใด',
    };
  }
  if (shared === 0) {
    return {
      en: `Every one of these ${total} approvals was funded by this partner alone, `
        + 'so none of it appears in another partner’s report from this platform.',
      th: `ทั้ง ${total} รายการที่ผ่านการตรวจนี้ พันธมิตรรายนี้สนับสนุนเพียงรายเดียว `
        + 'จึงไม่ปรากฏซ้ำในรายงานของพันธมิตรรายอื่นบนแพลตฟอร์มนี้',
    };
  }
  return {
    en: `${shared} of these ${total} approvals were co-funded, and may also appear in `
      + 'another partner’s report. They are not divided here: nothing knows whose '
      + 'money paid for which, and a split would be an invented attribution.',
    th: `${shared} จาก ${total} รายการที่ผ่านการตรวจนี้ มีผู้สนับสนุนมากกว่าหนึ่งราย `
      + 'และอาจปรากฏในรายงานของพันธมิตรรายอื่นด้วย รายงานนี้ไม่แบ่งสัดส่วนให้ '
      + 'เพราะไม่มีข้อมูลใดบอกได้ว่าเงินของใครจ่ายให้รายการไหน การแบ่งจึงเป็นการกำหนดเอง',
  };
}

/**
 * The limit of the guarantee, shipped beside it.
 *
 * Exclusivity is provable ACROSS THIS PLATFORM and nowhere else. The same
 * cleanup may sit in a filing written from a spreadsheet we cannot see, and a
 * report that let "claimed by one partner" be read as "claimed once in the
 * world" would be making the larger claim while proving the smaller one.
 */
export const EXCLUSIVITY_BOUNDARY: Bilingual = {
  en: 'Exclusivity is established across partners reporting through this platform. '
    + 'It cannot speak for a claim made outside it.',
  th: 'ความเป็นสิทธิ์เฉพาะรายนี้ตรวจสอบได้เฉพาะในกลุ่มพันธมิตรที่รายงานผ่านแพลตฟอร์มนี้ '
    + 'ไม่ครอบคลุมการอ้างสิทธิ์ที่เกิดขึ้นนอกแพลตฟอร์ม',
};
