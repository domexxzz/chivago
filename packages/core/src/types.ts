/**
 * Domain types shared by the API and the mobile app.
 *
 * Derived from handoff section 6 ("Backend surface implied by the design").
 * Every user-facing string is bilingual: English primary, Thai secondary.
 */

// Type-only, and therefore erased at runtime: progression.ts imports Bilingual
// back from here. A value import would be a cycle; this is not.
import type { Progression } from './progression.ts';

/** A bilingual string. English primary, Thai secondary caption. */
export interface Bilingual {
  en: string;
  th: string;
}

export type LayerKey = 'Green' | 'Wellness' | 'Food' | 'Safe' | 'Quest';
export const LAYER_KEYS: readonly LayerKey[] = ['Green', 'Wellness', 'Food', 'Safe', 'Quest'] as const;

// ---------------------------------------------------------------------------
// Places + Healthy Score
// ---------------------------------------------------------------------------

/**
 * The four raw signals behind a Healthy Score, each on its own natural unit.
 * Normalisation into 0-100 sub-scores lives in healthy-score.ts.
 */
export interface PlaceMetrics {
  /** Live. People per 100 sq m, from partner wifi/telco density or manual survey. */
  crowdDensity: number;
  /** Live. US AQI 0-500. Sourced per-coordinate - see docs/05-research.md. */
  aqi: number;
  /** Computed daily. 0-10. Patrol coverage, lighting, incident history. */
  safetyIndex: number;
  /** Computed daily. 0-10. Footpath continuity, shade, gradient, crossings. */
  walkability: number;
}

/** How a metric was obtained. Surfaced in the UI so the score is never a black box. */
export type Provenance = 'live' | 'daily' | 'estimated' | 'stale';

export interface MetricReading {
  value: number;
  provenance: Provenance;
  /** ISO 8601. */
  observedAt: string;
  /** Human-readable origin, e.g. "Open-Meteo CAMS". */
  source: string;
}

export interface Place {
  id: string;
  name: Bilingual;
  /**
   * Short PLACE name for the map pin chip, e.g. "Na Muang".
   *
   * Not the layer and not a category. Four of the five seeded places held the
   * layer name here, so the map showed Green / Food / Wellness / Quest —
   * repeating the filter chips above it and naming nothing. The screen reader
   * was getting "Na Muang Waterfall" while the pin said "GREEN".
   */
  short: string;
  layer: LayerKey;
  lat: number;
  lng: number;
  /** One-line meta shown under the name in feed rows. */
  meta: string;
  blurb: Bilingual;
  tags: string[];
  /**
   * ISO 3166-2:TH code of the province this place is in.
   *
   * The passport counts provinces, and a province is only visited because a
   * PLACE in it was. Without this the passport would have to be its own
   * record of where somebody went, which is a second copy of the ledger.
   */
  province: string;
  /**
   * 16:9 hero. Null until real Koh Samui photography is licensed.
   *
   * A bare URL is not enough to ship: every licence worth using - Unsplash,
   * Creative Commons, a hotel's own press pack - requires the credit to
   * travel with the image. Storing the URL alone is how a photograph ends up
   * on screen with nobody able to say who took it or under what terms, which
   * is a licence violation waiting to be noticed.
   */
  photo: PlacePhoto | null;
  metrics: PlaceMetrics;
  /** Per-metric provenance, so the UI can say "live" vs "computed daily". */
  readings?: Partial<Record<keyof PlaceMetrics, MetricReading>>;
}

/** A place with its score computed. What GET /places actually returns. */
/**
 * A photograph and the terms it arrived under.
 *
 * `credit` is rendered ON the image, not buried in a settings screen: most
 * licences require attribution to appear with the work, and one that does not
 * still deserves it.
 */
export interface PlacePhoto {
  url: string;
  /** Photographer or rights holder, as they wish to be named. */
  credit: string;
  /** e.g. "Unsplash License", "CC BY-SA 4.0", "Used with permission". */
  licence: string;
  /** Where it came from, so the terms can be checked without asking us. */
  sourceUrl: string | null;
}

export interface ScoredPlace extends Place {
  healthyScore: number;
  breakdown: ScoreBreakdown;
  /**
   * Traveller ratings, kept OUT of the Healthy Score on purpose.
   *
   * The score is a measured claim about air, crowding, safety and
   * walkability, and every component can name its source. Folding a
   * subjective mean into it would make the number unexplainable, which is
   * the one property it must never lose.
   */
  reviews: ReviewSummary;
}

export interface ScoreComponent {
  key: keyof PlaceMetrics;
  label: Bilingual;
  /** Raw value formatted for display, e.g. "42 AQI", "8.1 / 10". */
  display: string;
  /** 0-100 normalised sub-score. */
  subScore: number;
  /** Weight actually applied for this user, 0-1. Sums to 1 across components. */
  weight: number;
  provenance: Provenance;
}

export interface ScoreBreakdown {
  total: number;
  components: ScoreComponent[];
  /** Which profile weighting produced this. Shown in "How is this calculated?". */
  profileApplied: string;
}

// ---------------------------------------------------------------------------
// Wellness profile (onboarding)
// ---------------------------------------------------------------------------

export type PurposeKey = 'wellness' | 'nature' | 'food' | 'volunteering' | 'quiet';
export type ActivityKey = 'gentle' | 'moderate' | 'full';
export type WatchKey = 'air' | 'crowd' | 'scam' | 'location' | 'language';

export interface WellnessProfile {
  purposes: PurposeKey[];
  activity: ActivityKey | null;
  watch: WatchKey[];
  /** ISO 8601. Null when the user skipped onboarding. */
  completedAt: string | null;
}

export const EMPTY_PROFILE: WellnessProfile = {
  purposes: [],
  activity: null,
  watch: [],
  completedAt: null,
};

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

export type QuestKind = 'today' | 'weekend';
export type HostType = 'municipality' | 'ngo' | 'hotel' | 'community' | 'platform';

export interface QuestHost {
  id: string;
  name: string;
  type: HostType;
}

export interface Quest {
  id: string;
  /**
   * Which ESG pillar this reports under, if any.
   *
   * Optional and often absent, deliberately. An ESG report EXCLUDES an
   * unclassified activity and says how many it excluded, rather than guessing
   * a pillar from the habitat layer — that guess would be right for a beach
   * cleanup and wrong for half the others, inside a document somebody signs.
   */
  esgPillar?: 'environmental' | 'social' | 'governance';
  /** Two-letter + number code shown in the 44x44 ink square. Not an icon. */
  code: string;
  name: Bilingual;
  where: string;
  /** Human duration, e.g. "45 min". */
  duration: string;
  rewardPoints: number;
  /** Which currency the reward pays in. Environmental work pays green. */
  rewardCurrency: Currency;
  host: QuestHost;
  kind: QuestKind;
  lat: number;
  lng: number;
  /** Metres. Arrival is geofence-verified against this. */
  geofenceRadiusM: number;
}

/**
 * The five-stage quest flow. SERVER-OWNED - the client never advances past
 * proof_submitted on its own, and never awards points locally.
 */
export const QUEST_STAGES = [
  'joined',
  'arrived',
  'proof_submitted',
  'host_verification',
  'complete',
] as const;
export type QuestStage = (typeof QUEST_STAGES)[number];

/** Stage index, matching the prototype questStage 0..4. */
export const stageIndex = (s: QuestStage): number => QUEST_STAGES.indexOf(s);

export interface QuestProgress {
  questId: string;
  userId: string;
  stage: QuestStage;
  joinedAt: string | null;
  arrivedAt: string | null;
  proofSubmittedAt: string | null;
  verifiedAt: string | null;
  /** Set when the host rejects. The UI must handle this - the design does not. */
  rejectedAt: string | null;
  /**
   * BILINGUAL, because the reviewer and the volunteer rarely share a language.
   * The preset reason is stored as a key and translated per reader; a
   * reviewer's free-text note is appended as typed, untranslated.
   */
  rejectionReason: Bilingual | null;
}

export interface ProofPhoto {
  uri: string;
  /** EXIF geotag, captured at the moment of shooting. */
  lat: number | null;
  lng: number | null;
  takenAt: string | null;
}

export interface ProofSubmission {
  id: string;
  questId: string;
  userId: string;
  photos: ProofPhoto[];
  /** Kilograms of waste collected, where the quest asks for it. */
  weightKg: number | null;
  submittedAt: string;
  /** True while queued offline and not yet uploaded. */
  pendingUpload: boolean;
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

/**
 * The two spendable currencies.
 *
 * They are not cosmetic variants of one balance. They differ in EVIDENCE:
 *
 *  - `green` is only ever awarded after a HOST verified a photo taken inside a
 *    geofence. Someone else vouched for it. This is the currency the Impact
 *    Ledger is built from, and the only one an ESG auditor could ever accept.
 *  - `trip` is self-verified: a geofenced check-in, rate limited. Cheap to
 *    earn, cheap to trust, and deliberately kept OUT of any impact claim.
 *
 * Mixing them would poison the audit trail, which is why the currency lives on
 * every ledger row rather than being inferred from the label.
 */
export type Currency = 'trip' | 'green';
export const CURRENCIES: readonly Currency[] = ['trip', 'green'] as const;

export interface Balances {
  trip: number;
  green: number;
}

export interface LedgerEntry {
  id: string;
  label: string;
  /** ISO 8601. The UI formats this as Today / Yesterday / "12 Oct". */
  occurredAt: string;
  /** Every entry names the verifying host. Non-negotiable for trust. */
  host: string;
  /** Signed. Positive credits, negative debits. */
  amount: number;
  currency: Currency;
  /**
   * EXP granted by this row. Zero on debits - spending must never cost
   * progress. Stored per row so lifetime EXP is always reconstructible from
   * the ledger alone.
   */
  exp: number;
  kind: 'quest_reward' | 'checkin' | 'review' | 'redemption' | 'adjustment';
  /** Idempotency key. The award must never double-fire. */
  sourceRef: string;
}

/**
 * Wallet payload.
 *
 * `progression` is deliberately NOT derived from `balances`. See progression.ts
 * for why deriving level from a spendable balance demotes anyone who spends.
 */
export interface Wallet {
  balances: Balances;
  progression: Progression;
  ledger: LedgerEntry[];
}

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------

export interface Offer {
  id: string;
  category: string;
  name: string;
  merchant: string;
  /** Merchant short name, used in the redemption toast. */
  merchantShort: string;
  costPoints: number;
  /** Which currency this offer is priced in. */
  currency: Currency;
  imageUrl: string | null;
  /** False when the merchant paused redemptions or stock ran out. */
  available: boolean;
}

/**
 * Handoff open question 4, resolved: a redemption produces a real voucher
 * artifact, not just a toast. The merchant scans it to settle.
 */
export interface Voucher {
  id: string;
  offerId: string;
  userId: string;
  merchant: string;
  /** Opaque code encoded into the QR the merchant scans. */
  code: string;
  costPoints: number;
  issuedAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  status: 'active' | 'redeemed' | 'expired' | 'cancelled';
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

/**
 * A traveller review.
 *
 * The deck answers fake reviews with "verified by a real check-in". That is
 * not a badge on some reviews - it is the precondition for one existing at
 * all. You cannot write about a place you were never at, so there is no such
 * thing here as an unverified review to distinguish from a verified one.
 *
 * `visitedAt` is copied from the check-in that unlocked it, not from the
 * moment of writing. Someone can write up their trip on the flight home and
 * the review still says when they were actually standing there.
 */
export interface PlaceReview {
  id: string;
  placeId: string;
  authorId: string;
  /** Display name as it stood when they wrote it. */
  authorName: string;
  /** 1-5. */
  rating: number;
  /** Optional: a rating with no words is still a useful signal. */
  body: string | null;
  /**
   * The language it was WRITTEN in.
   *
   * Labelled, never auto-translated. Unlike a rejection reason, a human
   * sentence cannot be keyed, and a machine translation presented as the
   * traveller's own words is a quote they never said.
   */
  language: string;
  /** When they were there, from the check-in. Not when they wrote. */
  visitedAt: string;
  createdAt: string;
  updatedAt: string | null;
}

/** Ratings rolled up for a place. */
export interface ReviewSummary {
  count: number;
  /** Mean to one decimal. Null when nobody has reviewed yet - NOT zero. */
  average: number | null;
  /** Histogram, index 0 is one star. */
  distribution: [number, number, number, number, number];
}

// ---------------------------------------------------------------------------
// Impact
// ---------------------------------------------------------------------------

export interface ImpactStat {
  key: string;
  label: Bilingual;
  value: number;
  unit: string;
}

/**
 * Community bars are actual/target, always COMPUTED - never hard-coded.
 * Targets come from the ESG owner (handoff open question 3).
 */
export interface CommunityMetric {
  key: string;
  label: Bilingual;
  actual: number;
  target: number;
  unit: string;
}

export interface ImpactSummary {
  personal: ImpactStat[];
  community: CommunityMetric[];
  /** Pilot year the community totals cover. */
  year: number;
}

// ---------------------------------------------------------------------------
// Safety Shield
// ---------------------------------------------------------------------------

export type ShieldState = 'on' | 'ready' | 'off';

export interface ShieldService {
  key: string;
  label: Bilingual;
  note: Bilingual;
  state: ShieldState;
}

/**
 * Handoff open question 5, resolved AGAINST the prototype: a live SOS alert
 * PERSISTS across navigation and shows a global banner. The prototype clears
 * it on navigate, which would silently drop a real emergency.
 */
export interface SosAlert {
  id: string;
  userId: string;
  status: 'dispatching' | 'acknowledged' | 'resolved' | 'cancelled';
  lat: number;
  lng: number;
  /** Reverse-geocoded, e.g. "Bophut, 400 m". */
  locationLabel: string;
  firedAt: string;
  resolvedAt: string | null;
  nearestHospital: string;
  contactsNotified: number;
  interpreterJoining: boolean;
}

// ---------------------------------------------------------------------------
// Itinerary
// ---------------------------------------------------------------------------

export interface ItineraryItem {
  id: string;
  /** "06:30" */
  time: string;
  name: Bilingual;
  tag: string;
  /** Drives the accent-bordered tag treatment. */
  isPointsRelated: boolean;
  placeId: string | null;
  questId: string | null;
}

export interface TripDay {
  dayNumber: number;
  /** ISO date. */
  date: string;
  walkingKm: number;
  pointsToday: number;
  airLabel: string;
  items: ItineraryItem[];
}

// ---------------------------------------------------------------------------
// API envelope
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: { total?: number; page?: number; limit?: number };
}

export interface ApiFailure {
  ok: false;
  error: string;
  code: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
