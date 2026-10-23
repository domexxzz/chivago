/**
 * A business asking to list, before anybody has said yes.
 *
 * WHY AN APPLICATION AND NOT AN ACCOUNT. `docs/62` says the first two steps
 * of taking on an operator are the owner's and no software can do them:
 * choosing a business whose owner you have spoken to, and seeing the licence
 * for a tour. A form that handed out a console key on submit would be
 * software doing both of them badly - a stranger could mint an account that
 * puts a claim in somebody else's name in front of travellers.
 *
 * So this is the thing a stranger CAN create: a request, holding nothing but
 * what they typed, which gives them no login, no listing and no presence in
 * the app. The account is created by a person approving it, and only then.
 *
 * WHAT AN APPLICATION IS NOT:
 *
 *   NOT A VERIFICATION. Every field here is typed by the applicant and
 *   checked by nobody. The licence number is held exactly as a listing's is -
 *   as STATED - and `LICENCE_STATED` is printed beside it wherever it is
 *   shown.
 *
 *   NOT A BUSINESS IN THE APP. Until an approval creates the host row, no
 *   screen anywhere can read this. An application is not a half-listed
 *   operator; it is a conversation that has not happened yet.
 *
 *   NOT A PROMISE. Refusing is an ordinary outcome and carries a reason,
 *   because a business that filled in a form is owed a sentence either way.
 */

import { listingRefusal, type ListingKind } from './inquiry.ts';
import type { Bilingual } from './types.ts';

/**
 * The states an application is written in. There is no 'withdrawn': an
 * applicant who changes their mind is a phone call, and modelling it would
 * mean holding a way for a stranger to reach back into the row.
 */
export type ApplicationState = 'pending' | 'approved' | 'rejected';

export const APPLICATION_STATE_LABEL: Record<ApplicationState, Bilingual> = {
  pending: { en: 'Waiting', th: 'รอพิจารณา' },
  approved: { en: 'Approved', th: 'อนุมัติแล้ว' },
  rejected: { en: 'Not taken up', th: 'ไม่รับ' },
};

/** What the applicant typed. Every field of it. */
export interface OperatorApplicationInput {
  /**
   * The business's own name, in one field and in whatever script the owner
   * writes it. Not split into Thai and English: `hosts.name` is one column,
   * and asking a trader at Thong Krut pier to translate their own name is
   * asking them to do work for our schema.
   */
  businessName: string;
  kind: ListingKind;
  /** Where it operates, in their words: "Thong Krut pier". */
  whereLabel: string;
  contactName: string;
  /** How to reach them to have the conversation `docs/62` step 1 requires. */
  contactPhone: string;
  contactEmail: string | null;
  /**
   * The Department of Tourism licence number they STATE. Required for a tour
   * by the same rule a listing is refused under, and never verified here.
   */
  licenceNo: string | null;
  /** Anything else they want to say. Optional, and read by a person. */
  note: string | null;
}

export interface OperatorApplication extends OperatorApplicationInput {
  id: string;
  state: ApplicationState;
  submittedAt: string;
  decidedAt: string | null;
  /** The person who decided, by the name they signed in under. */
  decidedBy: string | null;
  /** Why it was refused. Required on a refusal, null otherwise. */
  reason: string | null;
  /** The operator account an approval created. Null until there is one. */
  hostId: string | null;
}

/**
 * Field limits.
 *
 * A public form writes rows, so the lengths are refused rather than
 * truncated: silently cutting a business name at 120 characters stores a
 * different name than the one the owner typed, and they would never know.
 */
export const APPLICATION_LIMITS = {
  businessName: 120,
  whereLabel: 120,
  contactName: 120,
  contactPhone: 40,
  contactEmail: 160,
  licenceNo: 60,
  note: 600,
} as const;

const blank = (v: string | null | undefined): boolean => (v ?? '').trim().length === 0;

/** Nine digits is the shortest a Thai mobile or landline gets, +66 form included. */
const digitCount = (v: string): number => (v.match(/\d/g) ?? []).length;

/**
 * Everything wrong with an application, in both languages, or an empty list.
 *
 * A LIST, not the first problem. A form that reports one error at a time
 * makes somebody submit five times to find out it wanted a phone number, and
 * the person filling this in is a business owner on a phone between two other
 * things.
 */
export function applicationProblems(input: OperatorApplicationInput): Bilingual[] {
  const problems: Bilingual[] = [];

  if (blank(input.businessName)) {
    problems.push({ en: 'The business needs a name.', th: 'ต้องระบุชื่อธุรกิจ' });
  }
  if (blank(input.whereLabel)) {
    problems.push({ en: 'Say where you operate.', th: 'ต้องระบุว่าให้บริการที่ไหน' });
  }
  if (blank(input.contactName)) {
    problems.push({ en: 'Give a name we can ask for.', th: 'ต้องระบุชื่อผู้ติดต่อ' });
  }
  if (digitCount(input.contactPhone ?? '') < 9) {
    problems.push({
      en: 'Give a phone number we can call.',
      th: 'ต้องระบุเบอร์โทรที่ติดต่อได้',
    });
  }
  if (!blank(input.contactEmail) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail!.trim())) {
    problems.push({ en: 'That email address is not readable.', th: 'อีเมลไม่ถูกต้อง' });
  }

  // The same sentence a listing is refused with, from the same function: a
  // tour that cannot state a licence is refused at the door rather than
  // approved into an account whose first listing is then refused.
  const licence = listingRefusal({ kind: input.kind, licenceNo: input.licenceNo });
  if (licence) problems.push(licence);

  for (const [field, limit] of Object.entries(APPLICATION_LIMITS)) {
    const value = input[field as keyof typeof APPLICATION_LIMITS];
    if ((value ?? '').length > limit) {
      problems.push({
        en: `Keep ${field} to ${limit} characters or fewer.`,
        th: `ช่องนี้ยาวเกิน ${limit} ตัวอักษร`,
      });
    }
  }

  return problems;
}

/**
 * Printed on the form, above the button.
 *
 * The applicant is told what submitting does before they do it, because what
 * it does is less than a form usually does: it starts a conversation, and
 * somebody will ring them.
 */
export const APPLICATION_NOT_A_YES: Bilingual = {
  en: 'Sending this does not create an account. Somebody will call you, and for a tour will ask to see the licence, before anything of yours appears in the app.',
  th: 'การส่งแบบฟอร์มนี้ยังไม่ได้เปิดบัญชี จะมีคนโทรติดต่อคุณ และถ้าเป็นทัวร์จะขอดูใบอนุญาตก่อน จึงจะมีข้อมูลของคุณขึ้นในแอป',
};
