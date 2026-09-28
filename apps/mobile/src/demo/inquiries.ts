/**
 * The demo's one example operator, and the questions asked of it.
 *
 * docs/61 first said the demo would show the empty list. On 28 September the
 * owner chose otherwise, for the reason `DEMO_INVITES` exists in server.ts: a
 * judge who opens "Stays & tours" and finds a correct, empty list learns
 * nothing about the feature. So the demo carries ONE operator, made up, and
 * `example: true` puts "Example · not a real business" on its listings and on
 * every question about them. The real API never sets that flag.
 *
 * WHAT IT STILL REFUSES.
 *
 *   Nothing answers a question the visitor sends. An answer is a person's
 *   reply and there is no person behind this operator; inventing one in
 *   response to the visitor would be the demo claiming a business wrote back -
 *   the same line server.ts holds for a party that "accepts". The question
 *   stays sent, which is what it would be on the real app until a human
 *   answered.
 *
 *   The one answered question on screen is seeded HISTORY, the way `PRIOR`
 *   is: asked the day before the visitor opened the demo, answered then, and
 *   marked as an example like everything else about this operator. It is
 *   there so the answered state - the quote under the operator's own name,
 *   and "nothing is booked" - can be seen without waiting for anybody.
 *
 * The rules are the real ones. `inquiryProblems` decides what may be sent and
 * `incompleteInquiry` says why not, in the server's words; `listingRefusal`
 * still stands between a tour and the list; `inquiryState` derives what each
 * question reads as now. All of it in memory, and gone on reload.
 */

import {
  MAX_MESSAGE, incompleteInquiry, inquiryProblems, inquiryState, islandDateKey, listingRefusal,
  type Inquiry, type InquiryView, type ListingCard, type TravellerInquiry,
} from '@chivago/core';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Made up, and the name says so too, in case a label is ever missed. */
const OPERATOR = { operatorId: 'demo-operator', operatorName: 'Example Co-op' } as const;

export const DEMO_LISTINGS: readonly ListingCard[] = [
  {
    ...OPERATOR,
    id: 'demo-listing-boat',
    kind: 'tour',
    title: { en: 'Longtail boat to Koh Taen', th: 'เรือหางยาวไปเกาะแตน' },
    whereLabel: 'Thong Krut pier',
    // No price stated, so the screen shows its refusal to invent one.
    fromTHB: null,
    // A tour is listed only with a stated licence number. All zeros, so it can
    // neither be mistaken for a real operator's licence nor collide with one.
    licenceNo: '00/00000',
    active: true,
    responseHours: 3,
    example: true,
  },
  {
    ...OPERATOR,
    id: 'demo-listing-room',
    kind: 'stay',
    title: { en: 'Garden room near Lamai', th: 'ห้องพักติดสวน ใกล้หาดละไม' },
    whereLabel: 'Lamai',
    // And a stated one, so both honest readings of a price are on screen.
    fromTHB: 1200,
    licenceNo: null,
    active: true,
    responseHours: 3,
    example: true,
  },
];

/** What the demo server turns into an answer or a refusal. */
export type DeskAnswer<T> = { ok: true; value: T } | { ok: false; code: string; error: string };

const refused = (error: string): DeskAnswer<never> => ({ ok: false, code: 'INVALID_INQUIRY', error });

/** Asked the day before the visitor arrived, and answered three hours later. */
function history(opened: Date): Inquiry {
  const sentAt = new Date(opened.getTime() - 26 * HOUR_MS);
  return {
    id: 'demo-inquiry-history',
    listingId: 'demo-listing-boat',
    userId: 'demo-user',
    forDate: islandDateKey(new Date(opened.getTime() + 2 * DAY_MS)),
    partySize: 2,
    message: 'Two of us, in the morning if the sea is calm. Is that possible?',
    state: 'answered',
    sentAt: sentAt.toISOString(),
    answeredAt: new Date(sentAt.getTime() + 3 * HOUR_MS).toISOString(),
    answer: 'Yes. The boat leaves the pier at 8:00 and is back by noon. If the sea is rough we move it to the next calm day.',
    quoteTHB: 1800,
  };
}

export function createInquiryDesk(opened: Date = new Date()) {
  const listingById = new Map(DEMO_LISTINGS.map((l) => [l.id, l]));
  const asked: Inquiry[] = [history(opened)];
  let seq = 0;

  const view = (i: Inquiry, now: Date): InquiryView => ({ ...i, now: inquiryState(i, now) });

  return {
    /** What the real `listingCards` would list: active, and not refused. */
    listings: (): ListingCard[] =>
      DEMO_LISTINGS.filter((l) => l.active && listingRefusal(l) === null).map((l) => ({ ...l })),

    /** This sitting's questions, newest first, as the server orders them. */
    mine: (now: Date = new Date()): TravellerInquiry[] =>
      [...asked]
        .sort((a, b) => b.sentAt.localeCompare(a.sentAt) || a.id.localeCompare(b.id))
        .map((i) => {
          const l = listingById.get(i.listingId)!;
          return {
            ...view(i, now),
            listing: {
              title: l.title, operatorName: l.operatorName, kind: l.kind,
              whereLabel: l.whereLabel, example: l.example,
            },
          };
        }),

    ask(listingId: string, body: Record<string, unknown>, now: Date = new Date()): DeskAnswer<InquiryView> {
      const listing = listingById.get(listingId);
      if (!listing || !listing.active || listingRefusal(listing) !== null) {
        return refused('That listing is not taking questions.');
      }
      const input = {
        forDate: String(body.forDate ?? ''),
        partySize: Number(body.partySize),
        message: String(body.message ?? ''),
      };
      const problems = inquiryProblems(input, now);
      if (problems.length > 0) return refused(incompleteInquiry(problems));

      const inquiry: Inquiry = {
        id: `demo-inquiry-${++seq}`,
        listingId,
        userId: 'demo-user',
        forDate: input.forDate,
        partySize: input.partySize,
        message: input.message.trim().slice(0, MAX_MESSAGE),
        state: 'sent',
        sentAt: now.toISOString(),
        answeredAt: null,
        answer: null,
        quoteTHB: null,
      };
      asked.push(inquiry);
      return { ok: true, value: view(inquiry, now) };
    },

    withdraw(id: string, now: Date = new Date()): DeskAnswer<InquiryView> {
      const inquiry = asked.find((i) => i.id === id);
      if (!inquiry) return refused('No inquiry of yours has that id.');
      if (inquiryState(inquiry, now) !== 'sent') return refused('That inquiry is already closed.');
      inquiry.state = 'withdrawn';
      return { ok: true, value: view(inquiry, now) };
    },
  };
}
