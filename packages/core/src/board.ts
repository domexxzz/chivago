/**
 * The board: what everyone in an area has left behind, newest first.
 *
 * Until now the app was a private notebook. Each phone is its own account -
 * no sign-up, no password, and nothing to link - so a room full of people
 * using it at once produced a room full of separate apps, and nobody could
 * see that anybody else was there. The board is the one screen where the
 * separate accounts meet: a clip somebody filmed at the viewpoint, a review
 * somebody wrote at the shop row, in the order they happened.
 *
 * WHAT IS AND IS NOT ON IT.
 *
 * A story appears only once a host has approved it, which is the rule the
 * story flow already enforced for the projector screen. A review appears as
 * written, because a review already costs a geofenced check-in to write and
 * carries the author's own words. A CHECK-IN IS NOT AN ENTRY: "somebody was
 * at a beach" is not something anybody came to read, and a feed of them
 * would bury the two things that are.
 *
 * Nothing here invents an entry, softens one, or fills a quiet board with a
 * placeholder. An area where nobody has posted has an empty board, and the
 * screen says so in words.
 */

import type { Bilingual } from './types.ts';

/** How many entries a board carries. Past this, it is a scroll nobody finishes. */
export const BOARD_MAX = 40;

interface BoardCommon {
  id: string;
  /** When it happened, ISO. The one field the whole feed is ordered by. */
  at: string;
  placeId: string;
  placeName: Bilingual;
}

export interface BoardStory extends BoardCommon {
  kind: 'story';
  /** A clip or a photograph. The card says which, because a clip needs a tap. */
  media: 'video' | 'photo';
  caption: string;
  /** Paths relative to the API, as the story service returns them. */
  mediaUrl: string;
  posterUrl: string;
}

export interface BoardReview extends BoardCommon {
  kind: 'review';
  rating: number;
  body: string | null;
  authorName: string;
  /** The language it was WRITTEN in. Labelled, never auto-translated. */
  language: string;
}

export type BoardEntry = BoardStory | BoardReview;

/**
 * One feed out of two sources.
 *
 * Sorted by when the thing HAPPENED, not by which query returned it, so a
 * review written between two clips sits between them. Ties break on id, so
 * two entries written in the same second do not swap places between two
 * fetches and make the board look like it is shuffling itself.
 */
export function boardFeed(entries: readonly BoardEntry[], limit = BOARD_MAX): BoardEntry[] {
  return [...entries]
    .sort((a, b) => (b.at < a.at ? -1 : b.at > a.at ? 1 : a.id.localeCompare(b.id)))
    .slice(0, Math.max(0, limit));
}

/** How many of each are on the board, for the line under the heading. */
export function boardCounts(entries: readonly BoardEntry[]): { stories: number; reviews: number } {
  return {
    stories: entries.filter((e) => e.kind === 'story').length,
    reviews: entries.filter((e) => e.kind === 'review').length,
  };
}
