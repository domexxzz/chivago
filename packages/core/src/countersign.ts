/**
 * An assurance provider's signature on a statement we issued.
 *
 * `esg.ts` has said since it was written that verification here is by the host
 * who ran the activity, and that this is NOT independent assurance under
 * ISAE 3000. That stays true and this does not change it. What it changes is
 * that a real assurer can now attach their own opinion to a specific record,
 * and the platform can carry that opinion without ever having made it.
 *
 * It is rung four of the ladder in `evidence-level.ts`, which until now
 * could never be reached because nothing could hold somebody else's opinion.
 *
 * FOUR THINGS THIS REFUSES, and they are why it is safe to build at all.
 *
 *   IT DOES NOT CHECK THE SIGNER. Nobody here can confirm an accreditation.
 *   The firm and the standard are what the signer stated, and the record
 *   says so on its face - the same distinction `basis` draws between a
 *   funding figure somebody typed and one with a contract behind it.
 *
 *   IT DOES NOT CHANGE THE STATEMENT. The figures, the digest and the page
 *   are exactly what they were. A signature is an ATTACHED fact, not a
 *   correction, and a statement with an adverse opinion on it still says
 *   what it always said.
 *
 *   IT IS BOUND TO ONE DIGEST. A signature names the digest it was given,
 *   and if the record it is shown beside does not carry that digest the
 *   signature reads as NOT APPLYING rather than quietly transferring.
 *
 *   AN OPINION CAN BE WITHDRAWN, AND WITHDRAWING IS NOT DELETING. The row
 *   stays, the withdrawal is recorded beside it, and both are shown.
 */

import type { Bilingual } from './types.ts';

/**
 * What was performed. `other` exists because a signer whose engagement was
 * not ISAE 3000 must be able to say so rather than pick the nearest label.
 */
export type AssuranceStandard = 'isae3000_limited' | 'isae3000_reasonable' | 'other';

/**
 * The four conclusions an assurance report can carry.
 *
 * All four, including the three nobody wants. A platform that only modelled
 * `unmodified` would be a platform where a qualified opinion had nowhere to
 * go, which is how a qualification quietly becomes a clean one.
 */
export type AssuranceOpinion = 'unmodified' | 'modified' | 'adverse' | 'disclaimer';

export const STANDARD_LABEL: Record<AssuranceStandard, Bilingual> = {
  isae3000_limited: {
    en: 'ISAE 3000 · limited assurance',
    th: 'ISAE 3000 · ความเชื่อมั่นอย่างจำกัด',
  },
  isae3000_reasonable: {
    en: 'ISAE 3000 · reasonable assurance',
    th: 'ISAE 3000 · ความเชื่อมั่นอย่างสมเหตุสมผล',
  },
  other: {
    en: 'Another engagement, stated by the signer',
    th: 'งานตรวจสอบรูปแบบอื่น ตามที่ผู้ลงนามระบุ',
  },
};

export const OPINION_LABEL: Record<AssuranceOpinion, Bilingual> = {
  unmodified: { en: 'Unmodified', th: 'ไม่มีเงื่อนไข' },
  modified: { en: 'Modified', th: 'มีเงื่อนไข' },
  adverse: { en: 'Adverse', th: 'ไม่ถูกต้อง' },
  disclaimer: { en: 'Disclaimer of conclusion', th: 'ไม่แสดงข้อสรุป' },
};

/** How the signature reached us. There is only one route today, and it is named. */
export type SignatureChannel = 'entered_by_staff';

export const CHANNEL_LABEL: Record<SignatureChannel, Bilingual> = {
  entered_by_staff: {
    en: 'Entered by ChivaGo staff from a signed report supplied by the firm. '
      + 'The signer did not enter it here.',
    th: 'บันทึกโดยทีมงาน ChivaGo จากรายงานที่ลงนามแล้วซึ่งสำนักงานส่งมา '
      + 'ผู้ลงนามไม่ได้เป็นผู้กรอกในระบบนี้',
  },
};

export interface Countersignature {
  id: string;
  statementId: string;
  /** The digest as it was given to the signer. */
  digest: string;
  signerName: string;
  signerFirm: string;
  standard: AssuranceStandard;
  opinion: AssuranceOpinion;
  /** What the engagement covered, in the signer's words. */
  scopeNote: string | null;
  channel: SignatureChannel;
  recordedAt: string;
  recordedBy: string | null;
  withdrawnAt: string | null;
  withdrawnReason: string | null;
}

export type SignatureStanding = 'applies' | 'withdrawn' | 'digest_mismatch';

/**
 * Whether this signature applies to the record it is shown beside.
 *
 * The digest is checked before the withdrawal, on purpose: a signature given
 * for a different record was never this record's to withdraw, and reporting
 * it as withdrawn would imply it once applied.
 */
export function signatureStanding(sig: Countersignature, digest: string): SignatureStanding {
  if (sig.digest !== digest) return 'digest_mismatch';
  return sig.withdrawnAt === null ? 'applies' : 'withdrawn';
}

/**
 * What the platform is saying by carrying this, said on the page.
 *
 * Never "this statement is assured". The subject of every sentence is the
 * SIGNER, because they are the one making the claim.
 */
export function signatureNote(sig: Countersignature, standing: SignatureStanding): Bilingual {
  const firm = sig.signerFirm;
  if (standing === 'digest_mismatch') {
    return {
      en: `${firm} signed a different version of this record, so their conclusion does not apply here.`,
      th: `${firm} ลงนามกับเอกสารฉบับอื่น ข้อสรุปของสำนักงานจึงไม่ครอบคลุมเอกสารฉบับนี้`,
    };
  }
  if (standing === 'withdrawn') {
    return {
      en: `${firm} has withdrawn this conclusion. It is kept on the record because it was once given.`,
      th: `${firm} ได้ถอนข้อสรุปนี้แล้ว บันทึกยังคงอยู่เพราะเคยมีการให้ข้อสรุปไว้จริง`,
    };
  }
  return {
    en: `${firm} states it performed ${STANDARD_LABEL[sig.standard].en} on this record and reached `
      + `a ${OPINION_LABEL[sig.opinion].en.toLowerCase()} conclusion. ChivaGo did not perform it and `
      + 'has not verified the firm’s accreditation.',
    th: `${firm} ระบุว่าได้ปฏิบัติงาน ${STANDARD_LABEL[sig.standard].th} กับเอกสารฉบับนี้ `
      + `และให้ข้อสรุป${OPINION_LABEL[sig.opinion].th} ChivaGo ไม่ได้เป็นผู้ปฏิบัติงาน `
      + 'และไม่ได้ตรวจสอบการขึ้นทะเบียนของสำนักงาน',
  };
}

/**
 * The limit, shipped with every signature.
 *
 * Separate from the note above because it is true of all of them, including
 * the unmodified ones, and especially those.
 */
export const COUNTERSIGNATURE_LIMIT: Bilingual = {
  en: 'ChivaGo records this conclusion; it does not make it, check the firm’s accreditation, '
    + 'or change any figure in the statement. The statement says exactly what it said before.',
  th: 'ChivaGo เป็นผู้บันทึกข้อสรุปนี้ ไม่ได้เป็นผู้ให้ข้อสรุป ไม่ได้ตรวจสอบการขึ้นทะเบียนของสำนักงาน '
    + 'และไม่ได้เปลี่ยนตัวเลขใดในเอกสาร เอกสารยังคงระบุสิ่งเดิมทุกประการ',
};

export const isAssuranceStandard = (v: string): v is AssuranceStandard =>
  v === 'isae3000_limited' || v === 'isae3000_reasonable' || v === 'other';

export const isAssuranceOpinion = (v: string): v is AssuranceOpinion =>
  v === 'unmodified' || v === 'modified' || v === 'adverse' || v === 'disclaimer';
