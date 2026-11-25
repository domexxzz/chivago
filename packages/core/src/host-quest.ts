/**
 * An activity a campus host writes for itself.
 *
 * Until 26 November 2026 a quest reached the database only from this
 * repository's seed, so a university's own staff could approve work but could
 * not say what the work was. That is the first thing a campus pilot needs and
 * the one it could not do without a developer.
 *
 * WHAT THIS REFUSES.
 *
 *   NOTHING IS PUBLISHED BY THE PERSON WHO WROTE IT. A draft is submitted and a
 *   reviewer from ANOTHER host publishes it or sends it back with a reason. The
 *   people who can put points into circulation and the people who can say what
 *   they are for are not the same people.
 *
 *   A REWARD HAS A CEILING, AND SO DOES THE NUMBER OF PEOPLE. Seats are
 *   required, so the most an activity can ever pay out is known when somebody
 *   approves it (`mostItCanPay`) rather than discovered afterwards.
 *
 *   PUBLISHED WORDS DO NOT MOVE. Somebody joined on the strength of them. A
 *   published activity can be closed; its name, place and reward cannot change
 *   under the people already in it.
 *
 *   ONLY A UNIVERSITY. The island pilot publishes five verified quests and
 *   nothing else, on purpose (`ACTIVE_QUEST_CODES`).
 */

import { areaByKey, isAreaKey, type AreaKey } from './areas.ts';
import type { Bilingual, Quest } from './types.ts';

export const HOST_QUEST_STATUSES = ['draft', 'submitted', 'returned', 'published', 'closed'] as const;
export type HostQuestStatus = (typeof HOST_QUEST_STATUSES)[number];

export const HOST_QUEST_STATUS_LABEL: Record<HostQuestStatus, Bilingual> = {
  draft: { en: 'Draft', th: 'ฉบับร่าง', zh: '草稿' },
  submitted: { en: 'Waiting for approval', th: 'รออนุมัติ', zh: '待批准' },
  returned: { en: 'Sent back', th: 'ส่งกลับให้แก้', zh: '已退回' },
  published: { en: 'Published', th: 'เผยแพร่แล้ว', zh: '已发布' },
  closed: { en: 'Closed', th: 'ปิดแล้ว', zh: '已关闭' },
};

/** The most one person can earn from one activity. The seed's ordinary quests pay 60 to 150. */
export const HOST_QUEST_MAX_REWARD = 150;
export const HOST_QUEST_MAX_SEATS = 500;
export const HOST_QUEST_RADIUS_M = { min: 50, max: 300, usual: 120 } as const;
export const HOST_QUEST_MINUTES = { min: 10, max: 480 } as const;
/** An activity is an occasion, not a season. */
export const HOST_QUEST_MAX_SPAN_DAYS = 14;
/** Arriving early is ordinary; arriving the day before is not arriving. */
export const HOST_QUEST_EARLY_MIN = 30;

const DAY_MS = 86_400_000;

export interface HostQuestInput {
  area: string;
  nameEn: string;
  nameTh: string;
  whereEn: string;
  whereTh: string;
  minutes: number;
  rewardPoints: number;
  rewardCurrency: string;
  lat: number;
  lng: number;
  radiusM: number;
  seats: number;
  /** ISO 8601, with an offset or Z. */
  startsAt: string;
  endsAt: string;
}

export const isHostQuestArea = (v: unknown): v is AreaKey =>
  isAreaKey(v) && areaByKey(v).university === true;

const whole = (n: number, min: number, max: number): boolean =>
  Number.isInteger(n) && n >= min && n <= max;

function wordProblems(q: HostQuestInput): Bilingual[] {
  const fields: readonly (readonly [string, string, string])[] = [
    [q.nameEn, 'English name', 'ชื่อภาษาอังกฤษ'],
    [q.nameTh, 'Thai name', 'ชื่อภาษาไทย'],
    [q.whereEn, 'English meeting point', 'จุดนัดพบภาษาอังกฤษ'],
    [q.whereTh, 'Thai meeting point', 'จุดนัดพบภาษาไทย'],
  ];
  return fields
    .filter(([value]) => value.trim().length < 3 || value.trim().length > 80)
    .map(([, en, th]) => ({ en: `${en}: 3 to 80 characters.`, th: `${th}: 3 ถึง 80 ตัวอักษร` }));
}

function numberProblems(q: HostQuestInput): Bilingual[] {
  const out: Bilingual[] = [];
  if (!whole(q.minutes, HOST_QUEST_MINUTES.min, HOST_QUEST_MINUTES.max)) {
    out.push({ en: 'How long it takes: 10 to 480 minutes.', th: 'ระยะเวลา: 10 ถึง 480 นาที' });
  }
  if (!whole(q.rewardPoints, 0, HOST_QUEST_MAX_REWARD)) {
    out.push({ en: `Points: 0 to ${HOST_QUEST_MAX_REWARD}.`, th: `แต้ม: 0 ถึง ${HOST_QUEST_MAX_REWARD}` });
  }
  if (q.rewardCurrency !== 'green' && q.rewardCurrency !== 'trip') {
    out.push({ en: 'Choose Green or Trip points.', th: 'เลือกแต้มเขียวหรือแต้มทริป' });
  }
  if (!whole(q.seats, 1, HOST_QUEST_MAX_SEATS)) {
    out.push({ en: `Seats: 1 to ${HOST_QUEST_MAX_SEATS}.`, th: `จำนวนรับ: 1 ถึง ${HOST_QUEST_MAX_SEATS}` });
  }
  if (!whole(q.radiusM, HOST_QUEST_RADIUS_M.min, HOST_QUEST_RADIUS_M.max)) {
    out.push({ en: 'Check-in radius: 50 to 300 metres.', th: 'รัศมีเช็กอิน: 50 ถึง 300 เมตร' });
  }
  return out;
}

function placeProblems(q: HostQuestInput): Bilingual[] {
  if (!isHostQuestArea(q.area)) return [{ en: 'Choose a university.', th: 'เลือกมหาวิทยาลัย' }];
  const b = areaByKey(q.area).bbox;
  const inside = q.lat >= b.minLat && q.lat <= b.maxLat && q.lng >= b.minLng && q.lng <= b.maxLng;
  return inside ? [] : [{ en: 'The meeting point is outside this campus.', th: 'จุดนัดพบอยู่นอกวิทยาเขตนี้' }];
}

function timeProblems(q: HostQuestInput, now: Date): Bilingual[] {
  const starts = Date.parse(q.startsAt);
  const ends = Date.parse(q.endsAt);
  if (!Number.isFinite(starts) || !Number.isFinite(ends)) {
    return [{ en: 'Give a start and an end.', th: 'ระบุเวลาเริ่มและเวลาสิ้นสุด' }];
  }
  if (ends <= starts) return [{ en: 'It must end after it starts.', th: 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม' }];
  const out: Bilingual[] = [];
  if (ends <= now.getTime()) out.push({ en: 'It has already ended.', th: 'เวลาสิ้นสุดผ่านไปแล้ว' });
  if (ends - starts > HOST_QUEST_MAX_SPAN_DAYS * DAY_MS) {
    out.push({ en: `At most ${HOST_QUEST_MAX_SPAN_DAYS} days.`, th: `นานไม่เกิน ${HOST_QUEST_MAX_SPAN_DAYS} วัน` });
  }
  return out;
}

/**
 * Everything wrong with a draft, in words its writer can act on. Empty means it
 * may be submitted.
 */
export const hostQuestProblems = (q: HostQuestInput, now: Date): Bilingual[] => [
  ...placeProblems(q), ...wordProblems(q), ...numberProblems(q), ...timeProblems(q, now),
];

/** What approving this could put into circulation, at most. */
export const mostItCanPay = (q: { rewardPoints: number; seats: number }): number =>
  q.rewardPoints * q.seats;

/** Dates and seats, as somebody deciding whether to go needs them. */
export type QuestEvent = NonNullable<Quest['event']>;

export type QuestEventState = 'open' | 'full' | 'ended' | 'closed';

export function questEventState(e: QuestEvent, now: Date): QuestEventState {
  if (e.closed) return 'closed';
  if (now.getTime() >= Date.parse(e.endsAt)) return 'ended';
  return e.taken >= e.seats ? 'full' : 'open';
}

/** Whether somebody may check in now: from half an hour before it starts until it ends. */
export function questEventArrivable(e: Pick<QuestEvent, 'startsAt' | 'endsAt'>, now: Date): boolean {
  const t = now.getTime();
  return t >= Date.parse(e.startsAt) - HOST_QUEST_EARLY_MIN * 60_000 && t < Date.parse(e.endsAt);
}
