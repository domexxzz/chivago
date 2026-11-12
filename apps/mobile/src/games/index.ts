/**
 * The mini-games: whole HTML pages the app hands to a browser it owns.
 *
 * A mini-game is not a screen. It is a document written by somebody who was
 * not working in this codebase, kept intact, and shown inside a WebView by
 * `MiniGameScreen`. That is the whole arrangement, and it is deliberate: the
 * pages arrive finished, and re-typing a finished game in React Native buys
 * nothing a player can see while costing days and introducing bugs the
 * original did not have.
 *
 * WHY A LIST AND NOT A SCREEN PER GAME. There is one game today and a second
 * one - เชฟชังชังเปิดร้าน - already written and waiting on its artwork. One
 * route, one screen and one card component that read from this list means the
 * second game is an entry here rather than a route, a screen, a card and four
 * edits somebody has to remember to make together.
 *
 * WHAT A GAME MAY NOT DO, and this is the part to defend:
 *
 *   It may not award Green or Trip. Those are the ledger, the ledger is
 *   evidence, and a balance earned by guessing which bin a banana peel goes
 *   in is evidence of nothing. A game keeps its own score, in its own page,
 *   in `localStorage`, and that score stops at the edge of the document.
 *
 *   It may not award a medal, or anything that reads as one. The app has real
 *   medals and a host verifies the work behind them.
 *
 *   It may not reach the network. Every page here is self-contained - fonts,
 *   artwork, logic - so it opens on the ferry, and so that playing a game
 *   tells no third party anything about who played it. `mini-games.test.ts`
 *   holds this one to the letter, because it is the rule most easily lost to
 *   a convenient `<img src="https://...">` a year from now.
 */

import type { Localised } from '@chivago/core';
import type { Locale } from '../i18n/locale.ts';
import { WASTE_SORT_HTML } from './waste-sort.ts';

export type MiniGameKey = 'waste-sort';

export type MiniGame = {
  key: MiniGameKey;
  /** The card's words and the pushed screen's title. These ARE translated. */
  name: Localised;
  blurb: Localised;
  /**
   * The language the PAGE is written in, which is not the app's.
   *
   * The card above the game speaks all three; the game itself speaks Thai and
   * there is no version of it that does not. The screen says so in a line
   * rather than letting somebody open it and find out - a page in a language
   * you cannot read is indistinguishable from a page that failed to load.
   */
  language: Locale;
  /** Four flat swatches for the card, taken from what the game is about. */
  swatches: readonly string[];
  html: string;
};

export const MINI_GAMES: readonly MiniGame[] = [
  {
    key: 'waste-sort',
    name: { en: 'Sort it right', th: 'ภารกิจแยกขยะ', zh: '垃圾分类任务' },
    blurb: {
      en: 'Twelve things, four bins, and the reason for each one.',
      th: 'ของ 12 ชิ้น ถัง 4 ใบ พร้อมเหตุผลของทุกชิ้น',
      zh: '十二件物品，四个垃圾桶，每一件都有理由。',
    },
    language: 'th',
    // ขยะเปียก · รีไซเคิล · ทั่วไป · อันตราย, in the page's own four colours.
    swatches: ['#39A65F', '#E6B33C', '#388EC5', '#DF6862'],
    html: WASTE_SORT_HTML,
  },
];

/** The game by key, or null - a route that outlived its entry shows nothing. */
export const miniGame = (key: string): MiniGame | null =>
  MINI_GAMES.find((game) => game.key === key) ?? null;
