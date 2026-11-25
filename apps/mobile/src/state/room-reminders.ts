/**
 * Rooms somebody noted, kept on this phone and nowhere else.
 *
 * The same durable store as the outbox: IndexedDB on the web, SQLite in the
 * installed app. Nothing here talks to a server, because nobody but the person
 * needs to know which room they are in this afternoon.
 */

import { isRoomReminder, type RoomReminder } from '@chivago/core';
import { offlineStorage } from '../offline/storage.ts';
import { cancelRoomAlerts, scheduleRoomAlerts } from '../notifications/room-alerts.ts';

const KEY = 'chivago.roomReminders';
/** A day after it ended it is of no use to anybody. */
const KEEP_AFTER_MS = 24 * 3_600_000;

export async function readRooms(now = new Date()): Promise<RoomReminder[]> {
  try {
    const raw = await (await offlineStorage()).get(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return (Array.isArray(parsed) ? parsed : [])
      .filter(isRoomReminder)
      .filter((r) => Date.parse(r.endsAt) + KEEP_AFTER_MS > now.getTime())
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  } catch {
    return [];
  }
}

/** False when the phone would not keep it, so that the screen can say so. */
async function writeRooms(rooms: readonly RoomReminder[]): Promise<boolean> {
  try {
    await (await offlineStorage()).set(KEY, JSON.stringify(rooms));
    return true;
  } catch {
    return false;
  }
}

export interface Noted {
  rooms: RoomReminder[];
  kept: boolean;
  /** Whether this phone will speak up by itself. False on the web. */
  alerts: boolean;
}

export async function noteRoom(room: RoomReminder, now = new Date()): Promise<Noted> {
  const rooms = [...(await readRooms(now)).filter((r) => r.id !== room.id), room]
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const kept = await writeRooms(rooms);
  return { rooms, kept, alerts: kept && await scheduleRoomAlerts(room, now) };
}

export async function markCollected(id: string, now = new Date()): Promise<RoomReminder[]> {
  const rooms = (await readRooms(now)).map((r) => (r.id === id ? { ...r, collected: true } : r));
  await writeRooms(rooms);
  return rooms;
}

export async function forgetRoom(id: string, now = new Date()): Promise<RoomReminder[]> {
  const rooms = (await readRooms(now)).filter((r) => r.id !== id);
  await writeRooms(rooms);
  await cancelRoomAlerts(id);
  return rooms;
}
