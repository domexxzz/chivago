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
  SPECIES_AS_OF, cheapestMonth, chivaBalance, collectionSummary, companionsFor,
  forecastPrice, islandDay,
  outlookAhead, planDay, progressionFor, routeBiasFor, smartRoute, summarise,
  areaByKey, inArea, isAreaKey,
} from '@chivago/core';
import snapshot from './fixtures.json';

type Json = Record<string, unknown>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * Days the demo visitor had already spent in each habitat before opening this.
 *
 * A companion hatches on a SECOND day in a habitat, and a demo is one
 * sitting. Without a prior day nothing here could ever hatch, and the
 * collection would be a row of eggs with no way to open them - which is
 * exactly the bug this seeding exists to stop hiding.
 *
 * This is seeded history, not a seeded result: the stage is still computed
 * by the real `companionsFor` from days it is given, and a visitor who
 * checks in nowhere still sees nothing in Wellness or Quest.
 */
/**
 * What the demo visitor had already done before opening this, per habitat.
 *
 * Mirrors what `demo:reset` seeds on the real API, because two demos of one
 * product that disagree are worse than one demo. `days` hatch an egg at two;
 * `verified` is a host-approved quest, the only thing that grows a companion.
 *
 * The spread is chosen so all three stages are on screen at once - an egg, a
 * hatchling and a grown animal side by side is the only way the difference
 * between them explains itself. The first version gave one day to two
 * habitats and no verified quests at all, so the collection was two eggs and
 * nothing else: five drawn animals that nobody opening the demo could see.
 *
 * Wellness is deliberately left at one day. It is the egg the presenter
 * hatches live by checking in at Lamai.
 */
const PRIOR: Record<string, { days: number; verified: number }> = {
  Safe:     { days: 3, verified: 1 },
  Quest:    { days: 1, verified: 1 },
  Food:     { days: 3, verified: 0 },
  Green:    { days: 2, verified: 0 },
  Wellness: { days: 1, verified: 0 },
};

const state = {
  routes: clone(snapshot) as Record<string, unknown>,
  checkins: [] as string[],
  /** Self-issued stamps: recorded, not scored. */
  selfVisits: [] as string[],
  /** Mood check-ins, appended the way the server appends them. */
  moods: [] as { at: string; mood: string; note: string | null }[],
  /** The party this session started, if any. One visitor, so never joined. */
  party: null as { id: string; name: string; createdBy: string; createdAt: string; code: string } | null,
  seq: 0,
};

/**
 * A refusal, in the envelope the client already understands.
 *
 * The real API says no with a code the app branches on - PARTY_UNKNOWN,
 * LINK_UNKNOWN - and the screens render that sentence. A demo that answered
 * every write with success would be demonstrating a product that cannot say
 * no, which is not this one.
 */
class Refused {
  constructor(readonly code: string, readonly error: string) {}
}
const refuse = (code: string, error: string) => new Refused(code, error);

/** The party screen, computed from this session rather than replayed. */
const partyNow = () => {
  const fixture = state.routes['/party'] as { doesNot: unknown };
  if (!state.party) return { party: null, summary: summarise([]), doesNot: fixture.doesNot };
  const w = wallet();
  const green = w.ledger.filter((r) => r.kind === 'quest_reward' && r.currency === 'green');
  const { code: _code, ...party } = state.party;
  return {
    party,
    summary: summarise([{
      userId: 'demo-user', displayName: 'Traveller', you: true,
      missionsVerified: green.length,
      greenEarned: green.reduce((n, r) => n + (r.amount as number), 0),
      provinces: ['TH-84'],
    }]),
    doesNot: fixture.doesNot,
  };
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
  /** What the row is about, so the app can phrase it in the reader's language. */
  subject: string | null = null,
) {
  const w = wallet();
  w.balances[currency] += amount;
  w.ledger.unshift({
    id: id('l'), label, subject, occurredAt: now(), host,
    amount, currency, exp: Math.max(0, amount), kind,
    sourceRef: `demo:${state.seq}`,
  });
  const exp = w.ledger.reduce((n, r) => n + (r.exp as number), 0);
  w.progression = progressionFor(exp);
}

/** Writes, in the order a traveller meets them. */
const writes: Record<string, (body: Json, m: RegExpMatchArray) => unknown> = {
  // -- accounts and parties: the four screens that were "Not in the demo
  // build" since they arrived, because nobody re-captured after adding them.
  'POST /devices': () => ({ userId: 'demo-user', deviceKey: 'chvg_dev_demo-build-only' }),
  'POST /account/link-code': () => ({ code: 'DEMO' + String(++state.seq).padStart(4, '0'), expiresInMs: 600_000 }),
  // There is one visitor and one phone, so there is nothing to claim from.
  'POST /account/claim': () => refuse('LINK_UNKNOWN', 'That code is not one this demo issued. Nothing is saved here, so there is no second phone to link.'),
  'POST /account/devices/revoke': () => refuse('NO_SUCH_DEVICE', 'This demo has one phone: the one you are holding.'),
  'POST /party': (body) => {
    state.party = {
      id: id('party'), name: String(body.name ?? 'Our trip') || 'Our trip',
      createdBy: 'demo-user', createdAt: now(), code: `DM${String(++state.seq).padStart(4, '0')}`,
    };
    const { code, ...party } = state.party;
    return { party, code };
  },
  // Joining needs a second traveller, and a demo has exactly one. Refusing
  // with the real code is more honest than inventing a companion.
  'POST /party/join': () => refuse('PARTY_UNKNOWN', 'No party has that code. Nothing is saved in this demo, so there is nobody else to join.'),
  'POST /party/leave': () => { state.party = null; return { left: true }; },
  'POST /party/disband': () => { state.party = null; return { disbanded: true }; },

  'POST /places/:id/checkin': (_b, m) => {
    const placeId = m[1]!;
    const place = (state.routes['/places'] as Json[])
      .find((p) => p.id === placeId) as Json | undefined;
    const already = state.checkins.includes(placeId);
    if (!already) {
      state.checkins.push(placeId);
      credit(20, 'trip', `Checked in · ${place?.short ?? placeId}`, 'ChivaGo', 'checkin', String(place?.short ?? placeId));
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

  // Stories open at the event, at the place - never in the static demo.
  'POST /places/:id/stories': () => refuse(
    'STORIES_CLOSED',
    'สตอรี่เปิดรับที่งานวันที่ 11 ก.ย. ที่ มก. ศรีราชา · Stories open at the event on 11 September, at the campus.',
  ),

  // Recorded, not scored: a dashed stamp in the passport, nothing in the wallet.
  'POST /places/:id/visits': (_b, m) => {
    const placeId = m[1]!;
    const already = state.selfVisits.includes(placeId);
    if (!already) {
      state.selfVisits.push(placeId);
      const place = (state.routes['/places'] as Json[]).find((p) => p.id === placeId) as { province?: string } | undefined;
      const passport = state.routes['/passport'] as { selfReported?: string[] };
      if (place?.province && !(passport.selfReported ?? []).includes(place.province)) {
        passport.selfReported = [...(passport.selfReported ?? []), place.province];
      }
      state.routes['/visits/self'] = { places: [...state.selfVisits], remainingThisYear: 10 - state.selfVisits.length };
    }
    return { placeId, recorded: !already, remainingThisYear: 10 - state.selfVisits.length };
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

  'POST /trip/plan': (body) => {
    // One area at a time, as the API does it.
    const asked = (body as { area?: unknown }).area;
    const framed = isAreaKey(asked) ? areaByKey(asked) : null;
    const inFrame = <T extends { lat: number; lng: number }>(list: T[]): T[] =>
      framed ? list.filter((x) => inArea(framed, x)) : list;
    return planDay({
    profile: state.routes['/profile'] as never,
    places: inFrame(state.routes['/places'] as { lat: number; lng: number }[]) as never,
    quests: inFrame((state.routes['/quests'] as { quests: { lat: number; lng: number }[] }).quests) as never,
    energy: (body as { energy?: 'gentle' | 'moderate' | 'full' }).energy,
    // The last mood shapes the day here too, or the demo would show the
    // check-in doing nothing.
    bias: state.moods[0] ? routeBiasFor(state.moods[0].mood as never) : undefined,
    });
  },

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

    const [path, query] = url.slice(apiBase.length).split('?') as [string, string | undefined];
    const method = (init?.method ?? 'GET').toUpperCase();
    // A JSON body is read; a FormData one (a story) is not, and is refused below.
    const body = init?.body && typeof init.body === 'string' ? (JSON.parse(init.body) as Json) : {};

    const answer = (data: unknown) => new Response(
      JSON.stringify({ ok: true, data }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );

    if (method === 'GET') {
      if (path === '/checkins/today') return answer(state.checkins);
      if (path === '/wellness/balance') return answer(balanceNow());
      if (path === '/companions') {
        // The real derivation over this session's own check-ins: eggs appear
        // because the visitor actually went somewhere, not because a fixture
        // said so.
        const places = state.routes['/places'] as { id: string; layer: string }[];
        // Today counts once per habitat however many stops it had - the same
        // rule the server applies, which is why this is a Set and not a tally.
        const todayIn = new Set<string>();
        for (const id of state.checkins) {
          const p = places.find((x) => x.id === id);
          if (p) todayIn.add(p.layer);
        }
        const evidence = Object.entries(PRIOR).flatMap(([layer, prior]) => {
          const visitDays = prior.days + (todayIn.has(layer) ? 1 : 0);
          return visitDays > 0
            ? [{ layer, visitDays, questsVerified: prior.verified }]
            : [];
        });
        const companions = companionsFor(evidence as never);
        return answer({
          companions,
          summary: collectionSummary(companions),
          speciesAsOf: SPECIES_AS_OF,
        });
      }
      if (path === '/wellness/mood') return answer(state.moods);
      if (path === '/party') return answer(partyNow());
      // A filtered list is its own capture. The query used to be stripped
      // and the full list answered, so "quests near you" led with a weekend
      // quest on a Tuesday.
      if (query && `${path}?${query}` in state.routes) return answer(state.routes[`${path}?${query}`]);
      if (path in state.routes) return answer(state.routes[path]);
    }

    for (const p of PATTERNS) {
      if (p.method !== method) continue;
      const m = path.match(p.re);
      if (m) {
        const result = writes[p.key]!(body, m);
        if (result instanceof Refused) {
          return new Response(
            JSON.stringify({ ok: false, code: result.code, error: result.error }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return answer(result);
      }
    }

    // Unknown route: say so in the envelope the client already understands,
    // rather than throwing something the app would read as "you are offline".
    return new Response(
      JSON.stringify({ ok: false, code: 'DEMO_ROUTE', error: `Not in the demo build: ${method} ${path}` }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
}

/**
 * A visible, unmissable mark that nothing here is saved.
 *
 * A STRIP AT THE TOP, not a floating tag. It used to sit at `bottom: 78px`,
 * just above the tab bar, where it floated over whatever content happened to
 * be there - which on the map screen was the middle of the "Join this quest"
 * button. A watermark that covers the primary action is worse than no
 * watermark: the reviewer it exists to inform is the same person it stops from
 * using the thing.
 *
 * So it reserves its own space instead of borrowing someone else's. The strip
 * is fixed to the top and `#root` is inset by exactly its height, so nothing
 * in the app is ever underneath it. `box-sizing: border-box` matters here: the
 * root is a full-height flex column, and without it the inset would push the
 * tab bar off the bottom of the screen.
 */
export function markAsDemo(): void {
  if (typeof document === 'undefined') return;

  const HEIGHT = 20;

  const el = document.createElement('div');
  el.textContent = 'DEMO · ข้อมูลไม่ถูกบันทึก · nothing is saved';
  el.setAttribute('role', 'note');
  Object.assign(el.style, {
    position: 'fixed', top: '0', left: '0', right: '0', zIndex: '9999',
    height: `${HEIGHT}px`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    // Coral, the deck's counter-accent: a warning that reads as a warning
    // without competing with the lime the whole app is built on.
    background: '#f87153', color: '#071812',
    font: '600 9px/1 Anuphan, system-ui, sans-serif', letterSpacing: '0.12em',
    pointerEvents: 'none',
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);

  const style = document.createElement('style');
  style.textContent =
    `#root { box-sizing: border-box; padding-top: ${HEIGHT}px; }`;
  document.head.appendChild(style);
}
