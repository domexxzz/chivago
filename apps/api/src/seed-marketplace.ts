/**
 * Sample operators and listings for the Travel Marketplace, so the screen has
 * something to show while you build against it. docs/61.
 *
 * A DEVELOPMENT TOOL, AND ONLY THAT. The real app invents no operator - the
 * demo build carries one made-up "Example Co-op", labelled "not a real
 * business" wherever it shows (docs/61 stage after three), and a test holds
 * the real API to never marking a listing `example`. This script fills a
 * DEVELOPER'S LOCAL database so the Ask screen and the console are walkable
 * while building; it is not the demo build's operator and it must never run
 * against the pilot. The guard below refuses the production volume for exactly
 * that reason.
 *
 * WHY THIS IS NOT IN THE CONTENT SEED. `seed-db.ts` loads the real Koh Samui
 * pilot: places that exist, quests a named host vouches for. A listing is a
 * business's own claim - its price, its licence, its "we run this". The Ask
 * screen refuses to invent one precisely because a fabricated listing is a
 * claim made in a real operator's name. So this content lives in its own
 * script, off the seed the pilot ships, and every operator it writes SAYS it
 * is a demo in its name - the same honesty `seed-showcase.ts` keeps for a
 * seeded traveller.
 *
 * WHAT IT WRITES, SAID PLAINLY
 *
 *   Two fictional operators whose display names begin "DEMO ·", six listings
 *   they "offer", one demo traveller, and a handful of inquiries between them
 *   - some answered with a quote, one declined, two still waiting. Nothing
 *   here is a real business, a real price or a real Department of Tourism
 *   licence: the licence numbers are literally "DEMO/000n", which is what the
 *   Ask screen will show, "as stated, never verified".
 *
 * IT IS SAFE TO RE-RUN. No DELETE anywhere. Operators and listings are written
 * with fixed ids and ON CONFLICT DO UPDATE, exactly as the content seed writes
 * places; inquiries are INSERT OR IGNORE, because an answered inquiry must not
 * change again (the `inquiries_leave_sent_once` trigger enforces that). Running
 * it twice tops up what is missing and rewrites nothing that has moved on.
 *
 * IT DOES NOT TOUCH THE REAL PILOT DATA. It adds rows keyed under `op-demo-*`,
 * `demo-lst-*`, `demo-inq-*` and one `demo-market-traveller`. To take the demo
 * back out, delete those rows; the listings table's ON DELETE is not cascading,
 * so remove the inquiries first.
 *
 *   node --experimental-strip-types apps/api/src/seed-marketplace.ts
 *   pnpm --filter @chivago/api seed:marketplace
 */

import { openDb, row } from './db.ts';
import { generateApiKey, hashApiKey } from './host-auth.ts';
import { listingCards, inquiriesForOperator, medianResponseHours } from './inquiry-service.ts';
import { LISTING_KIND_LABEL, type ListingKind } from '@chivago/core';

/**
 * Refuse the pilot. On Fly the database is the mounted volume at
 * `/data/chivago.db` (see `fly.toml`), so a path under `/data` is production,
 * and seeding invented operators there is the one thing this script must not
 * do - it is what the real app deliberately does not. A deployment that truly
 * needs it can pass `CHIVAGO_SEED_MARKETPLACE_FORCE=1`, out loud, on purpose.
 */
const DB_PATH = process.env.CHIVAGO_DB ?? './data/chivago.db';
if (/^\/data(\/|$)/.test(DB_PATH) && process.env.CHIVAGO_SEED_MARKETPLACE_FORCE !== '1') {
  console.error(
    `[marketplace] refusing to seed the production volume (${DB_PATH}). The real app `
    + 'invents no operator. This is a local dev tool; run it against a local database, or '
    + 'set CHIVAGO_SEED_MARKETPLACE_FORCE=1 if you truly mean to.',
  );
  process.exit(1);
}

const db = openDb(DB_PATH);
const NOW = new Date();
const DAY_MS = 86_400_000;

const isoDaysAgo = (days: number, plusHours = 0): string =>
  new Date(NOW.getTime() - days * DAY_MS + plusHours * 3_600_000).toISOString();
/** A YYYY-MM-DD `for_date`, `days` from today. Island time is close enough for demo dates. */
const dateAhead = (days: number): string =>
  new Date(NOW.getTime() + days * DAY_MS).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// The operators — fictional, and they say so
// ---------------------------------------------------------------------------

/**
 * A host is the party that answers the inquiries. These two are invented, and
 * their console keys let you sign in as them and reply. `type` is a real
 * `QuestHost['type']`: a boat co-op is `community`, a villa is a `hotel`.
 */
const OPERATORS: { id: string; name: string; type: string }[] = [
  { id: 'op-demo-boat', name: 'DEMO · Thong Krut Boat Co-op', type: 'community' },
  { id: 'op-demo-villa', name: 'DEMO · Bophut Beach Villas', type: 'hotel' },
];

const issued: [string, string][] = [];
for (const op of OPERATORS) {
  db.prepare(
    `INSERT INTO hosts (id, name, type, role, created_at) VALUES (?,?,?,'host',?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type`,
  ).run(op.id, op.name, op.type, NOW.toISOString());

  // A key is shown once and only its hash is kept, exactly as the content seed
  // does. An operator that already has one keeps it, so re-running never locks
  // you out of a console tab you left open.
  const existing = db.prepare('SELECT api_key_hash FROM hosts WHERE id = ?').get(op.id) as
    | { api_key_hash: string | null } | undefined;
  if (!existing?.api_key_hash) {
    const key = generateApiKey();
    db.prepare('UPDATE hosts SET api_key_hash = ? WHERE id = ?').run(hashApiKey(key), op.id);
    issued.push([op.name, key]);
  }
}

// ---------------------------------------------------------------------------
// The listings — every kind, and the honest gaps
// ---------------------------------------------------------------------------

/**
 * Six listings across all four kinds. On purpose:
 *   - two tours, each with a DEMO licence number, one with a "from" price and
 *     one without, so you see both the stated price and the "not stated" row;
 *   - a stay, an experience and a transfer, none of which need a licence;
 *   - a `from_thb` of null wherever a real operator would not have quoted yet.
 * Nothing here is a plausible number typed in on a real business's behalf.
 */
const LISTINGS: {
  id: string; operatorId: string; kind: ListingKind;
  titleEn: string; titleTh: string; whereLabel: string;
  fromTHB: number | null; licenceNo: string | null;
}[] = [
  {
    id: 'demo-lst-boat-taen', operatorId: 'op-demo-boat', kind: 'tour',
    titleEn: 'Longtail to Koh Taen', titleTh: 'เรือหางยาวไปเกาะแตน',
    whereLabel: 'Thong Krut pier', fromTHB: 900, licenceNo: 'DEMO/0001',
  },
  {
    id: 'demo-lst-boat-angthong', operatorId: 'op-demo-boat', kind: 'tour',
    titleEn: 'Ang Thong day trip', titleTh: 'ทริปหมู่เกาะอ่างทองแบบไปเช้าเย็นกลับ',
    whereLabel: 'Thong Krut pier', fromTHB: null, licenceNo: 'DEMO/0002',
  },
  {
    id: 'demo-lst-boat-sunset', operatorId: 'op-demo-boat', kind: 'experience',
    titleEn: 'Sunset fishing trip', titleTh: 'ตกปลายามพระอาทิตย์ตก',
    whereLabel: 'Bang Rak', fromTHB: 1200, licenceNo: null,
  },
  {
    id: 'demo-lst-villa-room', operatorId: 'op-demo-villa', kind: 'stay',
    titleEn: 'Beachfront villa · 2-night minimum', titleTh: 'วิลลาริมหาด พักขั้นต่ำ 2 คืน',
    whereLabel: 'Bophut', fromTHB: 1800, licenceNo: null,
  },
  {
    id: 'demo-lst-villa-transfer', operatorId: 'op-demo-villa', kind: 'transfer',
    titleEn: 'Airport pickup (USM)', titleTh: 'รับส่งสนามบินสมุย (USM)',
    whereLabel: 'Samui Airport', fromTHB: null, licenceNo: null,
  },
  {
    id: 'demo-lst-villa-cooking', operatorId: 'op-demo-villa', kind: 'experience',
    titleEn: 'Thai cooking class', titleTh: 'คลาสทำอาหารไทย',
    whereLabel: 'Bophut', fromTHB: 800, licenceNo: null,
  },
];

for (const l of LISTINGS) {
  db.prepare(
    `INSERT INTO listings (id, operator_id, kind, title_en, title_th, where_label,
       from_thb, licence_no, active, created_at)
     VALUES (?,?,?,?,?,?,?,?,1,?)
     ON CONFLICT(id) DO UPDATE SET
       operator_id=excluded.operator_id, kind=excluded.kind,
       title_en=excluded.title_en, title_th=excluded.title_th,
       where_label=excluded.where_label, from_thb=excluded.from_thb,
       licence_no=excluded.licence_no`,
  ).run(l.id, l.operatorId, l.kind, l.titleEn, l.titleTh, l.whereLabel,
        l.fromTHB, l.licenceNo, isoDaysAgo(14));
}

// ---------------------------------------------------------------------------
// One demo traveller, to have asked the questions
// ---------------------------------------------------------------------------

const TRAVELLER = 'demo-market-traveller';
if (!row(db.prepare('SELECT id FROM users WHERE id = ?').get(TRAVELLER))) {
  db.prepare('INSERT INTO users (id, display_name, locale, created_at) VALUES (?,?,?,?)')
    .run(TRAVELLER, 'DEMO · sample traveller', 'en', isoDaysAgo(14));
}

// ---------------------------------------------------------------------------
// The inquiries — a response time that has earned itself, and two still open
// ---------------------------------------------------------------------------

/**
 * `medianResponseHours` shows nothing until an operator has answered
 * `MIN_ANSWERS_FOR_RESPONSE_TIME` (five) inquiries, so the boat co-op gets six
 * closed ones with real send→answer gaps, and the median falls out of the
 * timestamps the same way the console computes it. The two `sent` rows are
 * dated a few days ahead and sent just now, so they read as open rather than
 * expired, and give both consoles something "waiting on you".
 */
const INQUIRIES: {
  id: string; listingId: string; state: string;
  sentDaysAgo: number; forDays: number; partySize: number; message: string;
  answerHours?: number; answer?: string; quoteTHB?: number | null;
}[] = [
  // Boat co-op — six closed, one open. Gaps: 1.5, 2, 3, 4, 6 h answered; 2 h declined.
  {
    id: 'demo-inq-1', listingId: 'demo-lst-boat-taen', state: 'answered',
    sentDaysAgo: 12, forDays: -9, partySize: 2, answerHours: 1.5, quoteTHB: 1800,
    message: 'Two of us, is a morning trip to Koh Taen possible? Any snorkelling gear?',
    answer: 'Yes, morning boats leave at 9. Masks and fins are included for two.',
  },
  {
    id: 'demo-inq-2', listingId: 'demo-lst-boat-taen', state: 'answered',
    sentDaysAgo: 10, forDays: -7, partySize: 4, answerHours: 2, quoteTHB: 3600,
    message: 'Family of four, two kids. Are life jackets available in child sizes?',
    answer: 'We have child life jackets on every boat. Four seats is fine.',
  },
  {
    id: 'demo-inq-3', listingId: 'demo-lst-boat-angthong', state: 'answered',
    sentDaysAgo: 9, forDays: -5, partySize: 2, answerHours: 3, quoteTHB: 2400,
    message: 'Does the Ang Thong day trip include lunch and the viewpoint hike?',
    answer: 'Lunch is included; the viewpoint hike is optional and about 45 minutes.',
  },
  {
    id: 'demo-inq-4', listingId: 'demo-lst-boat-sunset', state: 'answered',
    sentDaysAgo: 8, forDays: -4, partySize: 2, answerHours: 4, quoteTHB: null,
    message: 'Can we bring our own drinks on the sunset trip?',
    answer: 'Of course — bring what you like. I will confirm the price with you directly.',
  },
  {
    id: 'demo-inq-5', listingId: 'demo-lst-boat-taen', state: 'answered',
    sentDaysAgo: 6, forDays: -2, partySize: 6, answerHours: 6, quoteTHB: 5400,
    message: 'Six adults for Koh Taen next week — one boat or two?',
    answer: 'One boat seats up to eight, so six is one boat.',
  },
  {
    id: 'demo-inq-6', listingId: 'demo-lst-boat-angthong', state: 'declined',
    sentDaysAgo: 5, forDays: -1, partySize: 3, answerHours: 2,
    message: 'Ang Thong this Saturday?',
    answer: 'Sorry, the park is closed for weather that day — please try another date.',
  },
  {
    id: 'demo-inq-7', listingId: 'demo-lst-boat-taen', state: 'sent',
    sentDaysAgo: 0, forDays: 6, partySize: 2, message: 'Is Koh Taen good for beginners snorkelling?',
  },
  // Villa — one open, so its console is not empty either.
  {
    id: 'demo-inq-8', listingId: 'demo-lst-villa-room', state: 'sent',
    sentDaysAgo: 0, forDays: 5, partySize: 2,
    message: 'Two adults, is the beachfront villa free for two nights from Friday?',
  },
];

let seededInquiries = 0;
for (const q of INQUIRIES) {
  if (row(db.prepare('SELECT id FROM inquiries WHERE id = ?').get(q.id))) continue;
  const sentAt = isoDaysAgo(q.sentDaysAgo);
  // Answered a few hours AFTER it was sent, so the send→answer gap is positive
  // and `medianResponseHours` reads a real reply time.
  const answeredAt = q.state === 'sent' ? null : isoDaysAgo(q.sentDaysAgo, q.answerHours ?? 0);
  db.prepare(
    `INSERT INTO inquiries (id, listing_id, user_id, for_date, party_size, message, state,
       sent_at, answered_at, answer, quote_thb)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(q.id, q.listingId, TRAVELLER, dateAhead(q.forDays), q.partySize, q.message, q.state,
        sentAt, answeredAt, q.answer ?? null, q.quoteTHB ?? null);
  seededInquiries += 1;
}

// ---------------------------------------------------------------------------
// What that produced, read back the way the app reads it
// ---------------------------------------------------------------------------

const cards = listingCards(db);
console.log(`\n[marketplace] ${LISTINGS.length} demo listings written, ${cards.length} public on the Ask screen`);
for (const c of cards) {
  const price = c.fromTHB === null ? 'from —' : `from ${c.fromTHB.toLocaleString('en-US')} THB`;
  const rt = c.responseHours === null ? '' : ` · ~${c.responseHours}h reply`;
  console.log(`  ${LISTING_KIND_LABEL[c.kind].en.padEnd(11)} ${c.title.en.padEnd(32)} ${price}${rt}`);
}
console.log(`[marketplace] +${seededInquiries} demo inquiries this run`);
for (const op of OPERATORS) {
  const waiting = inquiriesForOperator(db, op.id).filter((i) => i.now === 'sent').length;
  const median = medianResponseHours(db, op.id);
  console.log(`  ${op.name}: ${waiting} waiting · median reply ${median === null ? 'not shown yet' : `${median}h`}`);
}

if (issued.length > 0) {
  console.log('');
  console.log('[marketplace] Operator console keys — shown ONCE, store them now:');
  console.log('              http://localhost:8787/console/login');
  console.log('');
  for (const [name, key] of issued) console.log(`              ${key}   ${name}`);
  console.log('');
}
console.log('[marketplace] Travellers see the listings at GET /listings (behind a device key),');
console.log('              on the Ask screen reached from the trip planner.');
