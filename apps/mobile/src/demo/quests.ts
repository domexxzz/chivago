/**
 * Quest reads for the static demo.
 *
 * They are derived from the same active catalogue as the API instead of the
 * old capture, so a deployed demo cannot revive a retired quest when its JSON
 * snapshot is older than the app release.
 */
import { ACTIVE_QUESTS, isActiveQuestCode, type Quest } from '@chivago/core';

export function demoQuestList(): { quests: Quest[]; progress: Record<string, never> } {
  return { quests: ACTIVE_QUESTS, progress: {} };
}

export function demoQuestDetail(id: string): { quest: Quest; progress: null } | null {
  const quest = ACTIVE_QUESTS.find((item) => item.id === id);
  return quest && isActiveQuestCode(quest.code) ? { quest, progress: null } : null;
}
