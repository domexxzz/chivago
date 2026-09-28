/**
 * A traveller asking an operator a question, and what that is not.
 *
 * `docs/61` is the decision. The short version: the proposal's Travel
 * Marketplace named hotels, tours and INQUIRY FLOWS, and nothing on the
 * platform lets a traveller reach one. Booking is the obvious build and the
 * wrong first one - it takes the traveller's money and sells tours, which are
 * two questions on the lawyer's list that code would otherwise answer
 * silently. An inquiry reserves nothing and moves no money, so it is built,
 * and booking is not.
 *
 * WHAT THIS REFUSES.
 *
 *   AN INQUIRY RESERVES NOTHING. There is no `confirmed` state and there never
 *   will be one here. "Answered" means the operator replied, and the reply is
 *   theirs.
 *
 *   CHIVAGO IS NOT THE SELLER. Price, availability and terms belong to the
 *   operator, and any figure in an answer is the operator's quote with the
 *   operator as the subject of the sentence.
 *
 *   A TOUR IS NOT LISTED WITHOUT A LICENCE NUMBER ITS OPERATOR STATES. Shown as
 *   stated, never as verified, because nobody here can check it.
 *
 *   NOTHING ON A LISTING IS INVENTED. A "from" price is the operator's own
 *   figure or absent - never a plausible number typed in on their behalf.
 */

import type { Bilingual } from './types.ts';

/* ------------------------------------------------------------- listings -- */

/**
 * What an operator offers.
 *
 * `tour` is its own kind rather than folded into `experience` because it
 * carries an obligation the others do not - see `listingRefusal`. Which
 * activities count as a tour is a question for the lawyer, and keeping the
 * category explicit means the answer changes one rule instead of every listing.
 */
export type ListingKind = 'stay' | 'tour' | 'experience' | 'transfer';

export const LISTING_KINDS: readonly ListingKind[] = ['stay', 'tour', 'experience', 'transfer'];

export const isListingKind = (v: string): v is ListingKind =>
  (LISTING_KINDS as readonly string[]).includes(v);

export const LISTING_KIND_LABEL: Record<ListingKind, Bilingual> = {
  stay: { en: 'Stay', th: 'ที่พัก' },
  tour: { en: 'Tour', th: 'ทัวร์' },
  experience: { en: 'Experience', th: 'กิจกรรม' },
  transfer: { en: 'Transfer', th: 'การเดินทาง' },
};

export interface Listing {
  id: string;
  /** The operator: a host with a console login, who answers the inquiries. */
  operatorId: string;
  operatorName: string;
  kind: ListingKind;
  title: Bilingual;
  /** Where, in words the traveller will recognise: "Thong Krut pier". */
  whereLabel: string;
  /**
   * The operator's own "from" price in baht, or null when they have not said.
   * Null and 0 are different answers, exactly as for `Offer.valueTHB`.
   */
  fromTHB: number | null;
  /**
   * The Department of Tourism licence number the operator STATES. Required
   * for a tour; shown as stated, never as verified.
   */
  licenceNo: string | null;
  /** False when the operator has paused it. A paused listing takes no inquiries. */
  active: boolean;
}

/**
 * Why a listing cannot be shown to travellers, or null when nothing here
 * refuses it.
 *
 * Only one rule today, and it is the one that matters: a tour with no stated
 * licence number. A platform that knowingly lists tours from operators who
 * will not even state a licence is a platform the tourism-licence question is
 * already being answered against.
 */
export function listingRefusal(listing: Pick<Listing, 'kind' | 'licenceNo'>): Bilingual | null {
  if (listing.kind === 'tour' && (listing.licenceNo ?? '').trim() === '') {
    return {
      en: 'A tour is not listed until its operator states a Department of Tourism licence number.',
      th: 'ทัวร์จะไม่ถูกแสดงจนกว่าผู้ประกอบการจะระบุเลขใบอนุญาตประกอบธุรกิจนำเที่ยว',
    };
  }
  return null;
}

/** Said beside every licence number, because nobody here checked it. */
export const LICENCE_STATED: Bilingual = {
  en: 'Licence number as stated by the operator. ChivaGo has not verified it.',
  th: 'เลขใบอนุญาตตามที่ผู้ประกอบการระบุ ChivaGo ยังไม่ได้ตรวจสอบ',
};

/* ------------------------------------------------------------ inquiries -- */

/**
 * The states an inquiry is ever WRITTEN in.
 *
 * `expired` is not among them. It is derived on every read - see
 * `inquiryState` - so the window can change without a sweep rewriting rows.
 */
export type StoredInquiryState = 'sent' | 'answered' | 'declined' | 'withdrawn';

/** What the traveller and the operator are shown. There is no `confirmed`. */
export type InquiryState = StoredInquiryState | 'expired';

export interface Inquiry {
  id: string;
  listingId: string;
  userId: string;
  /** The day the traveller is asking about. YYYY-MM-DD. */
  forDate: string;
  partySize: number;
  message: string;
  state: StoredInquiryState;
  sentAt: string;
  /** Set once, by the operator's answer or decline. */
  answeredAt: string | null;
  answer: string | null;
  /** The operator's quote in baht, when they gave one. Theirs, not ours. */
  quoteTHB: number | null;
}

/**
 * How long an operator has to answer before the inquiry reads as expired.
 *
 * Three days because a traveller on a week's holiday who hears nothing for
 * three days has made other plans, and an answer after that is an answer to
 * a question nobody is still asking.
 */
export const ANSWER_WINDOW_DAYS = 3;

const DAY_MS = 86_400_000;

/**
 * What an inquiry is, right now.
 *
 * Unanswered inquiries expire two ways, and either is enough: the operator
 * ran out of the answer window, or the day asked about has already ended. An
 * inquiry about Saturday that is still "sent" on Sunday is not waiting for
 * anything.
 *
 * Only a `sent` inquiry can expire. An answered one was answered; a declined
 * or withdrawn one already ended, and relabelling it expired would lose why.
 */
export function inquiryState(
  inquiry: Pick<Inquiry, 'state' | 'sentAt' | 'forDate'>, now: Date = new Date(),
): InquiryState {
  if (inquiry.state !== 'sent') return inquiry.state;
  // One deadline, computed once, so the page that shows it and the rule that
  // enforces it cannot drift apart. The day asked about ends at the end of
  // that day, island time (UTC+7).
  return now.getTime() > answerBy(inquiry).getTime() ? 'expired' : 'sent';
}

/**
 * The moment an unanswered inquiry stops being answerable.
 *
 * The earlier of the two ways it expires - the window closing, or the day
 * asked about ending on the island - as one instant, so an operator can be
 * told how long they have. Kept beside `inquiryState` so the page can never
 * compute a deadline that disagrees with the rule that enforces it.
 */
export function answerBy(inquiry: Pick<Inquiry, 'sentAt' | 'forDate'>): Date {
  const windowEnds = Date.parse(inquiry.sentAt) + ANSWER_WINDOW_DAYS * DAY_MS;
  const dayEnds = Date.parse(`${inquiry.forDate}T23:59:59.999+07:00`);
  return new Date(Math.min(windowEnds, dayEnds));
}

export const STATE_LABEL: Record<InquiryState, Bilingual> = {
  sent: { en: 'Sent — nothing is reserved', th: 'ส่งแล้ว — ยังไม่มีการจองใดๆ' },
  answered: { en: 'Answered', th: 'ตอบแล้ว' },
  declined: { en: 'Declined by the operator', th: 'ผู้ประกอบการปฏิเสธ' },
  withdrawn: { en: 'Withdrawn', th: 'ถอนคำถามแล้ว' },
  expired: { en: 'No answer in time', th: 'ไม่ได้รับคำตอบทันเวลา' },
};

/* -------------------------------------------------------------- limits -- */

/** Party sizes a single inquiry can ask about. Past this it is a group booking and a phone call. */
export const MAX_PARTY = 20;

/** Long enough to explain a need, short enough to stay a question. */
export const MAX_MESSAGE = 1000;

/** How far ahead a traveller can ask. Past a year, an operator has no answer to give. */
export const MAX_DAYS_AHEAD = 365;

export type InquiryProblem = 'party_size' | 'message' | 'date_format' | 'date_past' | 'date_far';

/**
 * What is wrong with a new inquiry, or an empty list when nothing is.
 *
 * Returns every problem rather than the first, so a form can show them all
 * at once instead of making somebody submit four times to find four mistakes.
 */
export function inquiryProblems(
  input: { forDate: string; partySize: number; message: string },
  now: Date = new Date(),
): InquiryProblem[] {
  const problems: InquiryProblem[] = [];
  if (!Number.isInteger(input.partySize) || input.partySize < 1 || input.partySize > MAX_PARTY) {
    problems.push('party_size');
  }
  const message = input.message.trim();
  if (message === '' || message.length > MAX_MESSAGE) problems.push('message');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.forDate) || Number.isNaN(Date.parse(input.forDate))) {
    problems.push('date_format');
    return problems;
  }
  const endOfDay = Date.parse(`${input.forDate}T23:59:59.999+07:00`);
  if (endOfDay < now.getTime()) problems.push('date_past');
  else if (endOfDay - now.getTime() > MAX_DAYS_AHEAD * DAY_MS) problems.push('date_far');
  return problems;
}

export const PROBLEM_LABEL: Record<InquiryProblem, Bilingual> = {
  party_size: {
    en: `Say how many people, from 1 to ${MAX_PARTY}. A bigger group is a phone call.`,
    th: `ระบุจำนวนคน ตั้งแต่ 1 ถึง ${MAX_PARTY} คน หากมากกว่านั้นควรโทรคุยโดยตรง`,
  },
  message: {
    en: `Write a question for the operator, up to ${MAX_MESSAGE} characters.`,
    th: `เขียนคำถามถึงผู้ประกอบการ ไม่เกิน ${MAX_MESSAGE} ตัวอักษร`,
  },
  date_format: { en: 'Choose the day you are asking about.', th: 'เลือกวันที่ต้องการสอบถาม' },
  date_past: { en: 'That day has already passed.', th: 'วันนั้นผ่านไปแล้ว' },
  date_far: {
    en: `Operators can only answer for the next ${MAX_DAYS_AHEAD} days.`,
    th: `ผู้ประกอบการตอบได้เฉพาะภายใน ${MAX_DAYS_AHEAD} วันข้างหน้า`,
  },
};

/* ------------------------------------------------------ what is said -- */

/**
 * Shown when an inquiry is sent and on every inquiry after. The most
 * important sentence in the module, and it is a refusal.
 */
export const INQUIRY_IS_NOT_A_BOOKING: Bilingual = {
  en: 'This is a question, not a booking. Nothing is reserved and no money moves through '
    + 'ChivaGo. The operator will answer here, and anything you agree is between you and them.',
  th: 'นี่คือการสอบถาม ไม่ใช่การจอง ยังไม่มีการจองใดๆ และไม่มีเงินผ่าน ChivaGo '
    + 'ผู้ประกอบการจะตอบกลับที่นี่ และสิ่งที่ตกลงกันเป็นเรื่องระหว่างคุณกับผู้ประกอบการ',
};

/**
 * The sentence under an operator's answer, with the operator as its subject.
 *
 * A quote is the operator's. Never "the price is", always "X quotes".
 */
export function answerNote(operatorName: string, quoteTHB: number | null): Bilingual {
  const baht = quoteTHB === null ? '' : quoteTHB.toLocaleString('en-US');
  return {
    en: quoteTHB === null
      ? `${operatorName} answered. Nothing is booked until you agree it with them directly, `
        + 'and ChivaGo takes no payment for it.'
      : `${operatorName} answered and quotes ${baht} THB. Nothing is booked until you agree it `
        + 'with them directly, and ChivaGo takes no payment for it.',
    th: quoteTHB === null
      ? `${operatorName} ตอบกลับแล้ว ยังไม่มีการจองจนกว่าคุณจะตกลงกับผู้ประกอบการโดยตรง `
        + 'และ ChivaGo ไม่ได้รับชำระเงินในส่วนนี้'
      : `${operatorName} ตอบกลับแล้ว และเสนอราคา ${baht} บาท ยังไม่มีการจองจนกว่าคุณจะตกลงกับ`
        + 'ผู้ประกอบการโดยตรง และ ChivaGo ไม่ได้รับชำระเงินในส่วนนี้',
  };
}

/**
 * What the operator is told about the traveller, and what they are not.
 *
 * No phone number or email is handed over by the platform. A traveller who
 * wants to share one types it into their own message; that is their choice,
 * made by them.
 */
export const OPERATOR_PRIVACY: Bilingual = {
  en: 'You see the traveller’s question, date and party size. ChivaGo does not give you their '
    + 'phone or email; if they want you to have one, it is in their message.',
  th: 'คุณเห็นคำถาม วันที่ และจำนวนคนของนักท่องเที่ยว ChivaGo ไม่ได้ให้เบอร์โทรหรืออีเมลของเขา '
    + 'หากเขาต้องการให้คุณติดต่อ เขาจะระบุไว้ในข้อความเอง',
};
