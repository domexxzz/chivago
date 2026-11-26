/**
 * How long the queue is at the food court, as the people standing in it say.
 *
 * WHY THIS EXISTS. docs/65 answers "how long will my food take" with the
 * stall's own number, read from its kitchen queue in สั่งก่อน - and that is the
 * right answer, because only the kitchen knows. But on 26 November 2026
 * สั่งก่อน's `/api/shops` still lists exactly one shop, `demo`, its own example:
 * no stall in this food court has signed up. So the app can say nothing at all
 * about the one hour of the day when everybody turns up at once.
 *
 * The question a student has at noon is not "how many minutes for noodles". It
 * is "is it worth walking over yet". That one does not need a kitchen. It needs
 * somebody who is already there, which is the same answer transit.ts reached
 * for the campus shuttle: when nobody publishes it, measure what can be
 * observed and word it as an observation.
 *
 * WHAT A REPORT IS NOT. Not a wait in minutes. A person cannot measure the
 * minutes of a queue and the number would be believed - and it would compete
 * with the stall's own figure, which is measured. Three levels, no numbers, and
 * every reading carries its age.
 *
 * WHAT ELSE ASKS THIS. The library, from 26 November 2026. The question there
 * is not "how long is the line" but "is there anywhere to sit", and underneath
 * it is the same one: how crowded is it, answerable only by somebody standing
 * in it, and worth nothing twenty minutes later. So the reading, the staleness
 * and the ceiling are shared and only the WORDS differ - a `CrowdingKind`
 * picks them.
 *
 * It also replaces a claim this app has been making with nobody behind it: the
 * library's card has called it "the calmest place to sit down on this map"
 * since the seed was written. Nobody measured that, and in the week before
 * exams it is false.
 *
 * THE NAMES HERE KEEP THE QUEUE'S WORDS - `QueueLevel`, `readQueue`, and the
 * `canteen_queue_reports` table under them - because that is what the stored
 * values are called, down to the CHECK constraint, and renaming a live table
 * to read better is a migration that can only lose. What a level MEANS is the
 * kind's business; what it is CALLED in the database is history, written down.
 *
 * WHAT GOES STALE. A queue at a food court turns over in minutes: a report
 * from twenty minutes ago is not news about now, it is news about the start of
 * the hour. Past `FRESH_FOR_MIN` the app says nobody has reported recently
 * rather than showing an old level as the current one - the same rule as the
 * stall card's ten minutes (docs/65, rule 3).
 */

import type { Bilingual } from './types.ts';

/**
 * How long the queue is, in the only terms somebody standing in it can give.
 *
 * Ordered, so `worst` and a disagreement can be spoken about, and deliberately
 * three: a five-point scale invites a precision nobody has.
 */
export type QueueLevel = 'none' | 'short' | 'long';

/** The levels, least crowded first. The order the report control offers them in. */
export const QUEUE_LEVELS: readonly QueueLevel[] = ['none', 'short', 'long'];

/**
 * What being crowded MEANS here, which decides every word on the card.
 *
 * Not a matter of style. At a food court the thing in front of you is a line
 * and the three levels are its length. In a library there is no line at all:
 * what you are looking for is a free seat, and 'long' means there are none.
 * One scale, two things it can be about.
 */
export type CrowdingKind = 'queue' | 'seats';

/**
 * The places somebody may report on, and what they are reporting.
 *
 * A short explicit list rather than a rule, because a report belongs to a
 * place a person can stand in and look at. The food court came first, from
 * `PLACE_STALLS`; the library is here because its card claims a calm that has
 * never been measured.
 */
export const CROWDING_PLACES: Readonly<Record<string, CrowdingKind>> = {
  'rmutt-canteen': 'queue',
  'rmutt-library': 'seats',
};

/** What this place's crowding is called, or null where nobody may report. */
export const crowdingKindOf = (placeId: string): CrowdingKind | null =>
  Object.hasOwn(CROWDING_PLACES, placeId) ? CROWDING_PLACES[placeId]! : null;

/** How long a report is spoken of as current. */
export const FRESH_FOR_MIN = 15;

/** One report per person per place in this window, so one phone is not a crowd. */
export const REPORT_EVERY_MIN = 5;

export interface QueueReport {
  placeId: string;
  level: QueueLevel;
  /** When it was reported, ISO. */
  at: string;
}

/** What the screen is given: the latest report, how old, and who else agrees. */
export interface QueueReading {
  /** Null when nothing was reported inside the fresh window. */
  level: QueueLevel | null;
  /** Whole minutes since the newest report, or null when there is none. */
  minAgo: number | null;
  /** Reports inside the fresh window, this one included. */
  reports: number;
  /**
   * Whether the window holds more than one level.
   *
   * Not resolved into an average: two people can both be right about different
   * doors of the same hall, and a queue that is "between short and long" is a
   * number this app has no way to earn. The newest is shown, and the screen
   * says the reports do not agree.
   */
  disagrees: boolean;
}

/** Nothing reported. Named, so a screen never builds an empty reading by hand. */
export const NO_QUEUE_READING: QueueReading = { level: null, minAgo: null, reports: 0, disagrees: false };

/**
 * Read a place's reports as of `now`.
 *
 * Anything older than the fresh window is dropped before anything is counted,
 * so an old report cannot raise the count behind a level it no longer supports.
 */
export function readQueue(reports: readonly QueueReport[], now: number): QueueReading {
  const since = now - FRESH_FOR_MIN * 60_000;
  const fresh = reports
    .map((r) => ({ level: r.level, at: Date.parse(r.at) }))
    .filter((r) => Number.isFinite(r.at) && r.at >= since && r.at <= now)
    .sort((a, b) => b.at - a.at);
  const newest = fresh[0];
  if (!newest) return NO_QUEUE_READING;
  return {
    level: newest.level,
    // Floored: "1 min ago" must not be said of something fifty seconds old.
    minAgo: Math.max(0, Math.floor((now - newest.at) / 60_000)),
    reports: fresh.length,
    disagrees: fresh.some((r) => r.level !== newest.level),
  };
}

/** What the level itself is called. */
/**
 * Written in all three, with no English to fall back on.
 *
 * `Bilingual` leaves `zh` optional, which is right for the app at large and
 * wrong here: these words are dropped into the MIDDLE of a sentence, and a
 * sentence half in Chinese and half in English is worse than either.
 */
type Trilingual = Bilingual & { zh: string };

/** Everything one kind of crowding is called, so a card needs no other source. */
export interface CrowdingWords {
  /** The heading over the card. */
  title: Trilingual;
  /** The level INSIDE a sentence - "somebody there reported ..." - so, lower case. */
  level: Readonly<Record<QueueLevel, Trilingual>>;
  /** The level on its own button, where it is read alone and must be short. */
  button: Readonly<Record<QueueLevel, Trilingual>>;
  /** Nobody has reported inside the window. */
  silent: Trilingual;
  /** The invitation over the buttons. */
  ask: Trilingual;
  /** The reports could not be read at all. Not the same as nobody reporting. */
  down: Trilingual;
}

export const CROWDING_WORDS: Readonly<Record<CrowdingKind, CrowdingWords>> = {
  queue: {
    title: { en: 'The queue right now', th: 'คิวตอนนี้', zh: '当前排队情况' },
    level: {
      none: { en: 'no queue', th: 'ไม่มีคิว', zh: '没有排队' },
      short: { en: 'a short queue', th: 'คิวสั้น', zh: '队伍很短' },
      long: { en: 'a long queue', th: 'คิวยาว', zh: '队伍很长' },
    },
    button: {
      none: { en: 'No queue', th: 'ไม่มีคิว', zh: '没有排队' },
      short: { en: 'Short', th: 'คิวสั้น', zh: '短' },
      long: { en: 'Long', th: 'คิวยาว', zh: '长' },
    },
    silent: {
      en: `Nobody has reported the queue in the last ${FRESH_FOR_MIN} minutes. Tell people what you see.`,
      th: `ยังไม่มีใครแจ้งคิวใน ${FRESH_FOR_MIN} นาทีที่ผ่านมา เห็นคิวยังไงกดบอกคนอื่นได้`,
      zh: `最近 ${FRESH_FOR_MIN} 分钟内还没有人报告排队情况。看到了就告诉大家。`,
    },
    ask: { en: 'Standing there? Tell people what you see.', th: 'อยู่ตรงนั้นอยู่ไหม บอกคนอื่นหน่อย', zh: '你在现场吗？告诉大家你看到的情况。' },
    down: { en: 'Could not read the queue reports.', th: 'อ่านรายงานคิวไม่ได้', zh: '无法读取排队报告。' },
  },
  /*
    A LIBRARY HAS NO QUEUE. What a person wants to know before walking over is
    whether they will get a seat, so the levels are seats and 'long' - the most
    crowded rung - is none left. The buttons say it in the fewest words that
    are still unambiguous when read alone.
  */
  seats: {
    title: { en: 'How busy it is now', th: 'ตอนนี้คนเยอะไหม', zh: '现在人多吗' },
    level: {
      none: { en: 'plenty of free seats', th: 'ที่นั่งว่างเยอะ', zh: '空位很多' },
      short: { en: 'a few free seats', th: 'พอมีที่นั่ง', zh: '还有一些空位' },
      long: { en: 'no free seats', th: 'ไม่มีที่นั่งว่าง', zh: '没有空位' },
    },
    button: {
      none: { en: 'Plenty free', th: 'ว่างเยอะ', zh: '空位很多' },
      short: { en: 'A few left', th: 'พอมีที่', zh: '还有一些' },
      long: { en: 'Full', th: 'เต็ม', zh: '满了' },
    },
    silent: {
      en: `Nobody has reported the seats in the last ${FRESH_FOR_MIN} minutes. Tell people what you see.`,
      th: `ยังไม่มีใครแจ้งเรื่องที่นั่งใน ${FRESH_FOR_MIN} นาทีที่ผ่านมา เห็นยังไงกดบอกคนอื่นได้`,
      zh: `最近 ${FRESH_FOR_MIN} 分钟内还没有人报告座位情况。看到了就告诉大家。`,
    },
    ask: { en: 'Sitting there? Tell people what you see.', th: 'นั่งอยู่ตรงนั้นไหม บอกคนอื่นหน่อย', zh: '你在馆内吗？告诉大家你看到的情况。' },
    down: { en: 'Could not read the reports.', th: 'อ่านรายงานไม่ได้', zh: '无法读取报告。' },
  },
};


/**
 * The sentence under the place's name.
 *
 * Always says WHO said it and WHEN. Never "the queue is long" or "the library
 * is full" - those are the app claiming to have looked, and it has not. The
 * frame is one sentence for both kinds and only the level's words change,
 * which is why the level words are written lower case and ready to be dropped
 * into the middle of it.
 */
export function sayCrowding(kind: CrowdingKind, r: QueueReading): Bilingual {
  const words = CROWDING_WORDS[kind];
  if (r.level === null) return words.silent;
  const word = words.level[r.level];
  const ago = r.minAgo ?? 0;
  const said = {
    en: ago === 0
      ? `Somebody there reported ${word.en} just now`
      : `Somebody there reported ${word.en} ${ago} min ago`,
    th: ago === 0
      ? `มีคนที่อยู่ตรงนั้นแจ้งว่า${word.th}เมื่อกี้`
      : `มีคนที่อยู่ตรงนั้นแจ้งว่า${word.th}เมื่อ ${ago} นาทีที่แล้ว`,
    zh: ago === 0
      ? `现场有人刚刚报告${word.zh}`
      : `现场有人在 ${ago} 分钟前报告${word.zh}`,
  };
  if (r.disagrees) {
    return {
      en: `${said.en}. Reports in the last ${FRESH_FOR_MIN} minutes do not agree (${r.reports}).`,
      th: `${said.th} · คนที่แจ้งใน ${FRESH_FOR_MIN} นาทีที่ผ่านมาบอกไม่ตรงกัน (${r.reports} คน)`,
      zh: `${said.zh}。最近 ${FRESH_FOR_MIN} 分钟内的报告并不一致（${r.reports} 条）。`,
    };
  }
  if (r.reports > 1) {
    return {
      en: `${said.en}, and ${r.reports} reports agree.`,
      th: `${said.th} · ตรงกัน ${r.reports} คน`,
      zh: `${said.zh}，共 ${r.reports} 条报告一致。`,
    };
  }
  return said;
}

/**
 * Whether this person may report again yet, and what to say if not.
 *
 * The window is per person per place, counted from their own last report: a
 * crowd of one is the failure this stops, and it is the same ceiling the bus
 * sightings keep.
 */
export const mayReportAgain = (lastAt: string | null, now: number): boolean => {
  if (lastAt === null) return true;
  const at = Date.parse(lastAt);
  if (!Number.isFinite(at)) return true;
  return now - at >= REPORT_EVERY_MIN * 60_000;
};

/** Whether a value off the wire is a level this app knows. */
export const isQueueLevel = (v: unknown): v is QueueLevel =>
  typeof v === 'string' && (QUEUE_LEVELS as readonly string[]).includes(v);
