/**
 * The demo build's stand-in for the API.
 *
 * A static host has no server, so this answers `fetch` from a snapshot of real
 * responses captured from the running API — same shapes, same data, same
 * envelope. Reads are the snapshot; writes mutate an in-memory copy so the
 * loop a judge actually walks (check in, then review because you were there,
 * then redeem) behaves the way it does against the real thing.
 *
 * What it is NOT: persistence. Everything resets on reload, which is why the
 * build carries a visible DEMO mark. And it is not the server's judgement —
 * the real geofence, the real host verification and the real idempotency all
 * live in `apps/api` and are exercised by 509 tests there, not here.
 */

import {
  cheapestMonth, chivaBalance, forecastPrice, islandDay,
  outlookAhead, planDay, progressionFor, routeBiasFor, smartRoute,
} from '@chivago/core';
import snapshot from './fixtures.json';

type Json = Record<string, unknown>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const state = {
  routes: clone(snapshot) as Record<string, unknown>,
  checkins: [] as string[],
  /** Mood check-ins, appended the way the server appends them. */
  moods: [] as { at: string; mood: string; note: string | null }[],
  seq: 0,
};

/**
 * Balance, computed rather than replayed.
 *
 * `chivaBalance` is pure and lives in core, so the demo runs the real one over
 * whatever the visitor has actually done in this session. Checking in three
 * times genuinely turns the number on.
 */
const balanceNow = () => {
  const places = state.routes['/places'] as { id: string; layer: string; metrics: { aqi: number; crowdDensity: number } }[];
  const visits = state.checkins.flatMap((id) => {
    const p = places.find((x) => x.id === id);
    return p ? [{ at: now(), layer: p.layer, aqi: p.metrics.aqi, crowdDensity: p.metrics.crowdDensity }] : [];
  });
  return chivaBalance({
    moods: state.moods as never,
    visits,
    walkedKmPerDay: visits.length === 0 ? [] : [visits.length * 1.4],
  });
};

const id = (prefix: string) => `${prefix}-${(++state.seq).toString().padStart(4, '0')}`;
const now = () => new Date().toISOString();

const wallet = () => state.routes['/wallet'] as {
  balances: { trip: number; green: number };
  progression: unknown;
  ledger: Json[];
};

/** Move points and EXP the way the real ledger does: append, never overwrite. */
function credit(
  amount: number,
  currency: 'trip' | 'green',
  label: string,
  host: string,
  kind: string,
) {
  const w = wallet();
  w.balances[currency] += amount;
  w.ledger.unshift({
    id: id('l'), label, occurredAt: now(), host,
    amount, currency, exp: Math.max(0, amount), kind,
    sourceRef: `demo:${state.seq}`,
  });
  const exp = w.ledger.reduce((n, r) => n + (r.exp as number), 0);
  w.progression = progressionFor(exp);
}

/** Writes, in the order a traveller meets them. */
const writes: Record<string, (body: Json, m: RegExpMatchArray) => unknown> = {
  'POST /places/:id/checkin': (_b, m) => {
    const placeId = m[1]!;
    const place = (state.routes['/places'] as Json[])
      .find((p) => p.id === placeId) as Json | undefined;
    const already = state.checkins.includes(placeId);
    if (!already) {
      state.checkins.push(placeId);
      credit(20, 'trip', `Checked in · ${place?.short ?? placeId}`, 'ChivaGo', 'checkin');
      // A check-in is what makes a review writable — the same gate as the API.
      const key = `/places/${placeId}/reviews`;
      const r = state.routes[key] as Json;
      if (r) r.canReview = true;
    }
    return {
      placeId, placeName: (place?.name as Json)?.en ?? placeId,
      awarded: !already, pointsAwarded: already ? 0 : 20,
      balances: wallet().balances, exp: already ? 0 : 20, distanceM: 18,
    };
  },

  'POST /places/:id/reviews': (body, m) => {
    const placeId = m[1]!;
    const key = `/places/${placeId}/reviews`;
    const block = state.routes[key] as {
      reviews: Json[]; mine: Json | null; canReview: boolean; reported: string[];
    };
    const existing = block.mine?.review as Json | undefined;
    const review = {
      id: (existing?.id as string) ?? id('r'),
      placeId, authorId: 'demo-user', authorName: 'You',
      rating: body.rating, body: body.body,
      language: 'en',
      visitedAt: now(), createdAt: (existing?.createdAt as string) ?? now(),
      updatedAt: existing ? now() : null,
    };
    block.reviews = [review, ...block.reviews.filter((r) => r.id !== review.id)];
    block.mine = { review, hiddenAt: null, hiddenReasonKey: null, appeal: null };
    // Points are paid once per place, however many times the words change.
    const paid = existing !== undefined;
    if (!paid && body.body) credit(30, 'trip', 'Review written', 'ChivaGo', 'review');
    return { review, created: !existing, pointsAwarded: paid || !body.body ? 0 : 30 };
  },

  'DELETE /places/:id/reviews': (_b, m) => {
    const block = state.routes[`/places/${m[1]!}/reviews`] as {
      reviews: Json[]; mine: Json | null;
    };
    const mineId = (block.mine?.review as Json | undefined)?.id;
    block.reviews = block.reviews.filter((r) => r.id !== mineId);
    block.mine = null;
    return { removed: true };
  },

  'POST /reviews/:id/report': () => ({ id: id('rep') }),
  'POST /reviews/:id/appeal': () => ({ id: id('app') }),

  'POST /quests/:id/join': (_b, m) => stage(m[1]!, 'joined'),
  'POST /quests/:id/arrive': (_b, m) => stage(m[1]!, 'arrived'),
  'POST /quests/:id/proof': (_b, m) => ({
    // Stops at host verification. Points are the HOST's to release, and a demo
    // that paid itself would be showing the opposite of the whole design.
    progress: stage(m[1]!, 'host_verification'), proofId: id('proof'),
  }),

  'POST /offers/:id/redeem': (_b, m) => {
    const offer = (state.routes['/offers'] as Json[])
      .find((o) => o.id === m[1]!) as Json;
    const currency = offer.currency as 'trip' | 'green';
    credit(-(offer.costPoints as number), currency,
      `${offer.name} redeemed`, offer.merchantShort as string, 'redemption');
    const voucher = {
      id: id('v'), offerId: offer.id, userId: 'demo-user',
      merchant: offer.merchant, code: `CHV-${id('').slice(1).toUpperCase()}`,
      costPoints: offer.costPoints, issuedAt: now(),
      expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
      redeemedAt: null, status: 'active',
    };
    (state.routes['/vouchers'] as Json[]).unshift(voucher);
    return { voucher, balances: wallet().balances };
  },

  /**
   * The planner is PURE and lives in core, so the demo runs the real one over
   * the snapshot rather than replaying a recorded answer. Switching to a
   * gentle day genuinely replans; nothing here is a stored response.
   */
  /**
   * The forecaster is pure too, so the demo runs the real seasonality model.
   * Asking for December genuinely returns a peak-season band.
   */
  'POST /prices': (body) => {
    const asked = (body as { category?: string }).category;
    const category = (['stay', 'ferry', 'flight', 'scooter'].includes(asked ?? '')
      ? asked : 'stay') as 'stay' | 'ferry' | 'flight' | 'scooter';
    const at = new Date();
    const date = (body as { date?: string }).date ?? islandDay(at);
    const outlook = outlookAhead(category, at, 6);
    return { today: forecastPrice(category, date, at), outlook, cheapest: cheapestMonth(outlook) };
  },

  'POST /route': (body) => {
    const places = state.routes['/places'] as { id: string; name: unknown; lat: number; lng: number }[];
    const at = (id: unknown) => places.find((p) => p.id === id);
    const from = at((body as { from?: string }).from);
    const to = at((body as { to?: string }).to);
    if (!from || !to) return { options: [], caveat: { en: 'Unknown place', th: 'ไม่รู้จักสถานที่' } };
    const way = (p: typeof from) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng });
    return smartRoute(way(from) as never, way(to) as never, places.map(way) as never);
  },

  'POST /wellness/mood': (body) => {
    const entry = {
      at: now(),
      mood: String((body as { mood?: string }).mood ?? 'steady'),
      note: ((body as { note?: string | null }).note ?? null) || null,
    };
    state.moods.unshift(entry);
    return entry;
  },

  'POST /trip/plan': (body) => planDay({
    profile: state.routes['/profile'] as never,
    places: state.routes['/places'] as never,
    quests: (state.routes['/quests'] as { quests: unknown[] }).quests as never,
    energy: (body as { energy?: 'gentle' | 'moderate' | 'full' }).energy,
    // The last mood shapes the day here too, or the demo would show the
    // check-in doing nothing.
    bias: state.moods[0] ? routeBiasFor(state.moods[0].mood as never) : undefined,
  }),

  'PUT /profile': (body) => {
    state.routes['/profile'] = { ...(state.routes['/profile'] as Json), ...body };
    return state.routes['/profile'];
  },

  'POST /sos': () => {
    const alert = {
      id: id('sos'), status: 'dispatching', lat: 9.5357, lng: 100.0617,
      locationLabel: 'Chaweng, 120 m', firedAt: now(),
      acknowledgedAt: null, acknowledgedBy: null,
      nearestHospital: 'Bangkok Hospital Samui', note: null,
      shareUrl: 'https://chiva.go/s/demo', lastPositionAt: now(),
      dispatches: [], contactsReached: 2, contactsTotal: 2,
    };
    state.routes['/sos'] = alert;
    return alert;
  },
  'DELETE /sos': () => { state.routes['/sos'] = null; return { cancelled: true }; },
  'POST /sos/position': () => ({ recorded: true }),
  'POST /notifications/:id/read': () => ({ read: true }),
  'POST /notifications/read-all': () => ({ read: true }),
  'POST /notifications/device': () => ({ registered: true }),
  'PUT /notifications/quiet': (body) => {
    state.routes['/notifications/quiet'] = body;
    return body;
  },
};

/** Advance a quest and keep the list view agreeing with the detail view. */
function stage(questId: string, to: string) {
  const key = `/quests/${questId}`;
  const detail = state.routes[key] as { quest: Json; progress: Json | null };
  const progress = {
    questId, userId: 'demo-user', stage: to,
    joinedAt: now(), arrivedAt: to === 'joined' ? null : now(),
    proofSubmittedAt: to === 'host_verification' ? now() : null,
    verifiedAt: null, rejectedAt: null, rejectionReason: null,
  };
  detail.progress = progress;
  const list = state.routes['/quests'] as { progress: Record<string, unknown> };
  list.progress[questId] = progress;
  return progress;
}

const PATTERNS = Object.keys(writes).map((k) => {
  const [method, path] = k.split(' ') as [string, string];
  return { key: k, method, re: new RegExp(`^${path.replace(/:id/g, '([^/]+)')}$`) };
});

/**
 * Replace `globalThis.fetch`.
 *
 * Only requests aimed at the API are answered here; anything else — fonts, the
 * bundle itself — goes to the real fetch untouched.
 */
export function installDemoServer(apiBase: string): void {
  const real = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String((input as Request).url ?? input);
    if (!url.startsWith(apiBase)) return real(input as RequestInfo, init);

    const path = url.slice(apiBase.length).split('?')[0]!;
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as Json) : {};

    const answer = (data: unknown) => new Response(
      JSON.stringify({ ok: true, data }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );

    if (method === 'GET') {
      if (path === '/checkins/today') return answer(state.checkins);
      if (path === '/wellness/balance') return answer(balanceNow());
      if (path === '/wellness/mood') return answer(state.moods);
      if (path in state.routes) return answer(state.routes[path]);
    }

    for (const p of PATTERNS) {
      if (p.method !== method) continue;
      const m = path.match(p.re);
      if (m) return answer(writes[p.key]!(body, m));
    }

    // Unknown route: say so in the envelope the client already understands,
    // rather than throwing something the app would read as "you are offline".
    return new Response(
      JSON.stringify({ ok: false, code: 'DEMO_ROUTE', error: `Not in the demo build: ${method} ${path}` }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
}

/** A visible, unmissable mark that nothing here is saved. */
export function markAsDemo(): void {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.textContent = 'DEMO · ข้อมูลไม่ถูกบันทึก';
  el.setAttribute('role', 'note');
  Object.assign(el.style, {
    position: 'fixed', bottom: '78px', left: '0', zIndex: '9999',
    // Coral, the deck's counter-accent: a warning that reads as a warning
    // without competing with the lime the whole app is built on.
    background: '#f87153', color: '#071812',
    font: '600 9px/1 Anuphan, system-ui, sans-serif', letterSpacing: '0.12em',
    padding: '6px 9px', pointerEvents: 'none',
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
}
