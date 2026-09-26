/**
 * Money that reached a local business, and the three things it is not.
 *
 * The framework note of 26 September puts "รายได้หรือยอดซื้อที่ถึงชุมชน" under
 * the S pillar, and it is the indicator a partner asks for first — the one
 * figure that says a cleanup paid for somebody's afternoon rather than just
 * filling a bin. Until the market carried a baht value at all, this platform
 * could not produce it in any form.
 *
 * It can now produce ONE of the four things that phrase could mean, and the
 * distance between them is the whole point of this file.
 *
 *   IT IS the face value of vouchers a merchant actually scanned. A voucher
 *   issued and never used bought nobody anything, so only redemptions count.
 *
 *   IT IS NOT what the traveller spent. A 120-baht voucher against a 400-baht
 *   dinner brought 400 baht through that door, and nothing here saw the bill.
 *   Reporting the voucher as the spend understates it; reporting a guessed
 *   basket would be inventing a number, which is worse.
 *
 *   IT IS NOT revenue. A discount the merchant funded is a cost to them, not
 *   income, and which of the two it is depends on an agreement this platform
 *   does not hold.
 *
 *   IT IS NOT additional. Somebody who would have bought the coffee anyway
 *   still redeems the voucher — the same question `esg.ts` refuses on
 *   additionality, for the same reason.
 *
 * UNPRICED IS COUNTED, NEVER ZEROED. An offer nobody has put a price on is a
 * gap in the record, and folding it in at zero would turn that gap into a
 * claim that it was worth nothing. It is reported beside the total in the
 * same shape `esgReport` uses for unclassified activity.
 */

import type { Bilingual } from './types.ts';

/** The fields of a voucher this calculation is allowed to see. */
export interface RedeemableVoucher {
  valueTHB: number | null;
  redeemedAt: string | null;
}

export interface CommunityValue {
  /** Face value of redeemed vouchers that carried a price. */
  redeemedTHB: number;
  /** How many redemptions that total is built from. */
  priced: number;
  /**
   * Redemptions whose offer carried no price, and which are therefore in NO
   * figure above. Reported rather than absorbed.
   */
  unpriced: number;
  /** Issued and never scanned. Bought nobody anything. */
  unredeemed: number;
  /** What the total is, and what it is not. Printed with it. */
  boundary: Bilingual;
}

export function communityValue(vouchers: readonly RedeemableVoucher[]): CommunityValue {
  const redeemed = vouchers.filter((v) => v.redeemedAt !== null);
  const priced = redeemed.filter((v) => v.valueTHB !== null);
  const redeemedTHB = priced.reduce((n, v) => n + (v.valueTHB ?? 0), 0);

  return {
    redeemedTHB,
    priced: priced.length,
    unpriced: redeemed.length - priced.length,
    unredeemed: vouchers.length - redeemed.length,
    boundary: boundaryFor(redeemed.length - priced.length),
  };
}

const boundaryFor = (unpriced: number): Bilingual => {
  const en = 'Face value of vouchers a merchant scanned. Not what the traveller spent, '
    + 'not the merchant’s revenue, and not evidence that the purchase would not have happened anyway.';
  const th = 'มูลค่าหน้าคูปองที่ร้านค้าสแกนรับแล้ว ไม่ใช่ยอดที่นักเดินทางจ่ายจริง '
    + 'ไม่ใช่รายได้ของร้าน และไม่ได้พิสูจน์ว่าการซื้อนั้นจะไม่เกิดขึ้นอยู่แล้ว';
  if (unpriced === 0) return { en, th };
  return {
    en: `${en} ${unpriced} redemption${unpriced === 1 ? '' : 's'} had no price on the offer `
      + 'and are in none of these figures.',
    th: `${th} มีอีก ${unpriced} รายการที่ข้อเสนอไม่ได้ระบุราคาไว้ จึงไม่ถูกนับในตัวเลขใดเลย`,
  };
};
