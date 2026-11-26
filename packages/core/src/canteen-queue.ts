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

/** The levels, shortest queue first. The order the report control offers them in. */
export const QUEUE_LEVELS: readonly QueueLevel[] = ['none', 'short', 'long'];

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
export const QUEUE_WORDS: Readonly<Record<QueueLevel, Bilingual>> = {
  none: { en: 'No queue', th: 'ไม่มีคิว', zh: '没有排队' },
  short: { en: 'A short queue', th: 'คิวสั้น', zh: '队伍很短' },
  long: { en: 'A long queue', th: 'คิวยาว', zh: '队伍很长' },
};

/** What the report control offers, in the first person - it is what you saw. */
export const QUEUE_REPORT_WORDS: Readonly<Record<QueueLevel, Bilingual>> = {
  none: { en: 'No queue', th: 'ไม่มีคิว', zh: '没有排队' },
  short: { en: 'Short', th: 'คิวสั้น', zh: '短' },
  long: { en: 'Long', th: 'คิวยาว', zh: '长' },
};

/**
 * The sentence under the food court's name.
 *
 * Always says who said it and when. Never "the queue is long" - that is the
 * app claiming to have looked.
 */
export function sayQueue(r: QueueReading): Bilingual {
  if (r.level === null) {
    return {
      en: `Nobody has reported the queue in the last ${FRESH_FOR_MIN} minutes. Tell people what you see.`,
      th: `ยังไม่มีใครแจ้งคิวใน ${FRESH_FOR_MIN} นาทีที่ผ่านมา เห็นคิวยังไงกดบอกคนอื่นได้`,
      zh: `最近 ${FRESH_FOR_MIN} 分钟内还没有人报告排队情况。看到了就告诉大家。`,
    };
  }
  const word = QUEUE_WORDS[r.level];
  const ago = r.minAgo ?? 0;
  const said = {
    en: ago === 0
      ? `Somebody there reported ${word.en.toLowerCase()} just now`
      : `Somebody there reported ${word.en.toLowerCase()} ${ago} min ago`,
    th: ago === 0
      ? `มีคนที่อยู่ตรงนั้นแจ้งว่า${word.th}เมื่อกี้`
      : `มีคนที่อยู่ตรงนั้นแจ้งว่า${word.th}เมื่อ ${ago} นาทีที่แล้ว`,
    zh: ago === 0
      ? `现场有人刚刚报告${word.zh ?? word.en}`
      : `现场有人在 ${ago} 分钟前报告${word.zh ?? word.en}`,
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
