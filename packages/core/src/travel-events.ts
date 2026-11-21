import type { Localised } from './types.ts';

export const TRAVEL_EVENT_TYPES = [
  'LOCATION_VISITED', 'CHECK_IN_VERIFIED', 'QUEST_STARTED', 'QUEST_COMPLETED',
  'CLUE_DISCOVERED', 'STORY_UNLOCKED', 'PARTY_QUEST_COMPLETED',
  'SHOP_ACTIVITY_VERIFIED', 'STAMP_EARNED', 'PET_MEMORY_CREATED',
  'SEASON_MILESTONE_REACHED', 'QR_SCANNED', 'QR_VERIFIED',
  'EVIDENCE_SUBMITTED', 'EVIDENCE_APPROVED', 'EVIDENCE_REJECTED',
  'HOST_VERIFIED', 'ACTIVITY_VERIFIED',
] as const;
export type TravelEventType = (typeof TRAVEL_EVENT_TYPES)[number];

export interface TravelEvent {
  id: string;
  type: TravelEventType;
  sourceKind: string;
  sourceRef: string;
  placeId: string | null;
  questId: string | null;
  partyId: string | null;
  occurredAt: string;
  invalidatedAt: string | null;
  metadata: Record<string, unknown>;
}

export type PetMemoryType = 'verified_visit' | 'verified_quest' | 'story_unlock' | 'party_adventure' | 'seasonal_adventure';
export interface PetMemory {
  id: string;
  eventId: string;
  companionKey: string;
  memoryType: PetMemoryType;
  place: { id: string; name: Localised } | null;
  occurredAt: string;
}

export type JournalVisibility = 'private' | 'shared';
export type TravelJournalEntryKind = 'verified_visit' | 'verified_quest' | 'story_unlock';
export interface TravelJournalEntry {
  id: string;
  kind: TravelJournalEntryKind;
  note: string | null;
  visibility: JournalVisibility;
  createdAt: string;
  updatedAt: string;
  event: TravelEvent;
  place: { id: string; name: Localised; photoUrl: string | null } | null;
}

export interface TravelCycleResult {
  events: TravelEvent[];
  storyNodeIds: string[];
  petMemories: PetMemory[];
  journalEntryIds: string[];
}

export const PET_GESTURES = [
  { key: 'happy', unlockLevel: 1, name: { en: 'Happy', th: 'ดีใจ', zh: '开心' } },
  { key: 'curious', unlockLevel: 1, name: { en: 'Curious', th: 'สงสัย', zh: '好奇' } },
  { key: 'wave', unlockLevel: 2, name: { en: 'Wave', th: 'โบกมือ', zh: '挥手' } },
  { key: 'explore', unlockLevel: 3, name: { en: 'Explore', th: 'สำรวจ', zh: '探索' } },
  { key: 'celebrate', unlockLevel: 4, name: { en: 'Celebrate', th: 'ฉลอง', zh: '庆祝' } },
  { key: 'sleep', unlockLevel: 5, name: { en: 'Sleep', th: 'นอน', zh: '睡觉' } },
  { key: 'sad', unlockLevel: 6, name: { en: 'Sad', th: 'เศร้า', zh: '伤心' } },
] as const;
export type PetGesture = (typeof PET_GESTURES)[number]['key'];
export const isPetGesture = (value: unknown): value is PetGesture =>
  typeof value === 'string' && PET_GESTURES.some((gesture) => gesture.key === value);

export interface PetProgression {
  companionKey: string;
  exp: number;
  level: number;
  bondLevel: number;
  levelProgress: number;
  nextLevelExp: number | null;
  unlockedGestures: PetGesture[];
  memoryCount: number;
}

const memoryExp = (memory: PetMemory): number =>
  memory.memoryType === 'story_unlock' ? 30 : memory.memoryType === 'verified_quest' ? 35 : 20;
const LEVEL_STARTS = [0, 50, 120, 220, 360, 540] as const;

/** Pure projection: verified memories are the ledger, so retries cannot add EXP. */
export function petProgressionFor(companionKey: string, memories: PetMemory[]): PetProgression {
  const unique = [...new Map(memories.map((memory) => [memory.eventId, memory])).values()];
  const exp = unique.reduce((sum, memory) => sum + memoryExp(memory), 0);
  let level = 1;
  for (let index = 1; index < LEVEL_STARTS.length; index += 1) {
    if (exp >= LEVEL_STARTS[index]!) level = index + 1;
  }
  const start = LEVEL_STARTS[Math.min(level - 1, LEVEL_STARTS.length - 1)]!;
  const next = LEVEL_STARTS[level] ?? null;
  return {
    companionKey, exp, level, bondLevel: level, memoryCount: unique.length,
    nextLevelExp: next,
    levelProgress: next === null ? 1 : Math.max(0, Math.min(1, (exp - start) / (next - start))),
    unlockedGestures: PET_GESTURES.filter((gesture) => gesture.unlockLevel <= level).map((gesture) => gesture.key),
  };
}

export interface TravelTripPhoto {
  id: string; url: string; caption: string | null; sortOrder: number; createdAt: string;
}
export interface TravelTripSummary {
  places: number; quests: number; stories: number; petMemories: number; stamps: number; partyMembers: number;
}
export interface TravelTrip {
  id: string; name: string; visibility: JournalVisibility;
  startAt: string | null; endAt: string | null; coverPhotoId: string | null;
  entries: TravelJournalEntry[]; photos: TravelTripPhoto[]; summary: TravelTripSummary;
  createdAt: string; updatedAt: string;
}
