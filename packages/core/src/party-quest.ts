/** Party Quest dimensions. These deliberately do not change legacy QuestKind. */
export const PARTY_QUEST_TYPES = ['exploration', 'eco', 'local', 'boss'] as const;
export type PartyQuestType = (typeof PARTY_QUEST_TYPES)[number];

export const PARTY_QUEST_MODES = [
  'individual', 'collective', 'all_members', 'cooperative',
] as const;
export type PartyQuestMode = (typeof PARTY_QUEST_MODES)[number];

export const PARTY_QUEST_STATES = [
  'selected', 'in_progress', 'verifying', 'completed', 'rewarded',
  'failed', 'expired', 'cancelled',
] as const;
export type PartyQuestState = (typeof PARTY_QUEST_STATES)[number];

export type PartyQuestMembershipStatus = 'active' | 'left';

export interface PartyQuestParticipant {
  userId: string;
  displayName: string;
  ownerAtStart: boolean;
  membershipStatus: PartyQuestMembershipStatus;
  rosteredAt: string;
  leftPartyAt: string | null;
  rejoinedAt: string | null;
  completedAt: string | null;
  assignment: string | null;
}

export interface PartyQuestInstance {
  id: string;
  partyId: string;
  questId: string;
  questType: PartyQuestType;
  questMode: PartyQuestMode;
  state: PartyQuestState;
  rulesVersion: string;
  questSnapshot: Record<string, unknown>;
  selectedBy: string;
  selectedAt: string;
  startedAt: string | null;
  rosterLockedAt: string | null;
  cancelledAt: string | null;
  deadlineAt: string | null;
  completedAt: string | null;
  rewardedAt: string | null;
  participants: PartyQuestParticipant[];
}

export interface PartyQuestParticipantProgress {
  userId: string;
  displayName: string;
  membershipStatus: PartyQuestMembershipStatus;
  stage: import('./types.ts').QuestStage | null;
  verifiedAt: string | null;
  verifiedWeightKg: number | null;
  assignment: string | null;
  contribution: number;
}

/**
 * Read model for a locked Party Quest roster. Every value comes from the
 * legacy server-owned quest state; the client never supplies a percentage.
 */
export interface PartyQuestProgressSummary {
  partyQuestId: string;
  questId: string;
  rosterSize: number;
  completedCount: number;
  pendingReviewCount: number;
  progressPercent: number;
  totalVerifiedWeightKg: number | null;
  completionReady: boolean;
  deadlineAt: string | null;
  participants: PartyQuestParticipantProgress[];
}

export const isPartyQuestType = (value: unknown): value is PartyQuestType =>
  typeof value === 'string' && PARTY_QUEST_TYPES.includes(value as PartyQuestType);

export const isPartyQuestMode = (value: unknown): value is PartyQuestMode =>
  typeof value === 'string' && PARTY_QUEST_MODES.includes(value as PartyQuestMode);
