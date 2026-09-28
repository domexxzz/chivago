/**
 * Capture the demo user's live state into the static demo's snapshot.
 *
 * `apps/mobile/src/demo/fixtures.json` is what the deployed, serverless demo
 * replays. It is not fixtures in the test sense - it is a photograph of a real
 * account, taken through the real API, and the pure core functions then run
 * over it in the browser. So it can drift from the running system silently,
 * and when it does the link a judge opens tells a different story from the one
 * on the laptop.
 *
 * That is what happened: the snapshot held 320 trip / 1240 green - the pilot
 * opening balance and nothing else - while the reset seeds five days of
 * check-ins and four host-verified quests on top of it. The remote demo showed
 * a wallet where every point was a gift.
 *
 *   pnpm --filter @chivago/api demo:reset --walk
 *   pnpm --filter @chivago/api start          # in another terminal
 *   pnpm --filter @chivago/api demo:capture
 *
 * The order matters. Capturing against an un-reset database photographs
 * whatever last night left behind.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { AREAS, SEED_PLACES, SEED_QUESTS } from '@chivago/core';

const BASE = process.env.CHIVAGO_DEMO_URL ?? 'http://localhost:8787';
const USER = process.env.CHIVAGO_DEMO_USER ?? 'demo-user';

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'mobile', 'src', 'demo', 'fixtures.json',
);

/**
 * Every route the static demo answers from the snapshot.
 *
 * What exists - every place, quest and area - is read from the core seed, the
 * source of truth for it. Those routes used to be listed by hand, and the list
 * stopped at the first campus: RMUTT and KU Bangkhen went into the seed and
 * their chips onto Home, and the public demo opened both onto an empty campus.
 * KU Sriracha's sixth place was never in it, and its two quests were listed
 * but would not open.
 *
 * The rest is listed, and nothing is discovered from the existing file - a
 * snapshot that silently keeps its old key set is exactly how it fell behind
 * in the first place. A route the demo gains is added here deliberately.
 */
const SEEDED = [
  ...SEED_PLACES.flatMap((p) => [
    `/places/${p.id}`, `/places/${p.id}/reviews`, `/places/${p.id}/history`,
    // Stories on every pin (docs/44): empty until the day, and honest about it.
    `/places/${p.id}/stories`,
  ]),
  ...SEED_QUESTS.map((q) => `/quests/${q.id}`),
  ...AREAS.map((a) => `/areas/${a.key}/stories`),
];

const ROUTES = [
  '/health',
  '/profile',
  '/places',
  ...SEEDED,
  '/quests',
  // The map's "quests near you" strip asks for today's only. Captured as its
  // own key because the demo server strips query strings before matching,
  // and answered the full list to a filtered request - a weekend quest led
  // the strip on a Tuesday.
  '/quests?filter=today',
  '/checkins/today',
  '/visits/self',
  // The map lifts its mist from these. Captured, or the demo's chart stays
  // wholly uncharted for an account that has been to five places.
  '/explored',
  '/medals',
  '/me/statements',
  // Four screens that were ErrorState("Not in the demo build") since they
  // arrived, because nobody re-captured after adding them.
  '/passport',
  '/account',
  '/party',
  '/standing',
  '/wallet',
  '/offers',
  '/vouchers',
  // docs/61. Added in the same commit as the screen, so it is never the
  // fifth "Not in the demo build".
  '/listings',
  '/inquiries',
  '/impact/me',
  '/impact/community',
  '/notifications',
  '/notifications/quiet',
  '/shield',
  '/sos',
  '/sos/contacts',
] as const;

async function get(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { headers: { 'x-chivago-user': USER } });
  if (!res.ok) throw new Error(`${path} answered ${res.status}`);
  const body = await res.json() as { ok?: boolean; data?: unknown; error?: string };
  // The envelope is unwrapped here because the demo server re-wraps it. A
  // snapshot of envelopes would double-wrap every reply in the browser.
  if (body.ok === false) throw new Error(`${path} refused: ${body.error ?? 'no reason given'}`);
  // `body.data ?? body` would be wrong: /sos answers `data: null` when no
  // alert is live, which is the normal case, and ?? would then store the whole
  // envelope. Absent and null are different questions.
  return 'data' in body ? body.data : body;
}

const snapshot: Record<string, unknown> = {};
const failed: string[] = [];

for (const path of ROUTES) {
  try {
    snapshot[path] = await get(path);
  } catch (error) {
    failed.push(`${path} - ${(error as Error).message}`);
  }
}

if (failed.length > 0) {
  console.error('[chivago] could not capture:');
  for (const line of failed) console.error(`  ${line}`);
  console.error('');
  console.error('[chivago] snapshot NOT written. A partial snapshot is a demo that');
  console.error('          works until somebody opens the screen that is missing.');
  process.exit(1);
}

/**
 * The snapshot has to be worth replaying, not merely present.
 *
 * Capturing an empty account produces a file full of empty arrays that loads
 * fine and shows nothing - the same failure the reset script's --walk exists
 * to prevent, arriving by a different road.
 */
const wallet = snapshot['/wallet'] as { balances?: { trip: number; green: number } };
// /places and /offers answer with bare arrays; /quests answers { quests, progress }.
// Reading them the same way is how the first version of this guard reported
// "there are no quests" about six of them.
const quests = (snapshot['/quests'] as { quests?: unknown[] })?.quests;
const places = snapshot['/places'] as unknown[];

const thin: string[] = [];
if (!wallet?.balances || wallet.balances.green <= 0) thin.push('the wallet holds no Green Points');
if (!Array.isArray(places) || places.length === 0) thin.push('there are no places');
if (!Array.isArray(quests) || quests.length === 0) thin.push('there are no quests');
// Every route answered is not every place shown: /places is what Home and the
// map draw, and an area whose places are missing from it opens empty.
const listed = new Set(Array.isArray(places) ? (places as { id: string }[]).map((p) => p.id) : []);
const unlisted = SEED_PLACES.filter((p) => !listed.has(p.id)).map((p) => p.id);
if (unlisted.length > 0) thin.push(`/places is missing seeded places (${unlisted.join(', ')}) - run the content seed`);

if (thin.length > 0) {
  console.error(`[chivago] this snapshot is not worth shipping: ${thin.join('; ')}.`);
  console.error('          Run the reset first: pnpm --filter @chivago/api demo:reset --walk');
  process.exit(1);
}

writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

console.log(`[chivago] captured ${ROUTES.length} routes from ${BASE} as ${USER}`);
console.log(`          wallet ${wallet.balances!.trip} trip · ${wallet.balances!.green} green`);
console.log(`          -> ${OUT}`);
