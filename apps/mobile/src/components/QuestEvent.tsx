/**
 * When a campus activity is, and whether there is room.
 *
 * Drawn only for a quest with dates (host-quest.ts in core). The server decides
 * who gets a seat; this says what it last said, so that nobody walks across a
 * campus to something full.
 */

import React from 'react';
import { View } from 'react-native';
import { Clock, Users } from 'lucide-react-native';
import { questEventState, type Quest, type QuestEventState, type QuestStage } from '@chivago/core';
import { color, gutter, radius, shadow } from '../theme/index.ts';
import { t } from '../i18n/locale.ts';
import { formatDate, formatTime } from '../i18n/format.ts';
import { Button } from './Button.tsx';
import { Body, Heading } from './Type.tsx';

type Event = NonNullable<Quest['event']>;

/** The activity is in Thailand, whatever the phone's clock is set to. */
const ZONE = { timeZone: 'Asia/Bangkok' } as const;

export function eventWhen(e: Event): string {
  const day = (iso: string) => formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short', ...ZONE });
  const time = (iso: string) => formatTime(iso, { hour: '2-digit', minute: '2-digit', hour12: false, ...ZONE });
  const sameDay = day(e.startsAt) === day(e.endsAt);
  return sameDay
    ? `${day(e.startsAt)} ${time(e.startsAt)}–${time(e.endsAt)}`
    : `${day(e.startsAt)} ${time(e.startsAt)} – ${day(e.endsAt)} ${time(e.endsAt)}`;
}

export function eventSeats(e: Event, state: QuestEventState): string {
  if (state === 'closed') return t({ en: 'Closed by the organiser', th: 'ผู้จัดปิดรับแล้ว', zh: '主办方已关闭' });
  if (state === 'ended') return t({ en: 'This activity is over', th: 'กิจกรรมจบแล้ว', zh: '活动已结束' });
  if (state === 'full') return t({ en: 'Every place is taken', th: 'เต็มแล้ว', zh: '名额已满' });
  const left = e.seats - e.taken;
  return t({ en: `${left} of ${e.seats} places left`, th: `เหลือ ${left} จาก ${e.seats} ที่`, zh: `剩余 ${left} / ${e.seats} 个名额` });
}

const Line = ({ icon, children }: { icon: React.ReactNode; children: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    {icon}
    <Body size={14} colour={color.neutral800} style={{ flex: 1 }}>{children}</Body>
  </View>
);

export function QuestEventPanel({ event, stage, busy, onLeave, now = new Date() }: {
  event: Event;
  stage: QuestStage | null;
  busy: boolean;
  onLeave: () => void;
  now?: Date;
}) {
  const state = questEventState(event, now);
  return (
    <View style={[shadow.card, {
      marginHorizontal: gutter, marginTop: 14, padding: 16, gap: 10,
      borderRadius: 24, backgroundColor: color.surface, borderWidth: 1, borderColor: '#DCEFF5',
    }]}>
      <Heading size={17}>{t({ en: 'When and how many', th: 'เวลาและจำนวนรับ', zh: '时间与名额' })}</Heading>
      <Line icon={<Clock size={18} color={color.brand} />}>{eventWhen(event)}</Line>
      <Line icon={<Users size={18} color={color.brand} />}>{eventSeats(event, state)}</Line>
      {stage === 'joined' ? (
        <>
          <Body size={13} colour={color.neutral700}>
            {t({
              en: 'You have a place. Check-in opens half an hour before it starts.',
              th: 'คุณมีที่แล้ว เช็กอินได้ตั้งแต่ครึ่งชั่วโมงก่อนเริ่ม',
              zh: '您已有名额。活动开始前半小时可签到。',
            })}
          </Body>
          <Button
            label={t({ en: 'Give up my place', th: 'สละที่ให้คนอื่น', zh: '放弃名额' })}
            onPress={onLeave}
            disabled={busy}
            variant="secondary"
            icon={null}
            height={44}
          />
        </>
      ) : null}
    </View>
  );
}

/** The two lines a list has room for. */
export function QuestEventLine({ event, now = new Date() }: { event: Event; now?: Date }) {
  const state = questEventState(event, now);
  return (
    <View style={{ marginTop: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.sm, backgroundColor: color.brandSoft }}>
      <Body size={13} colour={color.brandDeep}>{eventWhen(event)}</Body>
      <Body size={13} colour={state === 'open' ? color.brandDeep : color.neutral700}>{eventSeats(event, state)}</Body>
    </View>
  );
}
