/**
 * The room somebody says they booked: what to do next, and a way to write it
 * down.
 *
 * It never says a room is theirs. The university's system decides that; this
 * repeats what the person told it, on their own phone.
 */

import React from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Clock, KeyRound } from 'lucide-react-native';
import {
  ROOM_LEAVE_WARNING_MIN, ROOM_SLOT_MIN, bangkokDay, clockOf, hoursNoted, roomPhase, secondsToCollect,
  type RoomBooking, type RoomPhase, type RoomReminder,
} from '@chivago/core';
import { color, onFill, radius, shadow } from '../theme/index.ts';
import { t } from '../i18n/locale.ts';
import { formatDate, formatTime } from '../i18n/format.ts';
import { forgetRoom, markCollected, noteRoom, readRooms } from '../state/room-reminders.ts';
import { Button } from './Button.tsx';
import { Body, Heading, Label } from './Type.tsx';

const ZONE = { timeZone: 'Asia/Bangkok' } as const;
const clock = (iso: string) => formatTime(iso, { hour: '2-digit', minute: '2-digit', hour12: false, ...ZONE });
const day = (iso: string) => formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short', ...ZONE });

const PHASE: Record<RoomPhase, () => string> = {
  upcoming: () => t({ en: 'Coming up', th: 'ยังไม่ถึงเวลา', zh: '尚未开始' }),
  collect: () => t({ en: 'Collect the key now', th: 'ไปรับกุญแจเดี๋ยวนี้', zh: '请立即领取钥匙' }),
  missed: () => t({
    en: 'The collection time has passed. The library may have given the room up; ask at the counter.',
    th: 'เลยเวลารับกุญแจแล้ว หอสมุดอาจคืนห้องให้คนอื่น ถามที่เคาน์เตอร์',
    zh: '领取时间已过，图书馆可能已释放该房间，请到柜台询问。',
  }),
  using: () => t({ en: 'In use', th: 'กำลังใช้', zh: '使用中' }),
  returning: () => t({ en: 'Return the key', th: 'คืนกุญแจ', zh: '请归还钥匙' }),
  over: () => t({ en: 'Finished', th: 'จบแล้ว', zh: '已结束' }),
};

/** Every second while a countdown is on screen, and twice a minute otherwise. */
function useClock(room: RoomReminder): Date {
  const [now, setNow] = React.useState(() => new Date());
  const counting = secondsToCollect(room, now) !== null;
  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), counting ? 1_000 : 30_000);
    return () => clearInterval(timer);
  }, [counting]);
  return now;
}

function RoomCard({ room, onCollected, onForget }: { room: RoomReminder; onCollected: () => void; onForget: () => void }) {
  const now = useClock(room);
  const phase = roomPhase(room, now);
  const left = secondsToCollect(room, now);
  // A key is handed over a little early, not the day before.
  const soon = phase === 'upcoming' && Date.parse(room.startsAt) - now.getTime() <= ROOM_LEAVE_WARNING_MIN * 60_000;
  const urgent = phase === 'collect' || phase === 'returning';
  return (
    <View style={[shadow.card, {
      marginTop: 12, padding: 16, gap: 6, borderRadius: 24,
      backgroundColor: urgent ? color.text : color.surface, borderWidth: 1, borderColor: urgent ? color.text : color.neutral300,
    }]}>
      <Label size={10} tracking={0.1} colour={urgent ? onFill.text : color.brand}>{t(room.buildingName)}</Label>
      <Heading size={18} colour={urgent ? onFill.text : color.text}>{room.room}</Heading>
      <Body size={14} colour={urgent ? onFill.text : color.neutral700}>{`${day(room.startsAt)} ${clock(room.startsAt)}–${clock(room.endsAt)}`}</Body>
      {left !== null ? (
        <Heading size={34} colour={onFill.text}>{clockOf(left)}</Heading>
      ) : null}
      <Body size={14} colour={urgent ? onFill.text : color.neutral800}>{PHASE[phase]()}</Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
        {room.collectWithinMin !== null && !room.collected && (phase === 'collect' || soon) ? (
          <Button
            label={t({ en: 'I have the key', th: 'รับกุญแจแล้ว', zh: '已领取钥匙' })}
            onPress={onCollected}
            icon={<KeyRound size={16} color={onFill.brand} strokeWidth={2} />}
            height={44}
          />
        ) : null}
        <Button
          label={t({ en: 'Remove this note', th: 'ลบบันทึกนี้', zh: '删除此记录' })}
          onPress={onForget}
          variant="secondary"
          icon={null}
          height={44}
        />
      </View>
    </View>
  );
}

const Choice = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="radio"
    accessibilityLabel={label}
    accessibilityState={{ selected: on }}
    style={{
      minHeight: 44, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center',
      backgroundColor: on ? color.brand : color.surface, borderWidth: 1, borderColor: on ? color.brand : color.neutral300,
    }}
  >
    <Body size={14} colour={on ? onFill.brand : color.text}>{label}</Body>
  </Pressable>
);

const Row = ({ children }: { children: React.ReactNode }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>{children}</ScrollView>
);

const FIRST_SLOT = 8 * 60;
const LAST_SLOT = 20 * 60;
const LENGTHS = [1, 2, 3, 4, 5, 6].map((slots) => slots * ROOM_SLOT_MIN);

/** Half hours of a Thai day that have not gone by, as ISO starts. */
function starts(dayOffset: 0 | 1, now: Date): string[] {
  const date = bangkokDay(new Date(now.getTime() + dayOffset * 86_400_000).toISOString());
  const out: string[] = [];
  for (let m = FIRST_SLOT; m <= LAST_SLOT; m += ROOM_SLOT_MIN) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    const iso = new Date(`${date}T${hh}:${mm}:00+07:00`).toISOString();
    // One already begun is still worth noting for as long as it lasts a slot.
    if (Date.parse(iso) + ROOM_SLOT_MIN * 60_000 > now.getTime()) out.push(iso);
  }
  return out;
}

const lengthLabel = (minutes: number) => (minutes % 60 === 0
  ? t({ en: `${minutes / 60} h`, th: `${minutes / 60} ชม.`, zh: `${minutes / 60} 小时` })
  : t({ en: `${minutes} min`, th: `${minutes} นาที`, zh: `${minutes} 分钟` }));

function NoteForm({ booking, rooms, onNoted, onCancel, onToast }: {
  booking: RoomBooking; rooms: RoomReminder[];
  onNoted: (rooms: RoomReminder[]) => void; onCancel: () => void; onToast: (m: string) => void;
}) {
  const [buildingId, setBuildingId] = React.useState(booking.rules.buildingId);
  const [room, setRoom] = React.useState('');
  const [dayOffset, setDayOffset] = React.useState<0 | 1>(0);
  const [start, setStart] = React.useState<string | null>(null);
  const [minutes, setMinutes] = React.useState(60);
  const building = booking.buildings.find((b) => b.id === buildingId)!;
  const hasRules = buildingId === booking.rules.buildingId;
  const already = start ? hoursNoted(rooms, buildingId, bangkokDay(start)) : 0;
  const tooLong = hasRules && start !== null && already + minutes / 60 > booking.rules.hoursPerDay;

  const save = async () => {
    if (!start || room.trim() === '') return;
    const noted = await noteRoom({
      id: `${start}-${buildingId}-${room.trim()}`, buildingId, buildingName: building.name, room: room.trim().slice(0, 40),
      startsAt: start, endsAt: new Date(Date.parse(start) + minutes * 60_000).toISOString(),
      collectWithinMin: hasRules ? booking.rules.collectWithinMin : null, collected: false,
    });
    if (!noted.kept) {
      onToast(t({ en: 'This phone would not keep the note.', th: 'เครื่องนี้เก็บบันทึกไม่ได้', zh: '此设备无法保存记录。' }));
      return;
    }
    onToast(noted.alerts
      ? t({ en: 'Noted. This phone will remind you.', th: 'บันทึกแล้ว เครื่องนี้จะเตือนคุณ', zh: '已记录，此设备会提醒您。' })
      : t({ en: 'Noted. This phone will not remind you, so watch the time.', th: 'บันทึกแล้ว เครื่องนี้เตือนเองไม่ได้ ดูเวลาด้วย', zh: '已记录。此设备无法提醒，请留意时间。' }));
    onNoted(noted.rooms);
  };

  return (
    <View style={{ marginTop: 12, padding: 16, borderRadius: 24, backgroundColor: color.surface, borderWidth: 1, borderColor: color.neutral300 }}>
      <Heading size={17}>{t({ en: 'What you booked', th: 'ห้องที่จองไว้', zh: '您预订的房间' })}</Heading>
      <Body size={13} colour={color.neutral700} style={{ marginTop: 4 }}>
        {t({
          en: 'A note to yourself, kept on this phone only. It does not book anything.',
          th: 'เป็นบันทึกเตือนตัวเอง เก็บในเครื่องนี้เท่านั้น ไม่ใช่การจอง',
          zh: '仅保存在此设备上的个人备忘，并非预订。',
        })}
      </Body>
      <Row>{booking.buildings.map((b) => <Choice key={b.id} label={t(b.name)} on={b.id === buildingId} onPress={() => setBuildingId(b.id)} />)}</Row>
      <TextInput
        value={room}
        onChangeText={setRoom}
        maxLength={40}
        placeholder="Discussion 4-2"
        placeholderTextColor={color.neutral500}
        accessibilityLabel={t({ en: 'Room', th: 'ห้อง', zh: '房间' })}
        style={{ minHeight: 48, borderWidth: 1, borderColor: color.neutral400, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 16, color: color.text }}
      />
      <Row>
        <Choice label={t({ en: 'Today', th: 'วันนี้', zh: '今天' })} on={dayOffset === 0} onPress={() => { setDayOffset(0); setStart(null); }} />
        <Choice label={t({ en: 'Tomorrow', th: 'พรุ่งนี้', zh: '明天' })} on={dayOffset === 1} onPress={() => { setDayOffset(1); setStart(null); }} />
      </Row>
      <Label size={10} tracking={0.1}>{t({ en: 'Starts', th: 'เริ่ม', zh: '开始' })}</Label>
      <Row>{starts(dayOffset, new Date()).map((iso) => <Choice key={iso} label={clock(iso)} on={iso === start} onPress={() => setStart(iso)} />)}</Row>
      <Label size={10} tracking={0.1}>{t({ en: 'For', th: 'นาน', zh: '时长' })}</Label>
      <Row>{LENGTHS.map((m) => <Choice key={m} label={lengthLabel(m)} on={m === minutes} onPress={() => setMinutes(m)} />)}</Row>
      {tooLong ? (
        <Body size={13} colour={color.accent2}>
          {t({
            en: `The library allows ${booking.rules.hoursPerDay} hours a day each. Check your booking.`,
            th: `หอสมุดให้คนละ ${booking.rules.hoursPerDay} ชั่วโมงต่อวัน ตรวจการจองของคุณอีกครั้ง`,
            zh: `图书馆每人每天限 ${booking.rules.hoursPerDay} 小时，请核对您的预订。`,
          })}
        </Body>
      ) : null}
      <View style={{ gap: 8, marginTop: 10 }}>
        <Button
          label={t({ en: 'Note it', th: 'บันทึก', zh: '记录' })}
          onPress={() => { void save(); }}
          disabled={!start || room.trim() === ''}
          icon={<Clock size={16} color={onFill.brand} strokeWidth={2} />}
          height={48}
        />
        <Button label={t({ en: 'Cancel', th: 'ยกเลิก', zh: '取消' })} onPress={onCancel} variant="secondary" icon={null} height={44} />
      </View>
    </View>
  );
}

export function RoomNotes({ booking, onToast }: { booking: RoomBooking; onToast: (m: string) => void }) {
  const [rooms, setRooms] = React.useState<RoomReminder[]>([]);
  const [writing, setWriting] = React.useState(false);
  React.useEffect(() => { void readRooms().then(setRooms); }, []);

  return (
    <View>
      {rooms.map((r) => (
        <RoomCard
          key={r.id}
          room={r}
          onCollected={() => { void markCollected(r.id).then(setRooms); }}
          onForget={() => { void forgetRoom(r.id).then(setRooms); }}
        />
      ))}
      {writing ? (
        <NoteForm
          booking={booking}
          rooms={rooms}
          onNoted={(next) => { setRooms(next); setWriting(false); }}
          onCancel={() => setWriting(false)}
          onToast={onToast}
        />
      ) : (
        <Button
          label={t({ en: 'I booked a room, remind me', th: 'จองห้องแล้ว เตือนฉันด้วย', zh: '我已预订房间，提醒我' })}
          onPress={() => setWriting(true)}
          variant="secondary"
          icon={<Clock size={16} color={color.brand} strokeWidth={2} />}
          height={48}
          style={{ marginTop: 12 }}
        />
      )}
    </View>
  );
}
