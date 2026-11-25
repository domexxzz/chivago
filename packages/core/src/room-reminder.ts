/**
 * A room somebody says they have booked, and what they must do about it next.
 *
 * The booking itself is the university's (`campus-services.ts`). This is the
 * note a person writes to themselves afterwards: it is kept on their phone,
 * nothing is sent anywhere, and the app never claims a room is theirs - only
 * that they said so.
 */

import type { Localised } from './types.ts';

export interface RoomReminder {
  id: string;
  buildingId: string;
  buildingName: Localised;
  room: string;
  /** ISO 8601. */
  startsAt: string;
  endsAt: string;
  /** Minutes after the start in which the key must be collected, where a rule says so. */
  collectWithinMin: number | null;
  collected: boolean;
}

/** Rooms are booked by the half hour. */
export const ROOM_SLOT_MIN = 30;
/** How long before the end to say the key is due back. */
export const ROOM_RETURN_WARNING_MIN = 10;
/** How long before the start to say it is time to set off. */
export const ROOM_LEAVE_WARNING_MIN = 15;

export type RoomPhase = 'upcoming' | 'collect' | 'missed' | 'using' | 'returning' | 'over';

const MIN = 60_000;

export function roomPhase(r: RoomReminder, now: Date): RoomPhase {
  const t = now.getTime();
  const start = Date.parse(r.startsAt);
  const end = Date.parse(r.endsAt);
  if (t >= end) return 'over';
  if (!r.collected && r.collectWithinMin !== null && t >= start + r.collectWithinMin * MIN) return 'missed';
  if (t < start) return 'upcoming';
  if (!r.collected && r.collectWithinMin !== null) return 'collect';
  return t >= end - ROOM_RETURN_WARNING_MIN * MIN ? 'returning' : 'using';
}

/** Whole seconds left to collect the key, or null when that is not the question. */
export function secondsToCollect(r: RoomReminder, now: Date): number | null {
  if (roomPhase(r, now) !== 'collect') return null;
  const deadline = Date.parse(r.startsAt) + (r.collectWithinMin ?? 0) * MIN;
  return Math.max(0, Math.ceil((deadline - now.getTime()) / 1000));
}

export const clockOf = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** Thailand keeps one offset all year. */
export const bangkokDay = (iso: string): string =>
  new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10);

/** Hours already noted in one building on the same Thai day. */
export function hoursNoted(all: readonly RoomReminder[], buildingId: string, day: string): number {
  return all
    .filter((r) => r.buildingId === buildingId && bangkokDay(r.startsAt) === day)
    .reduce((sum, r) => sum + (Date.parse(r.endsAt) - Date.parse(r.startsAt)) / 3_600_000, 0);
}

/** When to speak up: before setting off, and before the key is due. Never in the past. */
export function reminderTimes(r: RoomReminder, now: Date): { at: Date; about: 'leave' | 'return' }[] {
  return ([
    { at: new Date(Date.parse(r.startsAt) - ROOM_LEAVE_WARNING_MIN * MIN), about: 'leave' },
    { at: new Date(Date.parse(r.endsAt) - ROOM_RETURN_WARNING_MIN * MIN), about: 'return' },
  ] as const).filter((x) => x.at.getTime() > now.getTime()).map((x) => ({ ...x }));
}

/** A room, a half-hour start and an end after it. */
export function isRoomReminder(v: unknown): v is RoomReminder {
  if (!v || typeof v !== 'object') return false;
  const r = v as Partial<RoomReminder>;
  return typeof r.id === 'string' && typeof r.buildingId === 'string' && typeof r.room === 'string'
    && typeof r.startsAt === 'string' && typeof r.endsAt === 'string'
    && Date.parse(r.endsAt) > Date.parse(r.startsAt)
    && (r.collectWithinMin === null || typeof r.collectWithinMin === 'number')
    && typeof r.collected === 'boolean'
    && typeof r.buildingName === 'object' && r.buildingName !== null;
}
