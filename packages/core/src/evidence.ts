/**
 * The pack an assurance provider actually asks for.
 *
 * `esg.ts` says plainly that nothing here is independent assurance under
 * ISAE 3000, and that stays true. What this module does is the next most
 * useful thing: make assurance CHEAP. An assurer's fee is mostly the cost of
 * sampling - pick twenty approvals out of four hundred, then chase somebody
 * for three weeks to see the proof behind each one. Every line here comes back
 * with its date, its named reviewer, its photograph count and its weight, so
 * the chase is a page instead of a month.
 *
 * THE PART THAT IS NOT A CONVENIENCE. A statement is immutable by design: the
 * table refuses UPDATE, and the digest is recomputed on every read. The rows
 * BEHIND it are not immutable - a proof can be withdrawn afterwards, a quest
 * can be deleted, an approval can be reversed. So a pack that simply listed
 * today's rows beside a statement filed in March would be quietly inviting the
 * reader to assume they still match.
 *
 * They are therefore RECONCILED, and the answer is printed whether or not it
 * is the comfortable one. A statement that no longer matches its evidence is
 * the single most important thing an assurer can be told, and it is the one
 * thing no system that stores a report as a PDF can ever say.
 *
 * NO NAMES. The pack carries a pseudonym per participant, stable inside one
 * statement and worthless outside it, so an assurer can see that twelve
 * approvals were twelve different people without learning who any of them
 * are. The statement itself never carried people at all; this is the smallest
 * step from that which still supports a sample.
 */

import type { Bilingual } from './types.ts';
import type { StatementBody } from './statement.ts';

/**
 * Whether the approval behind a line still stands today.
 *
 * `EvidenceStanding`, not `Standing`: `standing.ts` next door already owns
 * that word for a traveller's public rank, and one barrel exports both.
 */
export type EvidenceStanding = 'approved' | 'withdrawn' | 'gone';

export interface EvidenceItem {
  questId: string;
  questName: Bilingual;
  /** UTC day of the approval, matching the statement's line. */
  day: string;
  verifiedAt: string;
  /** The person at the host who approved it, when the console recorded one. */
  reviewedBy: string | null;
  /** Stable inside this statement, meaningless outside it. Never a user id. */
  participantRef: string;
  photos: number;
  weightKg: number | null;
  standing: EvidenceStanding;
}

export interface Reconciliation {
  /** The count the statement was issued with. */
  stated: number;
  /** Approvals that still stand today. */
  standing: number;
  /** Approvals the host has since withdrawn. */
  withdrawn: number;
  /** Lines the statement counted whose row is no longer there at all. */
  gone: number;
  /** Approvals that exist now and were not in the statement. */
  appeared: number;
  /** True only when every count above lines up. */
  agrees: boolean;
  verdict: Bilingual;
}

/**
 * Compare what was filed with what is there now.
 *
 * `appeared` is counted and reported rather than quietly added. Work approved
 * after a statement was issued is real work - it simply is not in THAT
 * statement, and a pack that folded it in would be amending an immutable
 * document from the outside.
 */
export function reconcile(statement: StatementBody, items: readonly EvidenceItem[]): Reconciliation {
  const standing = items.filter((i) => i.standing === 'approved').length;
  const withdrawn = items.filter((i) => i.standing === 'withdrawn').length;
  const gone = items.filter((i) => i.standing === 'gone').length;
  const appeared = Math.max(0, standing - statement.verified + withdrawn + gone);
  const agrees = withdrawn === 0 && gone === 0 && appeared === 0 && standing === statement.verified;

  return {
    stated: statement.verified,
    standing,
    withdrawn,
    gone,
    appeared,
    agrees,
    verdict: agrees
      ? {
        en: `All ${statement.verified} approvals in this statement still stand, unchanged since it was issued.`,
        th: `ทั้ง ${statement.verified} รายการในเอกสารนี้ยังคงอยู่ ไม่มีการเปลี่ยนแปลงตั้งแต่วันที่ออก`,
      }
      : {
        en: `This statement was issued with ${statement.verified} approvals. `
          + `${standing} still stand, ${withdrawn} have been withdrawn since, `
          + `${gone} no longer have a record, and ${appeared} were approved after it was issued `
          + 'and are not part of it.',
        th: `เอกสารนี้ออกโดยนับ ${statement.verified} รายการ ปัจจุบันยังคงอยู่ ${standing} รายการ `
          + `ถูกเพิกถอนไปแล้ว ${withdrawn} รายการ ไม่พบบันทึกอีก ${gone} รายการ `
          + `และมีอีก ${appeared} รายการที่ผ่านการตรวจหลังวันที่ออก ซึ่งไม่ได้อยู่ในเอกสารนี้`,
      },
  };
}

/**
 * What this pack is for, said on it.
 *
 * An assurer who mistakes a sampling aid for an opinion has been failed by the
 * document, not by their own carelessness - the same rule `esg.ts` applies to
 * its own figures.
 */
export const SAMPLING_NOTE: Bilingual = {
  en: 'This pack supports sampling. It is evidence, not an opinion: every line names the '
    + 'host reviewer who approved it, and nobody here has audited that reviewer.',
  th: 'ชุดหลักฐานนี้ใช้สำหรับการสุ่มตรวจ เป็นหลักฐาน ไม่ใช่ความเห็น ทุกบรรทัดระบุชื่อผู้ตรวจของผู้จัด '
    + 'และไม่มีผู้ใดในที่นี้ได้ตรวจสอบผู้ตรวจรายนั้น',
};

/**
 * Where this sits on the team's own ladder.
 *
 * The framework note circulated on 26 September grades evidence in four
 * levels: self-reported, digital traces, partner-verified, third-party
 * checked. EVERYTHING THIS PLATFORM PRODUCES IS LEVEL 3 - a named host
 * approved it - and no amount of tooling moves it to 4 by itself.
 *
 * What the pack does is make level 4 affordable, which is a different claim
 * and a smaller one. Saying which rung it is on belongs on the document, for
 * the same reason `esg.ts` prints what it will not claim.
 */
export const EVIDENCE_LEVEL: Bilingual = {
  en: 'Level 3 of four: approved by the partner who ran the activity. Level 4 is a third party '
    + 'checking that approval, which this pack supports and does not perform.',
  th: 'ระดับ 3 จาก 4 ผู้จัดกิจกรรมที่ระบุชื่อได้เป็นผู้ตรวจและอนุมัติ ส่วนระดับ 4 คือบุคคลที่สามเข้ามาตรวจการอนุมัตินั้น '
    + 'ซึ่งชุดหลักฐานนี้รองรับให้ทำได้ แต่ไม่ได้ทำแทน',
};

export const EVIDENCE_PRIVACY: Bilingual = {
  en: 'Participants appear as a reference that is stable inside this statement and meaningless '
    + 'outside it. It cannot be resolved to a person, and cannot be matched against another statement.',
  th: 'ผู้เข้าร่วมแสดงเป็นรหัสอ้างอิงที่คงที่ภายในเอกสารนี้ และไม่มีความหมายนอกเอกสาร '
    + 'ไม่สามารถย้อนกลับไปหาตัวบุคคล และไม่สามารถจับคู่กับเอกสารฉบับอื่นได้',
};
