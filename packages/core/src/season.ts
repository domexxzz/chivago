import type { Localised } from './types.ts';

export type SeasonStatus = 'draft' | 'scheduled' | 'active' | 'ended' | 'archived';
export type SeasonCollectionKind =
  | 'stamp' | 'pet_costume' | 'mascot_costume' | 'memory' | 'achievement' | 'limited_item';

export interface SeasonCollectionItem {
  id: string;
  kind: SeasonCollectionKind;
  name: Localised;
  description: Localised;
  coinCost: number;
  catchUpAllowed: boolean;
  owned: boolean;
  earnedAt: string | null;
}

export interface SeasonOverview {
  id: string;
  status: SeasonStatus;
  theme: string;
  name: Localised;
  description: Localised;
  startsAt: string;
  endsAt: string;
  completedQuests: number;
  totalQuests: number;
  progressPercent: number;
  memoryCoins: number;
  items: SeasonCollectionItem[];
}
