/** Fixtures shaped like real API responses. */

import {
  progressionFor,
  type Offer, type PlaceReview, type Quest, type QuestProgress,
  type ReviewSummary, type ScoredPlace, type ShieldService, type Wallet,
} from '@chivago/core';

export const wallet = (over: Partial<Wallet> = {}): Wallet => ({
  balances: { trip: 320, green: 1240 },
  progression: progressionFor(1560),
  ledger: [
    {
      id: 'l1', label: 'Beach Cleanup', occurredAt: '2026-08-31T02:00:00.000Z',
      host: 'Samui Municipality', amount: 150, currency: 'green', exp: 150,
      kind: 'quest_reward', sourceRef: 'quest:q1:user:u1',
    },
    {
      id: 'l2', label: 'Cold brew redeemed', occurredAt: '2026-08-31T03:00:00.000Z',
      host: 'Sabeinglae Coffee', amount: -180, currency: 'trip', exp: 0,
      kind: 'redemption', sourceRef: 'voucher:v1',
    },
  ],
  ...over,
});

export const quest = (over: Partial<Quest> = {}): Quest => ({
  id: 'q1', code: 'BC-04',
  name: { en: 'Beach Cleanup', th: 'เก็บขยะชายหาด' },
  where: 'Chaweng Beach', duration: '45 min',
  rewardPoints: 150, rewardCurrency: 'green',
  host: { id: 'h1', name: 'Samui Municipality', type: 'municipality' },
  kind: 'today', lat: 9.5357, lng: 100.0617, geofenceRadiusM: 250,
  ...over,
});

export const offer = (over: Partial<Offer> = {}): Offer => ({
  id: 'o1', category: 'Café', name: 'Cold brew + banana bread',
  merchant: 'Sabeinglae Coffee, Bophut', merchantShort: 'Sabeinglae Coffee',
  costPoints: 180, currency: 'trip', imageUrl: null, available: true,
  ...over,
});

export const review = (over: Partial<PlaceReview> = {}): PlaceReview => ({
  id: 'r1', placeId: 'chaweng', authorId: 'u1', authorName: 'Traveller',
  rating: 5, body: 'Quiet at 7am, shade at the north end, and the water is clean.',
  language: 'en',
  visitedAt: '2026-08-25T02:00:00.000Z',
  createdAt: '2026-08-31T02:00:00.000Z',
  updatedAt: null,
  ...over,
});

export const summary = (over: Partial<ReviewSummary> = {}): ReviewSummary => ({
  count: 0, average: null, distribution: [0, 0, 0, 0, 0], ...over,
});

export const place = (over: Partial<ScoredPlace> = {}): ScoredPlace => ({
  id: 'chaweng',
  name: { en: 'Chaweng Beach', th: 'หาดเฉวง' },
  short: 'Chaweng',
  layer: 'beach',
  lat: 9.5357, lng: 100.0617,
  meta: 'Beach · 2.1 km of sand',
  blurb: {
    en: 'Quiet at 7am, shade at the north end, and the water is clean.',
    th: 'เงียบตอนเจ็ดโมง มีร่มเงาทางเหนือ และน้ำใส',
  },
  tags: ['Swimming', 'Sunrise'],
  photo: null,
  metrics: { crowdDensity: 1.4, aqi: 42, safetyIndex: 8.1, walkability: 7.6 },
  healthyScore: 82,
  breakdown: {
    total: 82,
    profileApplied: 'Nature seeker',
    components: [
      { key: 'aqi', label: { en: 'Air quality', th: 'คุณภาพอากาศ' }, display: '42 AQI', subScore: 88, weight: 0.4, provenance: 'live' },
      { key: 'crowdDensity', label: { en: 'Crowding', th: 'ความหนาแน่น' }, display: '1.4 / 100 m²', subScore: 74, weight: 0.3, provenance: 'live' },
      { key: 'safetyIndex', label: { en: 'Safety', th: 'ความปลอดภัย' }, display: '8.1 / 10', subScore: 81, weight: 0.2, provenance: 'daily' },
      { key: 'walkability', label: { en: 'Walkability', th: 'การเดินเท้า' }, display: '7.6 / 10', subScore: 76, weight: 0.1, provenance: 'daily' },
    ],
  },
  reviews: summary(),
  ...over,
});

export const progress = (over: Partial<QuestProgress> = {}): QuestProgress => ({
  questId: 'q1', userId: 'demo-user', stage: 'joined',
  joinedAt: '2026-08-31T01:00:00.000Z',
  arrivedAt: null, proofSubmittedAt: null, verifiedAt: null,
  rejectedAt: null, rejectionReason: null,
  ...over,
});

export const shield = (): ShieldService[] => [
  { key: 'sos', label: { en: 'One-tap SOS', th: 'SOS แตะเดียว' }, note: { en: 'Dispatches to Bophut station', th: 'ส่งไปสถานีบ่อผุด' }, state: 'ready' },
  { key: 'interpreter', label: { en: 'Thai interpreter', th: 'ล่ามภาษาไทย' }, note: { en: 'Joins within 90 seconds', th: 'เข้าร่วมภายใน 90 วินาที' }, state: 'on' },
  { key: 'share', label: { en: 'Live location share', th: 'แชร์ตำแหน่งสด' }, note: { en: 'Off until you turn it on', th: 'ปิดอยู่จนกว่าคุณจะเปิด' }, state: 'off' },
];
