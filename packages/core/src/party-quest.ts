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
  participants: PartyQuestParticipant[];
}

export const isPartyQuestType = (value: unknown): value is PartyQuestType =>
  typeof value === 'string' && PARTY_QUEST_TYPES.includes(value as PartyQuestType);

export const isPartyQuestMode = (value: unknown): value is PartyQuestMode =>
  typeof value === 'string' && PARTY_QUEST_MODES.includes(value as PartyQuestMode);
