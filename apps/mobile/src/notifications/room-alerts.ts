/**
 * The phone speaking up by itself about a room that was noted on it.
 *
 * Local only: scheduled on the device, never sent through a server. The web has
 * no way to do this while the page is closed, so it answers false and the
 * screen says to keep an eye on the clock instead of promising a reminder.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { reminderTimes, type RoomReminder } from '@chivago/core';
import { t } from '../i18n/locale.ts';

const alertId = (roomId: string, about: 'leave' | 'return'): string => `room-${roomId}-${about}`;

const words = (room: RoomReminder, about: 'leave' | 'return') => (about === 'leave'
  ? {
    title: t({ en: `${room.room} in 15 minutes`, th: `${room.room} อีก 15 นาที`, zh: `${room.room} 15 分钟后开始` }),
    body: room.collectWithinMin === null
      ? t(room.buildingName)
      : t({
        en: `Bring your card. Collect the key within ${room.collectWithinMin} minutes of the start.`,
        th: `เตรียมบัตรไปแลกกุญแจ ภายใน ${room.collectWithinMin} นาทีหลังเวลาเริ่ม`,
        zh: `请携带证件，并在开始后 ${room.collectWithinMin} 分钟内领取钥匙。`,
      }),
  }
  : {
    title: t({ en: `${room.room} ends in 10 minutes`, th: `${room.room} อีก 10 นาทีหมดเวลา`, zh: `${room.room} 10 分钟后结束` }),
    body: t({ en: 'Return the key on time.', th: 'คืนกุญแจให้ทันเวลา', zh: '请按时归还钥匙。' }),
  });

export async function scheduleRoomAlerts(room: RoomReminder, now = new Date()): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const asked = await Notifications.getPermissionsAsync();
    const granted = asked.status === 'granted'
      || (await Notifications.requestPermissionsAsync()).status === 'granted';
    if (!granted) return false;
    await cancelRoomAlerts(room.id);
    for (const { at, about } of reminderTimes(room, now)) {
      await Notifications.scheduleNotificationAsync({
        identifier: alertId(room.id, about),
        content: words(room, about),
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
      });
    }
    return true;
  } catch {
    // A phone that will not schedule is not an error the person can act on;
    // the note itself is kept and the screen says there will be no alert.
    return false;
  }
}

export async function cancelRoomAlerts(roomId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  for (const about of ['leave', 'return'] as const) {
    try {
      await Notifications.cancelScheduledNotificationAsync(alertId(roomId, about));
    } catch { /* it was never scheduled */ }
  }
}
