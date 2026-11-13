import type { ImageSourcePropType } from 'react-native';
import { Image } from 'react-native';
import type { QuestProgress } from '@chivago/core';

import malePlayer from '../../assets/icons/01-male-player.png';
import femalePlayer from '../../assets/icons/02-female-player.png';
import quest from '../../assets/icons/03-quest.png';
import culture from '../../assets/icons/04-culture.png';
import game from '../../assets/icons/05-game.png';
import food from '../../assets/icons/06-food.png';
import otop from '../../assets/icons/07-otop.png';
import workshop from '../../assets/icons/08-workshop.png';
import eco from '../../assets/icons/09-eco.png';
import viewpoint from '../../assets/icons/10-viewpoint.png';
import pier from '../../assets/icons/11-pier.png';
import transport from '../../assets/icons/12-transport.png';
import hospital from '../../assets/icons/13-hospital.png';
import toilet from '../../assets/icons/14-toilet.png';
import info from '../../assets/icons/15-info.png';
import treasure from '../../assets/icons/16-treasure.png';
import questNew from '../../assets/icons/17-quest-new.png';
import questInProgress from '../../assets/icons/18-quest-in-progress.png';
import questCompleted from '../../assets/icons/19-quest-completed.png';
import questLocked from '../../assets/icons/20-quest-locked.png';
import questNewClue from '../../assets/icons/21-quest-new-clue.png';

/**
 * The drawn icon set delivered with the Ko Sichang field guide.
 *
 * These are RASTER, and the rest of the app draws its icons with
 * `lucide-react-native`, which is vector and takes a colour prop. That
 * difference is the whole reason this file exists rather than the icons being
 * swapped in everywhere: a lucide glyph recolours per theme and per state, and
 * one of these cannot. So they are used where a drawing says something a
 * glyph does not - a quest's state on its card - and lucide keeps the rest.
 *
 * Imported statically, not `require`d: the test runner loads these modules as
 * ES modules, where `require` is not defined.
 *
 * Every icon in the set is exported, including the ones nothing calls yet, so
 * that the set stays whole and a future screen can reach for one without
 * going back to the archive. `QUEST_STATUS_ICON` below is the only part with
 * a consumer today.
 */
export const ISLAND_ICONS: Readonly<Record<string, ImageSourcePropType>> = {
  malePlayer, femalePlayer, quest, culture, game, food, otop, workshop, eco,
  viewpoint, pier, transport, hospital, toilet, info, treasure,
  questNew, questInProgress, questCompleted, questLocked, questNewClue,
};

/**
 * The three quest states a card can actually be in.
 *
 * `questLocked` and `questNewClue` are drawn but unused: nothing in the app
 * locks a quest behind another, and there is no clue to be new. Wiring either
 * would mean inventing a state to hang it on, so they wait for the feature
 * that needs them rather than the other way round.
 */
export const QUEST_STATUS_ICON = {
  new: questNew,
  inProgress: questInProgress,
  completed: questCompleted,
} as const;

export type QuestStatus = keyof typeof QUEST_STATUS_ICON;

/** Which of the three a card is showing, read off the server-owned stage. */
export function questStatusOf(progress: QuestProgress | null | undefined): QuestStatus {
  if (!progress) return 'new';
  return progress.stage === 'complete' ? 'completed' : 'inProgress';
}

/**
 * The icon for a quest's state, sized for the pill it sits in.
 *
 * Hidden from accessibility on purpose: the pill beside it already carries
 * the words, in whichever of the three languages is on, and a screen reader
 * announcing the drawing as well would read the state twice.
 */
export function QuestStatusIcon({ status, size = 14 }: { status: QuestStatus; size?: number }) {
  return (
    <Image
      source={QUEST_STATUS_ICON[status]}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
