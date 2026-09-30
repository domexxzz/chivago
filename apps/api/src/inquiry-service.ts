/**
 * Listings, and the questions travellers send about them.
 *
 * See `packages/core/src/inquiry.ts` for what an inquiry refuses to be, and
 * `docs/61` for why it is an inquiry rather than a booking. The rules that
 * live HERE are the ones that need the database or the clock:
 *
 *   ONLY A `sent` INQUIRY CAN BE ACTED ON - and "sent" is the DERIVED state,
 *   not the stored one. An inquiry whose window has closed, or whose day has
 *   passed, reads as expired to both sides, and neither side can move it. An
 *   operator answering a question the traveller has already been told went
 *   unanswered would contradict what the traveller was shown.
 *
 *   ONLY THE LISTING'S OWN OPERATOR ANSWERS. Checked against the listing, not
 *   taken from the caller, because an operator id in a form is an operator id
 *   somebody can type.
 *
 *   THE ANSWER AND ITS NOTIFICATION ARE ONE TRANSACTION. The traveller's inbox
 *   row is written with the answer or not at all - the same ordering the
 *   notification outbox was built around, so a slow push can never cost the
 *   answer and an answer can never go unannounced.
 */

import { randomUUID } from 'node:crypto';
import {
  MAX_MESSAGE, incompleteInquiry, inquiryProblems, inquiryState, isListingKind, listingRefusal,
  type Inquiry, type InquiryProblem, type InquiryView, type Listing, type ListingCard,
  type ListingKind, type TravellerInquiry,
} from '@chivago/core';
import { row, rows, transact, type DB } from './db.ts';
import { enqueue } from './notification-service.ts';

// Re-exported so the console, which imported them from here, keeps working.
export type { InquiryView, ListingCard, TravellerInquiry };

export class InvalidInquiry extends Error {
  // Written out rather than as a parameter property: node's strip-only
  // TypeScript cannot run `readonly problems` in a constructor signature.
  readonly problems: InquiryProblem[];

  constructor(message: string, problems: InquiryProblem[] = []) {
    super(message);
    this.name = 'InvalidInquiry';
    this.problems = problems;
  }
}

export class InvalidListing extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidListing';
  }
}

/* ------------------------------------------------------------- listings -- */

interface ListingRow {
  id: string; operator_id: string; operator_name: string; kind: string;
  title_en: string; title_th: string; where_label: string;
  from_thb: number | null; licence_no: string | null; active: number;
}

const toListing = (r: ListingRow): Listing => ({
  id: r.id,
  operatorId: r.operator_id,
  operatorName: r.operator_name,
  kind: r.kind as ListingKind,
  title: { en: r.title_en, th: r.title_th },
  whereLabel: r.where_label,
  fromTHB: r.from_thb,
  licenceNo: r.licence_no,
  active: r.active === 1,
});

const LISTING_SELECT = `
  SELECT l.*, h.name AS operator_name
    FROM listings l JOIN hosts h ON h.id = l.operator_id`;

/**
 * Operators that are examples rather than businesses.
 *
 * `hosts.example`, set deliberately by `add-host.ts --example` and by nothing
 * else. Read as a set because every listing on a page asks the same question
 * about the same few operators.
 */
export function exampleOperators(db: DB): Set<string> {
  return new Set(
    rows<{ id: string }>(db.prepare('SELECT id FROM hosts WHERE example = 1').all()).map((r) => r.id),
  );
}

/** Whether this one operator is an example. */
export function isExampleOperator(db: DB, operatorId: string): boolean {
  return row(db.prepare('SELECT 1 FROM hosts WHERE id = ? AND example = 1').get(operatorId)) !== undefined;
}

export function listingById(db: DB, id: string): Listing | null {
  const r = row<ListingRow>(db.prepare(`${LISTING_SELECT} WHERE l.id = ?`).get(id));
  return r ? toListing(r) : null;
}

/** What a traveller may see: active, and not refused. Newest first. */
export function publicListings(db: DB): Listing[] {
  return rows<ListingRow>(
    db.prepare(`${LISTING_SELECT} WHERE l.active = 1 ORDER BY l.created_at DESC, l.id`).all(),
  ).map(toListing).filter((l) => listingRefusal(l) === null);
}

/** An operator's own listings, paused ones included. */
export function listingsOf(db: DB, operatorId: string): Listing[] {
  return rows<ListingRow>(
    db.prepare(`${LISTING_SELECT} WHERE l.operator_id = ? ORDER BY l.created_at DESC, l.id`)
      .all(operatorId),
  ).map(toListing);
}

export function addListing(
  db: DB,
  args: {
    operatorId: string;
    kind: string;
    titleEn: string;
    titleTh: string;
    whereLabel: string;
    fromTHB?: number | null;
    licenceNo?: string | null;
  },
  now = new Date(),
): Listing {
  if (!row(db.prepare('SELECT id FROM hosts WHERE id = ?').get(args.operatorId))) {
    throw new InvalidListing(`No operator has the id ${args.operatorId}.`);
  }
  if (!isListingKind(args.kind)) throw new InvalidListing(`${args.kind} is not a kind of listing.`);
  const titleEn = args.titleEn.trim();
  const titleTh = args.titleTh.trim();
  const whereLabel = args.whereLabel.trim();
  if (titleEn === '' || titleTh === '') {
    throw new InvalidListing('A listing needs a title in both languages.');
  }
  if (whereLabel === '') throw new InvalidListing('Say where it is.');

  const licenceNo = (args.licenceNo ?? '').trim() || null;
  // Asked here as well as enforced by the table's CHECK, so the operator gets
  // a sentence rather than a constraint error.
  const refusal = listingRefusal({ kind: args.kind, licenceNo });
  if (refusal) throw new InvalidListing(refusal.en);

  const from = args.fromTHB ?? null;
  if (from !== null && (!Number.isInteger(from) || from < 0)) {
    throw new InvalidListing('A “from” price is whole baht, or left empty.');
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO listings (id, operator_id, kind, title_en, title_th, where_label,
       from_thb, licence_no, active, created_at)
     VALUES (?,?,?,?,?,?,?,?,1,?)`,
  ).run(id, args.operatorId, args.kind, titleEn, titleTh, whereLabel, from, licenceNo,
        now.toISOString());
  return listingById(db, id)!;
}

/** Pause or resume. A paused listing takes no new inquiries; old ones are untouched. */
export function setListingActive(db: DB, operatorId: string, listingId: string, active: boolean): void {
  const l = listingById(db, listingId);
  if (!l || l.operatorId !== operatorId) throw new InvalidListing('That is not your listing.');
  db.prepare('UPDATE listings SET active = ? WHERE id = ?').run(active ? 1 : 0, listingId);
}

/* ------------------------------------------------------------ inquiries -- */

interface InquiryRow {
  id: string; listing_id: string; user_id: string; for_date: string; party_size: number;
  message: string; state: string; sent_at: string; answered_at: string | null;
  answer: string | null; quote_thb: number | null;
}

const toInquiry = (r: InquiryRow): Inquiry => ({
  id: r.id,
  listingId: r.listing_id,
  userId: r.user_id,
  forDate: r.for_date,
  partySize: r.party_size,
  message: r.message,
  state: r.state as Inquiry['state'],
  sentAt: r.sent_at,
  answeredAt: r.answered_at,
  answer: r.answer,
  quoteTHB: r.quote_thb,
});

const withState = (i: Inquiry, now: Date): InquiryView => ({ ...i, now: inquiryState(i, now) });

export function inquiryById(db: DB, id: string, now = new Date()): InquiryView | null {
  const r = row<InquiryRow>(db.prepare('SELECT * FROM inquiries WHERE id = ?').get(id));
  return r ? withState(toInquiry(r), now) : null;
}

/** Everything one traveller has asked, newest first. */
export function inquiriesOfTraveller(db: DB, userId: string, now = new Date()): InquiryView[] {
  return rows<InquiryRow>(
    db.prepare('SELECT * FROM inquiries WHERE user_id = ? ORDER BY sent_at DESC, id').all(userId),
  ).map((r) => withState(toInquiry(r), now));
}

/** Everything asked about one operator's listings, newest first. */
export function inquiriesForOperator(db: DB, operatorId: string, now = new Date()): InquiryView[] {
  return rows<InquiryRow>(
    db.prepare(
      `SELECT i.* FROM inquiries i JOIN listings l ON l.id = i.listing_id
        WHERE l.operator_id = ? ORDER BY i.sent_at DESC, i.id`,
    ).all(operatorId),
  ).map((r) => withState(toInquiry(r), now));
}

export function sendInquiry(
  db: DB,
  args: { listingId: string; userId: string; forDate: string; partySize: number; message: string },
  now = new Date(),
): InquiryView {
  const listing = listingById(db, args.listingId);
  // A paused or refused listing is one a traveller should not have been able
  // to reach; answering as if it did not exist is the honest reply.
  if (!listing || !listing.active || listingRefusal(listing) !== null) {
    throw new InvalidInquiry('That listing is not taking questions.');
  }
  const problems = inquiryProblems(args, now);
  if (problems.length > 0) {
    // The message names each problem, not just that there is one. The phone
    // runs the same checks, so reaching this means the two disagree - most
    // often a phone whose clock is off by a day - and "not complete" would
    // leave the traveller nothing to fix.
    throw new InvalidInquiry(incompleteInquiry(problems), problems);
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO inquiries (id, listing_id, user_id, for_date, party_size, message, state, sent_at)
     VALUES (?,?,?,?,?,?,'sent',?)`,
  ).run(id, listing.id, args.userId, args.forDate, args.partySize,
        args.message.trim().slice(0, MAX_MESSAGE), now.toISOString());
  return inquiryById(db, id, now)!;
}

/** The inquiry, if the caller may act on it and it is still open. */
function openForOperator(db: DB, operatorId: string, inquiryId: string, now: Date): InquiryView {
  const i = inquiryById(db, inquiryId, now);
  if (!i) throw new InvalidInquiry('No inquiry has that id.');
  const listing = listingById(db, i.listingId)!;
  if (listing.operatorId !== operatorId) throw new InvalidInquiry('That inquiry is not about your listing.');
  if (i.now !== 'sent') {
    throw new InvalidInquiry(
      i.now === 'expired'
        ? 'This inquiry has expired: the traveller has already been told it went unanswered.'
        : 'This inquiry has already been dealt with.',
    );
  }
  return i;
}

export function answerInquiry(
  db: DB,
  args: { operatorId: string; inquiryId: string; answer: string; quoteTHB?: number | null },
  now = new Date(),
): InquiryView {
  const answer = args.answer.trim();
  if (answer === '' || answer.length > MAX_MESSAGE) {
    throw new InvalidInquiry(`Write an answer, up to ${MAX_MESSAGE} characters.`);
  }
  const quote = args.quoteTHB ?? null;
  if (quote !== null && (!Number.isInteger(quote) || quote < 0)) {
    throw new InvalidInquiry('A quote is whole baht, or left empty.');
  }

  return transact(db, () => {
    const i = openForOperator(db, args.operatorId, args.inquiryId, now);
    const listing = listingById(db, i.listingId)!;
    db.prepare(
      `UPDATE inquiries SET state = 'answered', answered_at = ?, answer = ?, quote_thb = ?
        WHERE id = ?`,
    ).run(now.toISOString(), answer, quote, i.id);
    enqueue(db, {
      userId: i.userId,
      kind: 'inquiry_answered',
      params: { operator: listing.operatorName, listing: listing.title.en, listingTh: listing.title.th },
      data: { screen: 'inquiry', inquiryId: i.id },
      dedupeKey: `inquiry:${i.id}:answered`,
      now,
    });
    return inquiryById(db, i.id, now)!;
  });
}

export function declineInquiry(
  db: DB, args: { operatorId: string; inquiryId: string; reason?: string }, now = new Date(),
): InquiryView {
  return transact(db, () => {
    const i = openForOperator(db, args.operatorId, args.inquiryId, now);
    const listing = listingById(db, i.listingId)!;
    db.prepare(
      `UPDATE inquiries SET state = 'declined', answered_at = ?, answer = ? WHERE id = ?`,
    ).run(now.toISOString(), (args.reason ?? '').trim().slice(0, MAX_MESSAGE) || null, i.id);
    enqueue(db, {
      userId: i.userId,
      kind: 'inquiry_declined',
      params: { operator: listing.operatorName, listing: listing.title.en, listingTh: listing.title.th },
      data: { screen: 'inquiry', inquiryId: i.id },
      dedupeKey: `inquiry:${i.id}:declined`,
      now,
    });
    return inquiryById(db, i.id, now)!;
  });
}

/** The traveller changes their mind. Only while the question is still open. */
export function withdrawInquiry(db: DB, userId: string, inquiryId: string, now = new Date()): InquiryView {
  const i = inquiryById(db, inquiryId, now);
  if (!i || i.userId !== userId) throw new InvalidInquiry('No inquiry of yours has that id.');
  if (i.now !== 'sent') throw new InvalidInquiry('That inquiry is already closed.');
  db.prepare("UPDATE inquiries SET state = 'withdrawn' WHERE id = ?").run(i.id);
  return inquiryById(db, i.id, now)!;
}

/* ------------------------------------------------------- response time -- */

/**
 * The fewest answered inquiries a response time is shown from.
 *
 * Below this it is an anecdote. One quick reply is not "usually answers
 * within an hour", and a traveller reading it as a promise would be misled by
 * a number that was true exactly once.
 */
export const MIN_ANSWERS_FOR_RESPONSE_TIME = 5;

/**
 * How long this operator usually takes to answer, in hours - or null when
 * there is not enough to say.
 *
 * Derived from two timestamps on every read; nothing is stored. The median,
 * not the mean, because one question answered a week late should not make an
 * operator who usually replies in an hour look slow.
 *
 * Declines count, because a fast "we can't" is a fast answer. Withdrawn and
 * expired do not: neither is an operator responding.
 */
export function medianResponseHours(db: DB, operatorId: string): number | null {
  /*
    An example operator has none, however many answers sit behind it.

    Its questions were seeded and its answers were written by whoever seeded
    them, so a median over those is a promise about how fast a business that
    does not exist replies to a traveller. It read "usually answers within 2.5
    hours" on the live server for two days. Refused here rather than in the
    view, so the operator's own console cannot show it either.
  */
  if (isExampleOperator(db, operatorId)) return null;
  const gaps = rows<{ sent_at: string; answered_at: string }>(
    db.prepare(
      `SELECT i.sent_at, i.answered_at FROM inquiries i JOIN listings l ON l.id = i.listing_id
        WHERE l.operator_id = ? AND i.state IN ('answered','declined') AND i.answered_at IS NOT NULL`,
    ).all(operatorId),
  ).map((r) => (Date.parse(r.answered_at) - Date.parse(r.sent_at)) / 3_600_000)
    .sort((a, b) => a - b);
  if (gaps.length < MIN_ANSWERS_FOR_RESPONSE_TIME) return null;
  const mid = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 === 1 ? gaps[mid]! : (gaps[mid - 1]! + gaps[mid]!) / 2;
  return Math.round(median * 10) / 10;
}

/* ------------------------------------------------- the traveller's view -- */

/** What the app lists: public listings, each with its operator's response time. */
export function listingCards(db: DB): ListingCard[] {
  const listings = publicListings(db);
  const examples = exampleOperators(db);
  // Once per operator, not once per listing: an operator with ten listings
  // has one response time.
  const hours = new Map<string, number | null>();
  for (const l of listings) {
    if (!hours.has(l.operatorId)) hours.set(l.operatorId, medianResponseHours(db, l.operatorId));
  }
  return listings.map((l) => ({
    ...l,
    responseHours: hours.get(l.operatorId) ?? null,
    // Absent, not false, on a real operator's listing: the app tests for the
    // key, and a `false` on every listing would be a label nobody asked for.
    ...(examples.has(l.operatorId) ? { example: true as const } : {}),
  }));
}

/**
 * Everything one traveller has asked, with the listing each was about.
 *
 * The listing comes along even when it has since been paused: a traveller
 * who asked about it last week still needs to know what they asked.
 */
export function travellerInquiries(db: DB, userId: string, now = new Date()): TravellerInquiry[] {
  const examples = exampleOperators(db);
  return inquiriesOfTraveller(db, userId, now).map((i) => {
    const l = listingById(db, i.listingId)!;
    return {
      ...i,
      listing: {
        title: l.title, operatorName: l.operatorName, kind: l.kind, whereLabel: l.whereLabel,
        // A question asked of an example is still a question asked of an
        // example, on the traveller's own list, a week later.
        ...(examples.has(l.operatorId) ? { example: true as const } : {}),
      },
    };
  });
}
