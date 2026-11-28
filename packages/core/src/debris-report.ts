/**
 * A traveller's photograph of rubbish, on its way to becoming one case.
 *
 * This is the first step of the five the Ko Sichang proposal draws ("one
 * report's journey"): the traveller photographs what washed up, answers three
 * questions, and is done. Everything after that is the work of people with
 * tools, and lives elsewhere.
 *
 * WHAT THIS REFUSES.
 *
 *   A REPORT EARNS NOTHING. Not a point, not a badge, not a streak. Pay for
 *   the button and people press it for the pay, and then the queue the
 *   municipality decides tomorrow's rounds from is worth nothing. Nothing in
 *   this file or the service behind it touches a wallet, and a test says so.
 *
 *   A REPORT WITHOUT THE PHONE'S OWN POSITION IS NOT A REPORT. The coordinate
 *   is the one fact only the person standing there can supply, and a position
 *   the operating system itself calls simulated is refused before anything
 *   else is read.
 *
 *   FOUR PEOPLE AT ONE PILE ARE ONE CASE, NOT FOUR. A second report within
 *   DEBRIS_MERGE_RADIUS_M of an open case, inside DEBRIS_MERGE_WINDOW_MS of its
 *   last report, joins it. That is not junk to throw away: how many people saw
 *   it is how strong the signal is, and the case keeps the count.
 *
 *   NOTHING OUTSIDE AN ISLAND THAT TAKES REPORTS IS QUEUED. A photograph from
 *   Si Racha is sent back at once, with the reason, rather than left for an
 *   officer to discover.
 *
 * What this file does not catch, and says so: somebody photographing the same
 * spot day after day to make it look worse than it is. Only the officer who
 * goes there can see that.
 */

import { AREAS, inArea, type AreaKey } from './areas.ts';
import { metresBetween } from './presence.ts';
import type { Localised } from './types.ts';

/* --------------------------------------------------------------- answers -- */

/** What the reporter saw. Optional: the photograph already shows it. */
export type DebrisKind = 'foam' | 'net_rope' | 'plastic_bottle' | 'glass' | 'wood_plant' | 'general';

export const DEBRIS_KINDS: readonly DebrisKind[] = ['foam', 'net_rope', 'plastic_bottle', 'glass', 'wood_plant', 'general'];

export const DEBRIS_KIND_LABEL: Record<DebrisKind, Localised> = {
  foam: { en: 'Foam', th: 'โฟม', zh: '泡沫' },
  net_rope: { en: 'Net / rope', th: 'อวน / เชือก', zh: '渔网 / 绳索' },
  plastic_bottle: { en: 'Plastic bottles', th: 'ขวดพลาสติก', zh: '塑料瓶' },
  glass: { en: 'Glass bottles', th: 'ขวดแก้ว', zh: '玻璃瓶' },
  wood_plant: { en: 'Wood / plant matter', th: 'ไม้ / ซากพืช', zh: '木头 / 植物残骸' },
  general: { en: 'General rubbish', th: 'ขยะทั่วไป', zh: '一般垃圾' },
};

/** How much, in the words a person on a beach can actually judge. */
export type DebrisAmount = 'bag' | 'pile' | 'strand';

export const DEBRIS_AMOUNTS: readonly DebrisAmount[] = ['bag', 'pile', 'strand'];

export const DEBRIS_AMOUNT_LABEL: Record<DebrisAmount, Localised> = {
  bag: { en: 'One bag would do', th: 'ถุงเดียวไหว', zh: '一袋就够' },
  pile: { en: 'A heap', th: 'เป็นกอง', zh: '成堆' },
  strand: { en: 'All along the tideline', th: 'ยาวตลอดแนว', zh: '沿整条潮线' },
};

/**
 * How a person gets to it. The question that matters most: it decides whether
 * the municipality sends a truck, people on foot, or waits for the boat team,
 * and only somebody standing there knows.
 */
export type DebrisAccess = 'walk' | 'climb' | 'boat_only';

export const DEBRIS_ACCESSES: readonly DebrisAccess[] = ['walk', 'climb', 'boat_only'];

export const DEBRIS_ACCESS_LABEL: Record<DebrisAccess, Localised> = {
  walk: { en: 'Easy to walk to', th: 'เดินถึงได้สบาย', zh: '步行可轻松到达' },
  climb: { en: 'Down steps or over rocks', th: 'ต้องลงบันได หรือปีนโขดหิน', zh: '需走台阶或攀过礁石' },
  boat_only: { en: 'Only seen from a boat', th: 'เห็นจากเรือเท่านั้น เดินไม่ถึง', zh: '只能从船上看到，步行无法到达' },
};

/* ----------------------------------------------------------------- rules -- */

/** Two reports this close are one pile. The triage board's number. */
export const DEBRIS_MERGE_RADIUS_M = 50;

/**
 * ...and only within this long of each other. Half a tidal cycle: the same
 * spot after the next high water is a different stranding, and a different
 * job.
 */
export const DEBRIS_MERGE_WINDOW_MS = 3 * 60 * 60_000;

/** A photograph older than this shows rubbish that has had two tides since. */
export const DEBRIS_STALE_MS = 24 * 60 * 60_000;

/** A phone clock this far ahead is a slow sync, not a lie. */
export const DEBRIS_CLOCK_SKEW_MS = 5 * 60_000;

/**
 * Islands the server can take reports for, with the prefix their case numbers
 * carry.
 *
 * BEING ON THIS LIST IS NOT THE SAME AS SHOWING THE BUTTON. On 28 November
 * 2026 nobody on Ko Sichang has agreed to read the queue, and a report nobody
 * reads is worse than no button: the person who sent it comes back, sees
 * nothing happened, and never sends another. The app offers the report only
 * once a named reader exists; this list only says the API is ready for them.
 */
export const DEBRIS_CASE_PREFIX: Partial<Record<AreaKey, string>> = { 'koh-sichang': 'KS' };

/** A cap on one person's reports in an hour. Nobody honest photographs eleven piles. */
export const DEBRIS_REPORTS_PER_HOUR = 10;

/* ------------------------------------------------------------- reading -- */

export interface DebrisReportInput {
  lat: number;
  lng: number;
  accuracyM: number | null;
  mocked: boolean;
  /** When the photograph was taken, by the phone's clock. */
  takenAt: string;
  kinds: DebrisKind[];
  amount: DebrisAmount;
  access: DebrisAccess;
}

export type DebrisProblem = 'position' | 'taken_at' | 'kinds' | 'amount' | 'access';

export type DebrisRead =
  | { ok: true; value: DebrisReportInput }
  | { ok: false; problems: DebrisProblem[] };

const oneOf = <T extends string>(allowed: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v);

const parsed = (v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return undefined; }
};

function readPosition(raw: unknown): Pick<DebrisReportInput, 'lat' | 'lng' | 'accuracyM' | 'mocked'> | null {
  const v = parsed(raw);
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const { lat, lng } = o;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const accuracyM = typeof o.accuracyM === 'number' && Number.isFinite(o.accuracyM) && o.accuracyM >= 0 ? o.accuracyM : null;
  return { lat, lng, accuracyM, mocked: o.mocked === true };
}

function readKinds(raw: unknown): DebrisKind[] | null {
  if (raw === undefined || raw === null || raw === '') return [];
  // A JSON list, or one bare word: `foam` is not JSON, and is still an answer.
  const v = typeof raw === 'string' && !raw.trimStart().startsWith('[') ? raw : parsed(raw);
  if (v === undefined) return null;
  const list = Array.isArray(v) ? v : [v];
  if (!list.every((k) => oneOf(DEBRIS_KINDS, k))) return null;
  return DEBRIS_KINDS.filter((k) => list.includes(k));
}

/**
 * What the phone sent, checked at the edge. Every problem comes back at once,
 * so the form can mark every field that needs fixing in one pass.
 */
export function readDebrisReport(
  raw: { position?: unknown; takenAt?: unknown; kinds?: unknown; amount?: unknown; access?: unknown },
  now: Date,
): DebrisRead {
  const problems: DebrisProblem[] = [];
  const position = readPosition(raw.position);
  if (!position) problems.push('position');

  const taken = typeof raw.takenAt === 'string' ? Date.parse(raw.takenAt) : NaN;
  if (!Number.isFinite(taken) || taken > now.getTime() + DEBRIS_CLOCK_SKEW_MS) problems.push('taken_at');

  const kinds = readKinds(raw.kinds);
  if (!kinds) problems.push('kinds');
  if (!oneOf(DEBRIS_AMOUNTS, raw.amount)) problems.push('amount');
  if (!oneOf(DEBRIS_ACCESSES, raw.access)) problems.push('access');

  if (problems.length > 0 || !position || !kinds) return { ok: false, problems };
  return {
    ok: true,
    value: {
      ...position,
      takenAt: new Date(taken).toISOString(),
      kinds,
      amount: raw.amount as DebrisAmount,
      access: raw.access as DebrisAccess,
    },
  };
}

/* -------------------------------------------------------------- triage -- */

/** The island a coordinate reports to, or null when no island there takes reports. */
export function debrisAreaOf(at: { lat: number; lng: number }): AreaKey | null {
  const area = AREAS.find((a) => DEBRIS_CASE_PREFIX[a.key] !== undefined && inArea(a, at));
  return area?.key ?? null;
}

/** A case that has not been closed, as triage needs to see it. */
export interface OpenDebrisCase {
  id: string;
  lat: number;
  lng: number;
  lastReportAt: string;
}

export type DebrisRejectReason = 'mocked' | 'outside_area' | 'stale';

export type DebrisTriage =
  | { verdict: 'rejected'; reason: DebrisRejectReason }
  | { verdict: 'merged'; caseId: string; distanceM: number }
  | { verdict: 'opened'; area: AreaKey };

/** What the reporter is told when a report is sent back. Shown, never hidden. */
export const DEBRIS_REJECT_REASON: Record<DebrisRejectReason, Localised> = {
  mocked: {
    en: 'Your phone says this position is simulated. Reports need the phone’s real location.',
    th: 'เครื่องแจ้งว่าตำแหน่งนี้เป็นตำแหน่งจำลอง รายงานต้องใช้ตำแหน่งจริงของเครื่อง',
    zh: '您的手机显示此位置为模拟位置。报告需要使用手机的真实位置。',
  },
  outside_area: {
    en: 'This position is outside the islands that take reports, so it was not queued.',
    th: 'พิกัดนี้อยู่นอกเขตเกาะที่รับรายงาน จึงไม่ได้เข้าคิว',
    zh: '此位置不在接收报告的岛屿范围内，因此未进入队列。',
  },
  stale: {
    en: 'The photo is more than a day old, and the tide has moved things since. Take a new one from there.',
    th: 'รูปนี้ถ่ายไว้เกิน 24 ชั่วโมงแล้ว น้ำขึ้นลงไปหลายรอบ ถ่ายใหม่จากจุดนั้นได้เลย',
    zh: '照片已超过一天，潮水早已移动了垃圾。请在现场重新拍摄。',
  },
};

/**
 * Where one report goes: back to the sender with a reason, into an open case,
 * or into a case of its own.
 *
 * `openCases` is every case on the report's island that is still open; the
 * window and the radius are applied here, so the rule lives in one place.
 */
export function triageDebrisReport(
  report: DebrisReportInput,
  openCases: readonly OpenDebrisCase[],
  now: Date,
): DebrisTriage {
  if (report.mocked) return { verdict: 'rejected', reason: 'mocked' };
  const area = debrisAreaOf(report);
  if (!area) return { verdict: 'rejected', reason: 'outside_area' };
  const taken = Date.parse(report.takenAt);
  if (now.getTime() - taken > DEBRIS_STALE_MS) return { verdict: 'rejected', reason: 'stale' };

  let nearest: { caseId: string; distanceM: number } | null = null;
  for (const c of openCases) {
    if (Math.abs(taken - Date.parse(c.lastReportAt)) > DEBRIS_MERGE_WINDOW_MS) continue;
    const distanceM = metresBetween(report, c);
    if (distanceM > DEBRIS_MERGE_RADIUS_M) continue;
    if (!nearest || distanceM < nearest.distanceM) nearest = { caseId: c.id, distanceM };
  }
  return nearest ? { verdict: 'merged', ...nearest } : { verdict: 'opened', area };
}

/* ------------------------------------------------------ which goes first -- */

const SEVERITY: Record<DebrisAmount, number> = { bag: 1, pile: 2, strand: 3 };

/**
 * How much easier a pile is to clear by land. Steps and rocks need two people
 * and take longer, so the same pile ranks lower. Boat-only is zero: it has no
 * place on the truck run at all, and goes to the boat team's list instead.
 */
const ACCESS_WEIGHT: Record<DebrisAccess, number> = { walk: 1, climb: 0.7, boat_only: 0 };

/**
 * The order the municipality is offered: severity × how many people saw it ×
 * how reachable it is. A suggestion, never an order - the officer who knows
 * the beach can always move a case up or down, and the page says so.
 */
export const debrisPriority = (c: { amount: DebrisAmount; access: DebrisAccess; reporters: number }): number =>
  SEVERITY[c.amount] * c.reporters * ACCESS_WEIGHT[c.access];

/**
 * Reporters at one pile can disagree. A case is planned for the HARDEST way in
 * anybody reported - sending one person to a job that needs two is the worse
 * mistake - and for the biggest pile anybody saw.
 */
export const hardestDebrisAccess = (answers: readonly DebrisAccess[]): DebrisAccess =>
  DEBRIS_ACCESSES.filter((a) => answers.includes(a)).at(-1) ?? 'walk';

export const largestDebrisAmount = (answers: readonly DebrisAmount[]): DebrisAmount =>
  DEBRIS_AMOUNTS.filter((a) => answers.includes(a)).at(-1) ?? 'bag';

/* --------------------------------------------------------- case numbers -- */

/** The island's clock. Thailand keeps no daylight saving, so a fixed offset is exact. */
const BANGKOK_OFFSET_MS = 7 * 60 * 60_000;

/** `2611` for November 2026 on the island: the middle of a case number. */
export function debrisCaseMonth(at: Date): string {
  const local = new Date(at.getTime() + BANGKOK_OFFSET_MS);
  const yy = String(local.getUTCFullYear() % 100).padStart(2, '0');
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
  return `${yy}${mm}`;
}

/** `KS-2611-0142`: the island, the month, and the case's place in that month. */
export const debrisCaseNumber = (prefix: string, at: Date, seq: number): string =>
  `${prefix}-${debrisCaseMonth(at)}-${String(seq).padStart(4, '0')}`;

/* ---------------------------------------------------- what the sender sees -- */

/**
 * Where a case stands, as the person who reported it sees it.
 *
 * `dismissed` is a decision an officer made and wrote down, never a report
 * left to go quiet: a reporter who sees nothing happen does not report again.
 */
export type DebrisCaseStatus = 'open' | 'assigned' | 'closed' | 'dismissed';

export interface DebrisReportView {
  id: string;
  submittedAt: string;
  takenAt: string;
  kinds: DebrisKind[];
  amount: DebrisAmount;
  access: DebrisAccess;
  verdict: 'opened' | 'merged' | 'rejected';
  /** Present only when the report was sent back. */
  rejectReason: DebrisRejectReason | null;
  /** Null for a report that was sent back: it never joined a case. */
  case: {
    number: string;
    status: DebrisCaseStatus;
    openedAt: string;
    /** Distinct people who reported this pile, the sender included. */
    reporters: number;
    /**
     * What came off the beach, once an officer closed it as collected: when,
     * by whom (the name the officer signed in with - the design shows the
     * reporter who closed their case), how much it weighed, and whether some
     * was left for a new case.
     */
    collection: {
      at: string;
      by: string;
      weightKg: number;
      outcome: 'all' | 'partial';
      /** The case opened for what was left, when only part was carried away. */
      followUpNumber: string | null;
    } | null;
  } | null;
}
