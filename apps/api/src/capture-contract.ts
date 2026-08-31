/**
 * Capture the live contract into `contract/api-contract.json`.
 *
 * Run with `pnpm --filter @chivago/api contract` against a running API. The
 * output is the file both SDKs are written against, and the file
 * `contract.test.ts` guards.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { shapeOf, type Shape } from './contract.ts';

const BASE = process.env.CHIVAGO_CONTRACT_URL ?? 'http://localhost:8787';
const USER = 'contract-capture';

/**
 * Calls made BEFORE capturing, and not themselves recorded.
 *
 * A contract taken against an empty account is a contract of empty arrays,
 * which guards nothing: `vouchers: []` records no field names at all, so a
 * rename inside a voucher would sail straight through. The account is put into
 * a state where every collection has something in it first.
 */
const WARM_UP: { path: string; body?: unknown }[] = [
  { path: '/places/chaweng/checkin', body: { lat: 9.5357, lng: 100.0617 } },
  {
    path: '/places/chaweng/reviews',
    body: { rating: 5, body: 'Quiet at 7am and the water is clean, worth the early start.' },
  },
  { path: '/offers/o1/redeem' },
  {
    path: '/sos/contacts',
    body: { name: 'Malee', phone: '+66800000000', relationship: 'sister' },
  },
];

/** Every endpoint the SDKs read. A GET unless a body is given. */
export const ENDPOINTS: { name: string; path: string; body?: unknown }[] = [
  { name: 'health', path: '/health' },
  { name: 'profile', path: '/profile' },
  { name: 'places', path: '/places' },
  { name: 'place', path: '/places/chaweng' },
  { name: 'quests', path: '/quests' },
  { name: 'quest', path: '/quests/q1' },
  { name: 'wallet', path: '/wallet' },
  { name: 'offers', path: '/offers' },
  { name: 'vouchers', path: '/vouchers' },
  { name: 'impactMe', path: '/impact/me' },
  { name: 'impactCommunity', path: '/impact/community' },
  { name: 'shield', path: '/shield' },
  { name: 'notifications', path: '/notifications' },
  { name: 'quietHours', path: '/notifications/quiet' },
  { name: 'checkinsToday', path: '/checkins/today' },
  { name: 'reviews', path: '/places/chaweng/reviews' },
  { name: 'sosContacts', path: '/sos/contacts' },
  { name: 'checkin', path: '/places/chaweng/checkin', body: { lat: 9.5357, lng: 100.0617 } },
  {
    name: 'writeReview',
    path: '/places/chaweng/reviews',
    body: { rating: 4, body: 'Busier after nine when the boats arrive, but still worth it.' },
  },
];

export interface Capture {
  shapes: Record<string, Shape>;
  /**
   * One REAL response per endpoint.
   *
   * Shapes catch drift; samples let the other clients prove they can
   * actually decode. A Dart or Swift test against hand-written JSON only
   * proves the model agrees with what its author imagined the server sends.
   *
   * Captured from a throwaway seeded database under a synthetic user, so
   * there is nobody real in here.
   */
  samples: Record<string, unknown>;
  /**
   * Endpoints whose response was an empty collection, so nothing about the
   * elements is guarded. Recorded rather than silently accepted: an uncovered
   * shape that LOOKS covered is worse than a known gap.
   */
  uncovered: string[];
}

const isEmptyCollection = (s: Shape): boolean =>
  typeof s === 'object' && 'array' in s && s.array === 'unknown';

const call = (base: string, path: string, body?: unknown) =>
  fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'x-chivago-user': USER,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export async function capture(base = BASE): Promise<Capture> {
  for (const w of WARM_UP) await call(base, w.path, w.body ?? {});

  const shapes: Record<string, Shape> = {};
  const samples: Record<string, unknown> = {};
  const uncovered: string[] = [];

  for (const e of ENDPOINTS) {
    const res = await call(base, e.path, e.body);
    const json = (await res.json()) as { ok: boolean; data?: unknown; error?: string };
    if (!json.ok) throw new Error(`${e.name} (${e.path}) failed: ${json.error}`);

    const shape = shapeOf(json.data);
    shapes[e.name] = shape;
    samples[e.name] = json.data;
    if (isEmptyCollection(shape)) uncovered.push(e.name);
    // A nested empty list is just as blind as a top-level one.
    if (typeof shape === 'object' && 'object' in shape) {
      for (const [key, sub] of Object.entries(shape.object)) {
        if (isEmptyCollection(sub)) uncovered.push(`${e.name}.${key}`);
      }
    }
  }
  return { shapes, samples, uncovered };
}

if (process.argv[1]?.includes('capture-contract')) {
  const result = await capture();
  const dir = join(process.cwd(), '..', '..', 'contract');
  mkdirSync(dir, { recursive: true });
  const target = join(dir, 'api-contract.json');
  // Split, because the shapes are read by a human on review and the samples
  // are not — a thousand lines of payload in the same file would bury the
  // twenty that matter.
  writeFileSync(
    target,
    `${JSON.stringify({ shapes: result.shapes, uncovered: result.uncovered }, null, 2)}
`,
  );
  writeFileSync(
    join(dir, 'api-samples.json'),
    `${JSON.stringify(result.samples, null, 2)}
`,
  );
  console.log(`[chivago] captured ${Object.keys(result.shapes).length} endpoints -> ${target}`);
  if (result.uncovered.length > 0) {
    console.warn(
      `[chivago] NOT covered (empty collection at capture): ${result.uncovered.join(', ')}`,
    );
  }
}
