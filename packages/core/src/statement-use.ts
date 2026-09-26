/**
 * An organisation declaring that it used one of our statements in a disclosure.
 *
 * WHY THIS EXISTS. A carbon registry closes the loop with RETIREMENT: when a
 * unit is used to support a claim, the registry takes it out of circulation so
 * nobody can use it twice. Registries can do that because they hold the unit.
 * We hold nothing. A statement is a page and a digest; anyone who has the id
 * can paste the figures into anything.
 *
 * So this is not retirement and is not named after it. It is a DECLARATION,
 * and its whole value is that it makes a second use VISIBLE rather than
 * impossible. Two organisations declaring the same record is exactly the
 * situation that ought to be discoverable, and today it is not discoverable
 * at all.
 *
 * WHICH DOUBLE COUNTING THIS IS. There are three and they are different.
 * `DOUBLE_COUNTING_BOUNDARY` below says which one this addresses, which one
 * `claims.ts` addresses, and which one cannot arise here. Getting that wrong
 * in either direction - claiming more coverage than we have, or leaving a
 * reader to guess - is the failure mode this module was written to avoid.
 *
 * FOUR THINGS THIS REFUSES.
 *
 *   IT DOES NOT PREVENT A SECOND USE. Nothing here locks a statement. A
 *   declaration is a record somebody chose to make, and it stops nobody.
 *
 *   NO DECLARATION IS NOT EVIDENCE OF NO USE. A statement with one
 *   declaration on it has not been shown to be used once. It has been shown
 *   to be declared once. Everything else is unobserved, and the page says so
 *   whether or not anybody asks.
 *
 *   THE DECLARER IS THE ONE CLAIMING. We record that an organisation said it
 *   used this record. We did not read their report, and we are not saying
 *   the use was appropriate. Same discipline as `countersign.ts`: the subject
 *   of every sentence is whoever made the claim.
 *
 *   A DECLARATION NAMES A VERSION. It carries the digest the statement had
 *   when it was declared, so a declaration cannot drift onto a record it was
 *   never about.
 */

import type { Bilingual } from './types.ts';

/**
 * What the statement was used in.
 *
 * Thai reality first: 56-1 One Report is the filing that actually compels a
 * listed company to say something. `other` is not a catch-all for laziness -
 * it exists so a declarer with an honest fifth answer does not have to pick
 * the nearest wrong one, and the page prints their own words beside it.
 */
export type DisclosureKind =
  | 'one_report'
  | 'sustainability_report'
  | 'ifrs_s'
  | 'internal'
  | 'other';

export const DISCLOSURE_LABEL: Record<DisclosureKind, Bilingual> = {
  one_report: {
    en: '56-1 One Report filed with the SEC',
    th: 'แบบ 56-1 One Report ที่ยื่นต่อ ก.ล.ต.',
  },
  sustainability_report: {
    en: 'A sustainability report published by the organisation',
    th: 'รายงานความยั่งยืนที่องค์กรเผยแพร่เอง',
  },
  ifrs_s: {
    en: 'An IFRS S1 / S2 sustainability disclosure',
    th: 'การเปิดเผยข้อมูลความยั่งยืนตาม IFRS S1 / S2',
  },
  internal: {
    en: 'An internal report, not published',
    th: 'รายงานภายใน ไม่ได้เผยแพร่',
  },
  other: {
    en: 'Something else, described by the declarer',
    th: 'กรณีอื่น ตามที่ผู้แจ้งระบุ',
  },
};

/**
 * The same five, phrased to sit inside a sentence.
 *
 * A second map rather than lowercasing the label, because lowercasing turns
 * "56-1 One Report filed with the SEC" into "56-1 one report filed with the
 * sec". A filing's name is a proper noun and mangling it makes the sentence
 * read as though nobody checked it - on the one page where a reader is
 * deciding whether anybody checked anything.
 */
export const DISCLOSURE_PHRASE: Record<DisclosureKind, Bilingual> = {
  one_report: {
    en: 'the 56-1 One Report it filed with the SEC',
    th: 'แบบ 56-1 One Report ที่ยื่นต่อ ก.ล.ต.',
  },
  sustainability_report: {
    en: 'a sustainability report it published',
    th: 'รายงานความยั่งยืนที่เผยแพร่เอง',
  },
  ifrs_s: {
    en: 'an IFRS S1 / S2 sustainability disclosure',
    th: 'การเปิดเผยข้อมูลความยั่งยืนตาม IFRS S1 / S2',
  },
  internal: {
    en: 'an internal report it did not publish',
    th: 'รายงานภายในที่ไม่ได้เผยแพร่',
  },
  other: {
    en: 'something else it described',
    th: 'กรณีอื่นตามที่ระบุไว้',
  },
};

export interface StatementUse {
  id: string;
  statementId: string;
  /** The digest the statement carried when this was declared. */
  digest: string;
  /** The organisation that says it used the record. */
  orgId: string;
  /** Both languages, because the page that shows it prints both. */
  orgName: Bilingual;
  kind: DisclosureKind;
  /** The reporting period of THEIR report, not of our statement. */
  reportingYear: number;
  /** Where it appears, in the declarer's words: a section, a page, a table. */
  placeNote: string | null;
  declaredAt: string;
  declaredBy: string | null;
  withdrawnAt: string | null;
  withdrawnReason: string | null;
}

export type UseStanding = 'applies' | 'withdrawn' | 'digest_mismatch';

/**
 * Whether this declaration is about the record it is shown beside.
 *
 * Digest before withdrawal, for the same reason as `signatureStanding`: a
 * declaration made about different bytes was never this record's to withdraw,
 * and calling it withdrawn would imply it once applied here.
 */
export function useStanding(use: StatementUse, digest: string): UseStanding {
  if (use.digest !== digest) return 'digest_mismatch';
  return use.withdrawnAt === null ? 'applies' : 'withdrawn';
}

/**
 * The declarations that stand against this exact record.
 *
 * Deliberately not called `activeUses`: what comes back is the set that
 * APPLIES, and whether that set is a problem is the reader's call, not ours.
 */
export function standingUses(
  uses: readonly StatementUse[], digest: string,
): StatementUse[] {
  return uses.filter((u) => useStanding(u, digest) === 'applies');
}

/**
 * How many distinct organisations have declared this record.
 *
 * Counted by organisation, not by declaration: one company naming the same
 * statement in its One Report and again in its sustainability report is one
 * organisation reporting its own activity twice, which is its business. Two
 * companies naming it is the thing worth seeing.
 */
export function declaringOrgs(
  uses: readonly StatementUse[], digest: string,
): string[] {
  const seen = new Set<string>();
  for (const u of standingUses(uses, digest)) seen.add(u.orgId);
  return [...seen];
}

/**
 * What one declaration says, with the declarer as the subject.
 */
export function useNote(use: StatementUse, standing: UseStanding): Bilingual {
  const { en: org, th: orgTh } = use.orgName;
  if (standing === 'digest_mismatch') {
    return {
      en: `${org} declared a different version of this record, so their declaration is not about this page.`,
      th: `${orgTh} แจ้งใช้เอกสารฉบับอื่น การแจ้งนี้จึงไม่เกี่ยวกับหน้านี้`,
    };
  }
  if (standing === 'withdrawn') {
    return {
      en: `${org} has withdrawn this declaration. It is kept because it was once made.`,
      th: `${orgTh} ได้ถอนการแจ้งนี้แล้ว บันทึกยังคงอยู่เพราะเคยมีการแจ้งไว้จริง`,
    };
  }
  return {
    en: `${org} states it used this record in ${DISCLOSURE_PHRASE[use.kind].en} `
      + `for ${use.reportingYear}. ChivaGo has not read that report and is not saying the use was appropriate.`,
    th: `${orgTh} ระบุว่าได้นำเอกสารฉบับนี้ไปใช้ใน${DISCLOSURE_PHRASE[use.kind].th} `
      + `ของปี ${use.reportingYear} ChivaGo ไม่ได้อ่านรายงานนั้น และไม่ได้ระบุว่าการนำไปใช้นั้นเหมาะสม`,
  };
}

/**
 * The line that appears when more than one organisation has declared it.
 *
 * It does not call this fraud and it does not call it fine. Two companies can
 * legitimately describe the same community activity - a co-funder and a host,
 * say - and they can also both be counting it as theirs alone. Only their two
 * reports side by side settle that, and we have neither. So this says what is
 * observed and names what the reader has to go and check.
 */
export function contestedNote(orgCount: number): Bilingual | null {
  if (orgCount < 2) return null;
  return {
    en: `${orgCount} organisations have declared this same record. That is not by itself wrong - `
      + 'a co-funder and a host may each have reason to describe the same activity - but each '
      + 'report should say what share it is describing, and this platform cannot tell you whether they do.',
    th: `มี ${orgCount} องค์กรแจ้งใช้เอกสารฉบับเดียวกันนี้ ซึ่งไม่ได้ผิดในตัวเอง `
      + 'ผู้ร่วมสนับสนุนและผู้จัดกิจกรรมอาจมีเหตุให้กล่าวถึงกิจกรรมเดียวกันได้ '
      + 'แต่รายงานแต่ละฉบับควรระบุว่ากำลังกล่าวถึงสัดส่วนเท่าใด และแพลตฟอร์มนี้บอกไม่ได้ว่าเขาระบุไว้หรือไม่',
  };
}

/**
 * Shipped with every declaration, including on a statement that has none.
 *
 * The second sentence is the one that matters, and it is the one a reader
 * would otherwise supply wrongly for themselves.
 */
export const USE_LIMIT: Bilingual = {
  en: 'A declaration is a record somebody chose to make. It does not lock this statement, and '
    + 'no declaration on this page does not mean the statement went unused - it means nobody told us.',
  th: 'การแจ้งใช้เป็นบันทึกที่ผู้แจ้งเลือกแจ้งเอง ไม่ได้ล็อกเอกสารฉบับนี้ '
    + 'และการที่หน้านี้ไม่มีการแจ้ง ไม่ได้หมายความว่าเอกสารไม่ถูกนำไปใช้ เพียงแต่ไม่มีใครแจ้งเรามา',
};

/**
 * The three kinds of double counting, and which of them this platform touches.
 *
 * Written out because "we prevent double counting" is a sentence that means
 * three different things, and a buyer who hears it will assume whichever one
 * they were worried about.
 */
export const DOUBLE_COUNTING_BOUNDARY: Bilingual = {
  en: 'Double issuance cannot arise here: nothing is issued as a tradable unit, so there is no '
    + 'second unit to create. Double claiming at the funding step is addressed where funding is '
    + 'recorded - a quest funded by two sponsors reads as shared, never as either one’s alone. '
    + 'Double use, the same record appearing in two organisations’ reports, is only made VISIBLE '
    + 'by the declarations on this page, and only when somebody declares.',
  th: 'การออกเครดิตซ้ำเกิดขึ้นที่นี่ไม่ได้ เพราะไม่มีการออกหน่วยใดให้ซื้อขาย จึงไม่มีหน่วยที่สองให้สร้าง '
    + 'การอ้างสิทธิซ้ำในขั้นการให้ทุนถูกจัดการที่จุดที่บันทึกการให้ทุน ภารกิจที่มีสองผู้สนับสนุนจะแสดงว่าร่วมกัน '
    + 'ไม่ใช่ของฝ่ายใดฝ่ายเดียว ส่วนการนำไปใช้ซ้ำ คือเอกสารฉบับเดียวปรากฏในรายงานของสององค์กร '
    + 'หน้านี้ทำได้เพียงทำให้ "เห็น" ผ่านการแจ้งใช้ และเห็นได้เฉพาะเมื่อมีผู้แจ้งเท่านั้น',
};

export const isDisclosureKind = (v: string): v is DisclosureKind =>
  v === 'one_report' || v === 'sustainability_report' || v === 'ifrs_s'
  || v === 'internal' || v === 'other';
