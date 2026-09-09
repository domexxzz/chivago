/**
 * API client.
 *
 * One place that knows about HTTP. Every call returns a discriminated result so
 * screens branch on `ok` rather than try/catch, and an offline device produces a
 * typed failure instead of an unhandled rejection.
 */

import { adoptKey, forgetKey, loadDeviceKey } from './account.ts';
import { getEvent } from '../state/area.ts';
import type {
  AreaKey,
  ApiResponse, Balances, Bilingual, ImpactStat, LedgerEntry, NotificationKind, Offer, Quest,
  ChivaBalance, Companion, MonthOutlook, MoodCheckin, MoodKey, PriceCategory, PriceForecast,
  PlaceReview, QuestProgress, ScoredPlace, ShieldService, TripPlan, Voucher, Wallet,
  WellnessProfile, HostStanding, TravellerStanding, ProvinceEvidence, PartySummary,
} from '@chivago/core';
import type { AirHistory, BoardEntry, Explored, Fix, MedalsView, SelfVisitResult, SelfVisitSummary } from '@chivago/core';

/**
 * What POST /places/:id/checkin answers with.
 *
 * `awarded: false` means they are here but already checked in today. That is
 * a 200, not an error - a second visit is the behaviour the product wants.
 */
/** The author's own review plus its moderation state. */
export interface MyReviewState {
  review: PlaceReview;
  hiddenAt: string | null;
  hiddenReasonKey: string | null;
  appeal: {
    id: string;
    message: string;
    createdAt: string;
    outcome: 'upheld' | 'declined' | null;
  } | null;
}

export interface CheckinResult {
  placeId: string;
  placeName: string;
  awarded: boolean;
  /** The leg on foot this check-in closed, paid beside it. See core low-carbon.ts. */
  walk?: { fromPlaceId: string; fromPlaceName: string; metres: number; minutes: number; points: number } | null;
  pointsAwarded: number;
  balances: Balances;
  exp: number;
  distanceM: number;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string | null;
  relationship: string | null;
  linkedUserId: string | null;
}

export type DispatchStatus = 'delivered' | 'sent' | 'unavailable' | 'failed';

/** One delivery attempt. This is what lets the app report what ACTUALLY happened. */
export interface DispatchRecord {
  channel: 'push' | 'share_link' | 'operator' | 'sms';
  target: string;
  targetLabel: string;
  status: DispatchStatus;
  detail: string | null;
  attemptedAt: string;
}

export interface SosAlertRecord {
  id: string;
  status: 'dispatching' | 'acknowledged' | 'resolved' | 'cancelled';
  /** Null when the phone had no fix to give. The server no longer invents one. */
  lat: number | null;
  lng: number | null;
  locationLabel: string;
  firedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  nearestHospital: string;
  note: string | null;
  /** The public link. Shared through LINE, WhatsApp, SMS - whatever they use. */
  shareUrl: string;
  lastPositionAt: string | null;
  dispatches: DispatchRecord[];
  /** Counted from real attempts, never asserted. */
  contactsReached: number;
  contactsTotal: number;
}

/** When non-urgent pushes are held. Hours are island-local, 0–23. */
export interface QuietPreference {
  enabled: boolean;
  from: number | null;
  until: number | null;
}

/** One entry in the in-app inbox. Bilingual, unlike the push. */
export interface InboxItem {
  id: string;
  kind: NotificationKind;
  title: Bilingual;
  body: Bilingual;
  data: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

/**
 * Where the API is.
 *
 * A physical phone cannot reach the laptop on `localhost`, so real device
 * testing needs the LAN address in EXPO_PUBLIC_API_URL.
 *
 * `same-origin` is the sentinel for the build the API serves itself, behind a
 * tunnel or on a host. Every request then goes to whatever hostname the page
 * was loaded from, which is the only value that survives a tunnel handing out
 * a fresh random name every run. A literal empty string would have done the
 * same job and been indistinguishable from an unset variable, which is exactly
 * the kind of ambiguity that produces a build pointing at localhost in front
 * of an audience.
 */
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL === 'same-origin'
    ? ''
    : process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787';

/** Device-scoped identity. No sign-up: the least personal data is the safest. */
let deviceUser = 'demo-user';
export const setDeviceUser = (id: string): void => { deviceUser = id; };
export const deviceUserId = (): string => deviceUser;

/**
 * A statement a host issued that counts this traveller's verified work. The
 * id is public: `/verify/<id>` on the API shows anyone the same record.
 */
export interface FiledStatement {
  id: string;
  host: { id: string; name: string; type: string };
  period: { from: string; to: string };
  issuedAt: string;
  quests: { id: string; name: Bilingual }[];
}

/** A story on a place (docs/44). `media` and `poster` are paths under the API. */
export interface Story {
  id: string;
  placeId: string;
  kind: 'video' | 'photo';
  caption: string;
  status: 'pending' | 'approved' | 'hidden';
  createdAt: string;
  expiresAt: string;
  durationS: number | null;
  media: string;
  poster: string;
}

/** What the phone picked: a path on the phone, or the File itself on the web. */
export interface PickedMedia {
  uri: string;
  name: string;
  type: string;
  file?: Blob;
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; error: string };

/**
 * A phone whose key the server has never heard of takes a new one.
 *
 * There is no sign-in here and no password, so a key the server does not
 * recognise is not a locked door - it is an account that cannot be reached by
 * anyone, ever, including its owner. Holding on to it buys nothing and costs
 * everything: every request comes back 401 and the app is a dead screen with
 * a Retry that can never succeed. That is what a demo reset did to two phones
 * on 8 September, one of them with no devtools to clear storage from.
 *
 * So the key is dropped and a fresh account is registered, once per launch.
 * The old account's points are gone, which is the honest cost - but they were
 * gone the moment the server stopped knowing the key, and a traveller at an
 * event cannot be asked to clear site data.
 *
 * Deliberately NOT a general retry: only an UNAUTHENTICATED answer to a
 * request that actually carried a key. A timeout, a 500 or a refusal for any
 * other reason leaves the key alone. Registering goes out on a raw fetch so
 * it cannot re-enter this path and loop.
 */
let reviving: Promise<boolean> | null = null;

async function reviveDevice(): Promise<boolean> {
  reviving ??= (async () => {
    await forgetKey();
    try {
      const res = await fetch(`${API_BASE}/devices`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = (await res.json()) as ApiResponse<{ userId: string; deviceKey: string }>;
      if (!body.ok) return false;
      await adoptKey(body.data.deviceKey);
      return true;
    } catch {
      // Offline. The key is already forgotten, so the next launch tries again
      // rather than going back to the dead screen.
      return false;
    }
  })();
  return reviving;
}

/** Test seam: forget that this launch has already taken a new key. */
export const __resetDeviceRevival = (): void => { reviving = null; };

async function call<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 8000,
  retried = false,
): Promise<Result<T>> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    // AWAITED, from storage if memory does not have it yet. The synchronous
    // read it replaced was the source of a 401 on every cold start: hooks that
    // fetch on mount - the SOS poll, the inbox, the wallet - fired before
    // ensureAccount had read the keychain, went out with no key, and were
    // refused because a key existed. Gating each hook would have been a fix
    // per call site; waiting here is one fix for every request there is.
    const key = await loadDeviceKey();
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: ctl.signal,
      headers: {
        // A FormData body sets its own boundary; a JSON one says so.
        ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
        // The device key when this phone has one; the pilot header otherwise.
        // The server refuses the header the moment any account exists, so this
        // is a migration path with an end date rather than a permanent
        // back door.
        ...(key ? { 'x-chivago-device-key': key } : {}),
        'x-chivago-user': deviceUser,
        ...init.headers,
      },
    });
    const body = (await res.json()) as ApiResponse<T>;
    if (!body.ok) {
      // The one refusal worth answering with an action rather than a message.
      if (body.code === 'UNAUTHENTICATED' && key && !retried && await reviveDevice()) {
        clearTimeout(timer);
        return call<T>(path, init, timeoutMs, true);
      }
      return { ok: false, code: body.code, error: body.error };
    }
    return { ok: true, data: body.data };
  } catch (err) {
    // A dropped connection is normal on a beach or in a mangrove - the two
    // places this app most expects to be used. Never surface a raw stack.
    const offline = (err as Error).name === 'AbortError';
    return {
      ok: false,
      code: offline ? 'TIMEOUT' : 'NETWORK',
      error: offline ? 'The network is slow right now.' : 'You appear to be offline.',
    };
  } finally {
    clearTimeout(timer);
  }
}

const get = <T>(path: string) => call<T>(path);
const post = <T>(path: string, body?: unknown) =>
  call<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const put = <T>(path: string, body: unknown) =>
  call<T>(path, { method: 'PUT', body: JSON.stringify(body) });
const del = <T>(path: string) => call<T>(path, { method: 'DELETE' });
/** A multipart POST. A minute, because a clip on one bar of signal is not a JSON envelope. */
const upload = <T>(path: string, form: FormData) => call<T>(path, { method: 'POST', body: form }, 60_000);

export const api = {
  health: () => get<{ status: string }>('/health'),

  // -- profile ------------------------------------------------------------
  getProfile: () => get<WellnessProfile>('/profile'),
  saveProfile: (p: Partial<WellnessProfile> & { consentVersion: string }) =>
    put<WellnessProfile>('/profile', p),
  /** PDPA right to erasure. */
  deleteProfile: () => del<{ deleted: boolean }>('/profile'),

  // -- places -------------------------------------------------------------
  places: () => get<ScoredPlace[]>('/places'),
  /** Which provinces this traveller has been to. The arithmetic is in core. */
  /**
   * Where they have been, and the evidence behind each province's companion.
   *
   * Only provinces with evidence come back — the other seventy-five sealed
   * eggs are assembled locally by `provinceCompanions`, which already has the
   * country and the species list.
   */
  passport: () =>
    get<{ visited: string[]; selfReported: string[]; evidence: ProvinceEvidence[] }>('/passport'),

  // -- account ------------------------------------------------------------
  /** First run only. The key comes back once and goes straight to the keychain. */
  register: (body: { label?: string; locale?: string }) =>
    post<{ userId: string; deviceKey: string }>('/devices', body),

  account: () =>
    get<{ userId: string; devices: { label: string | null; createdAt: string; lastSeenAt: string | null; current: boolean }[] }>(
      '/account',
    ),

  /** A code to read aloud to another phone. Ten minutes, single use. */
  linkCode: () => post<{ code: string; expiresInMs: number }>('/account/link-code', {}),

  /** Join this phone to the account that issued the code. */
  claimLink: (code: string, label?: string) =>
    post<{ userId: string; deviceKey: string }>('/account/claim', { code, label }),

  revokeDevice: (label: string) =>
    post<{ removed: number }>('/account/devices/revoke', { label }),

  // -- party --------------------------------------------------------------
  /** Who I am travelling with. `party: null` means solo, which is a real state. */
  party: () =>
    get<{
      party: { id: string; name: string; createdBy: string; createdAt: string } | null;
      summary: PartySummary;
      doesNot: Bilingual[];
    }>('/party'),

  createParty: (name: string) =>
    post<{ party: { id: string; name: string }; code: string }>('/party', { name }),

  joinParty: (code: string) =>
    post<{ party: { id: string; name: string } }>('/party/join', { code }),

  leaveParty: () => post<{ left: boolean }>('/party/leave', {}),
  disbandParty: () => post<{ disbanded: boolean }>('/party/disband', {}),

  /**
   * Who is doing the work. Hosts ranked by approvals, plus the caller's own
   * record — never other travellers' names, which is a PDPA question nobody
   * has been asked. `participants` is a count and needs no consent.
   */
  standing: () =>
    get<{
      hosts: HostStanding[];
      you: TravellerStanding | null;
      participants: number;
      /** The caller's own place among the participants, from 1. Null with no verified work. */
      position: number | null;
      rankedBy: Bilingual;
    }>('/standing'),
  place: (id: string) => get<ScoredPlace>(`/places/${id}`),
  /** The air over a place by island day, as the server recorded it. */
  placeHistory: (id: string) => get<AirHistory>(`/places/${id}/history`),

  // -- quests -------------------------------------------------------------
  quests: (filter?: 'today' | 'weekend') =>
    get<{ quests: Quest[]; progress: Record<string, QuestProgress> }>(
      filter ? `/quests?filter=${filter}` : '/quests',
    ),
  quest: (id: string) =>
    get<{ quest: Quest; progress: QuestProgress | null }>(`/quests/${id}`),
  joinQuest: (id: string) => post<QuestProgress>(`/quests/${id}/join`),
  arriveAtQuest: (id: string, pos: Fix) =>
    post<QuestProgress>(`/quests/${id}/arrive`, pos),
  submitProof: (
    id: string,
    payload: {
      photos: { uri: string; lat: number | null; lng: number | null; takenAt: string | null }[];
      weightKg: number | null;
      /** Where the volunteer is at submission - the second in-fence sample. */
      position: Fix;
    },
  ) => post<{ progress: QuestProgress; proofId: string; partyPresent?: { userId: string; displayName: string }[] }>(`/quests/${id}/proof`, payload),

  // -- check-in -----------------------------------------------------------
  /**
   * Check in at a place. The server does the geofence check, not us: a client
   * that decides whether it is close enough is a client that can lie.
   */
  checkIn: (placeId: string, fix: Fix) =>
    post<CheckinResult>(`/places/${placeId}/checkin`, fix),
  checkinsToday: () => get<string[]>('/checkins/today'),
  /** What the server says about itself. Public, and fetched before sign-in. */
  config: () => get<{ fenceOff: boolean; autoApprove: boolean }>('/config'),
  /** The area's board: approved stories and visible reviews, newest first. */
  board: (areaKey: string) => get<{ open: boolean; entries: BoardEntry[] }>(`/areas/${areaKey}/board`),

  // -- self-issued visits: recorded, not scored ---------------------------
  /** Stamp a place on the traveller's word. Pays nothing, unlocks nothing. */
  recordVisit: (placeId: string) => post<SelfVisitResult>(`/places/${placeId}/visits`, {}),
  selfVisits: () => get<SelfVisitSummary>('/visits/self'),
  /** Where they have been - check-ins and stamps - for the map to lift its mist from. */
  explored: () => get<Explored>('/explored'),
  /** Medals, for going to places. The server does the counting. */
  medals: () => get<MedalsView>('/medals'),

  // -- stories (docs/44) ---------------------------------------------------
  /** What is on the pin, and whether the door is open. */
  stories: (placeId: string) => get<{ open: boolean; stories: Story[] }>(`/places/${placeId}/stories`),
  /** Every approved story in an area: the rings on the map. */
  areaStories: (area: AreaKey) =>
    get<{ open: boolean; stories: (Story & { placeName: Bilingual })[] }>(`/areas/${area}/stories`),
  /**
   * Tell one. Multipart: the clip or photograph, a caption, and the fix the
   * fence judges. On the web the picker hands over the File itself; on a
   * phone it is a path, and React Native's FormData reads it.
   */
  tellStory: (placeId: string, args: { media: PickedMedia; caption: string; position: Fix }) => {
    const form = new FormData();
    if (args.media.file) form.append('file', args.media.file, args.media.name);
    else form.append('file', { uri: args.media.uri, name: args.media.name, type: args.media.type } as unknown as Blob);
    form.append('caption', args.caption);
    form.append('position', JSON.stringify(args.position));
    // The token from the QR code, when there was one (docs/46).
    const event = getEvent();
    if (event) form.append('event', event);
    return upload<Story>(`/places/${placeId}/stories`, form);
  },

  // -- the evidence layer -------------------------------------------------
  /**
   * Statements a host filed that include this traveller's verified work. See
   * docs/31: the hotel's record, visible to the guest whose work it counts.
   */
  myStatements: () => get<{ statements: FiledStatement[] }>('/me/statements'),

  // -- reviews ------------------------------------------------------------
  /**
   * Reviews for a place, plus this reader's own if they have written one.
   *
   * Every row in `reviews` is from someone the server confirmed was there -
   * not because it filters, but because an unverified one cannot be written.
   */
  reviews: (placeId: string) =>
    get<{
      reviews: PlaceReview[];
      /**
       * The reader's OWN review, shown even when it has been taken down -
       * with why, and whether an appeal is in flight. A review that silently
       * vanishes from your own screen is the worst version of this.
       */
      mine: MyReviewState | null;
      canReview: boolean;
      /** Review ids this reader has already reported. */
      reported: string[];
    }>(`/places/${placeId}/reviews`),
  writeReview: (placeId: string, review: { rating: number; body: string | null }) =>
    post<{ review: PlaceReview; created: boolean; pointsAwarded: number }>(
      `/places/${placeId}/reviews`,
      review,
    ),
  withdrawReview: (placeId: string) =>
    del<{ removed: boolean }>(`/places/${placeId}/reviews`),
  /**
   * Report a review. Sends it to a moderator; removes nothing.
   *
   * No count anywhere trips a switch, so a coordinated pile-on cannot be
   * used to bury something.
   */
  reportReview: (reviewId: string, report: { reason: string; note: string | null }) =>
    post<{ id: string }>(`/reviews/${reviewId}/report`, report),
  /** Answer a take-down. The other direction of the accountability. */
  appealReview: (reviewId: string, message: string) =>
    post<{ id: string }>(`/reviews/${reviewId}/appeal`, { message }),

  // -- wallet + marketplace -----------------------------------------------
  wallet: () => get<Wallet>('/wallet'),
  offers: () => get<Offer[]>('/offers'),
  redeem: (offerId: string) =>
    post<{ voucher: Voucher; balances: Balances }>(`/offers/${offerId}/redeem`),
  vouchers: () => get<Voucher[]>('/vouchers'),

  // -- impact -------------------------------------------------------------
  myImpact: () => get<ImpactStat[]>('/impact/me'),
  communityImpact: () =>
    get<{ year: number; metrics: { key: string; label: { en: string; th: string }; actual: number; target: number; unit: string }[] }>(
      '/impact/community',
    ),

  // -- notifications ------------------------------------------------------
  registerDevice: (body: { token: string; locale: 'th' | 'en'; platform: string }) =>
    post<{ registered: boolean }>('/notifications/device', body),
  unregisterDevice: (token: string) =>
    call<{ disabled: boolean }>('/notifications/device', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    }),
  notifications: () =>
    get<{ items: InboxItem[]; unread: number }>('/notifications'),
  markNotificationRead: (id: string) =>
    post<{ unread: number }>(`/notifications/${id}/read`),
  markAllNotificationsRead: () => post<{ unread: number }>('/notifications/read-all'),
  /**
   * Quiet hours, per person. Island time. `from`/`until` null means the
   * default (22:00–07:00). SOS ignores this and always will.
   */
  quietHours: () => get<QuietPreference>('/notifications/quiet'),
  setQuietHours: (pref: Partial<QuietPreference>) =>
    call<QuietPreference>('/notifications/quiet', { method: 'PUT', body: JSON.stringify(pref) }),

  // -- companions ---------------------------------------------------------
  /**
   * One creature per habitat, at the stage this traveller's evidence reached.
   *
   * Derived server-side from the ledger and never stored, so there is no
   * route that grants one and nothing to keep in sync.
   */
  companions: () =>
    get<{
      companions: Companion[];
      summary: { found: number; total: number; grown: number };
      speciesAsOf: string;
    }>('/companions'),

  // -- price forecast -----------------------------------------------------
  /**
   * A price BAND for a date, and the months ahead.
   *
   * Never a quote: the response carries its own caveat and a confidence that
   * falls with the horizon. Render both.
   */
  prices: (category: PriceCategory = 'stay', date?: string) =>
    post<{
      today: PriceForecast;
      outlook: MonthOutlook[];
      cheapest: MonthOutlook | null;
    }>('/prices', { category, date }),

  // -- wellness engine ----------------------------------------------------
  /** How they say they feel. Appended, never overwritten - the sequence is the point. */
  recordMood: (mood: MoodKey, note?: string | null) =>
    post<MoodCheckin>('/wellness/mood', { mood, note: note ?? null }),
  moodHistory: () => get<MoodCheckin[]>('/wellness/mood'),
  /**
   * Chiva Balance. `total` is null with a `note` when the trip is too short
   * to say anything - render the note, never a zero.
   */
  balance: () => get<ChivaBalance>('/wellness/balance'),

  // -- trip planner -------------------------------------------------------
  /**
   * Plan a day.
   *
   * Server-side because it needs the stored profile, live air per place and
   * the quest geofences. `energy` overrides the profile's activity level for
   * this plan only - asking for a gentle day does not change who you are.
   */
  planTrip: (energy?: 'gentle' | 'moderate' | 'full', area?: AreaKey) =>
    post<TripPlan>('/trip/plan', { energy, area }),

  // -- safety -------------------------------------------------------------
  shield: () => get<ShieldService[]>('/shield'),
  /** Polled on launch and on screen change so a live alert survives anything. */
  activeSos: () => get<SosAlertRecord | null>('/sos'),
  fireSos: (pos?: { lat: number; lng: number }, note?: string) =>
    post<SosAlertRecord>('/sos', { ...(pos ?? {}), note }),
  /** Someone in trouble may be moving. Streamed while an alert runs. */
  updateSosPosition: (pos: { lat: number; lng: number }) =>
    post<SosAlertRecord>('/sos/position', pos),
  cancelSos: () => del<{ cancelled: boolean }>('/sos'),
  emergencyContacts: () => get<EmergencyContact[]>('/sos/contacts'),
  addEmergencyContact: (body: { name: string; phone?: string; relationship?: string }) =>
    post<EmergencyContact>('/sos/contacts', body),
  removeEmergencyContact: (id: string) => del<{ removed: boolean }>(`/sos/contacts/${id}`),
};

export type { LedgerEntry };
