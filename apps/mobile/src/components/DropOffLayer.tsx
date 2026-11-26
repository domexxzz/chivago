/**
 * Drop-off points — where to hand in waste you have already sorted.
 *
 * WHAT THIS ANSWERS. Somebody has carried a bottle and a snack wrapper for
 * forty minutes and does not know where to put them. They are not short of
 * conviction - anybody short of conviction put it down in the second minute.
 * They are short of one fact, and this is the screen that holds it: which
 * point is nearest, how far it is in metres a person can decide about, and
 * what that point will actually take.
 *
 * WHY THE DISTANCE IS IN METRES. "0.2 km" is a number somebody has to
 * convert before they can answer "is that worth the walk". Metres under a
 * kilometre, rounded to ten because a fix under tree cover does not know the
 * last digit - printing it would claim an accuracy the phone does not have.
 *
 * WHY AN EMPTY LIST SAYS SO IN WORDS. No shop on Koh Sichang has agreed to
 * be a drop-off point yet. The honest screen for that is one that says it,
 * the way `board.ts` says an empty board is empty - not a placeholder pin,
 * and not a hidden section that leaves somebody to guess whether the feature
 * failed or the island has none. A pin for a bin that is not there sends a
 * tired person on a walk to nothing, and they do not open the app again.
 *
 * WHY IT DOES NOT OFFER POINTS FOR ARRIVING. Walking to a bin carrying
 * nothing is not the behaviour this exists to encourage. The reward lives on
 * the quest, which a named host releases after looking at what was handed
 * over - rung three on the evidence ladder. This component shows the way
 * there and nothing else.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { MapPin, Navigation, Recycle } from 'lucide-react-native';

import {
  ACCEPTS_LABEL,
  DROP_OFF_POINTS,
  dropOffDistanceLabel,
  dropOffsNearest,
  metresToDropOff,
  type DropOffPoint,
} from '@chivago/core';

import { color, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from './Type.tsx';
import { t } from '../i18n/locale.ts';
import { areaWords } from '../i18n/area-words.ts';
import { useArea } from '../state/area.ts';

interface Props {
  /** The traveller's own position, or null when location is off. */
  here: { lat: number; lng: number } | null;
  points?: readonly DropOffPoint[];
  /** Opens turn-by-turn. Absent on surfaces that cannot route. */
  onRoute?: (point: DropOffPoint) => void;
}

export function DropOffLayer({ here, points = DROP_OFF_POINTS, onRoute }: Props) {
  const area = useArea();
  const ordered = React.useMemo(() => dropOffsNearest(here, points), [here, points]);

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Recycle size={18} color={color.accent} />
        <Heading size={16}>
          {t({ en: 'Drop-off points', th: 'จุดรับขยะแยกแล้ว', zh: '分类垃圾投放点' })}
        </Heading>
      </View>

      {ordered.length === 0 ? (
        /*
          The empty state is the honest one and it names the reason, because
          "no points" alone reads as a broken feature. It also says what has
          to happen, since the answer is not a software fix - it is a shop
          agreeing to stand behind one.
        */
        <View style={{ backgroundColor: color.neutral100, borderRadius: 14, padding: 14, gap: 6 }}>
          <Body>
            {t({
              en: 'No drop-off point in this area yet.',
              th: 'พื้นที่นี้ยังไม่มีจุดรับขยะแยกแล้ว',
              zh: '本区域尚无分类垃圾投放点。',
            })}
          </Body>
          <Label colour={color.neutral700}>
            {t(areaWords(area).dropOffHost)}
          </Label>
        </View>
      ) : (
        ordered.map((point) => {
          const metres = here ? metresToDropOff(here, point) : null;
          return (
            <View
              key={point.id}
              style={{ backgroundColor: color.surface, borderRadius: 14, padding: 14, gap: 8, ...shadow.card }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <MapPin size={18} color={color.accent} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Heading size={15}>{t(point.name)}</Heading>
                  <Label colour={color.neutral700}>{t(point.where)}</Label>
                </View>
                {/*
                  With no position there is no distance, and the line says so
                  rather than printing a number measured from nothing.
                */}
                <Label colour={metres == null ? color.neutral700 : color.accent}>
                  {metres == null
                    ? t({ en: 'Location off', th: 'ยังไม่ได้เปิดตำแหน่ง', zh: '未开启定位' })
                    : t(dropOffDistanceLabel(metres))}
                </Label>
              </View>

              {/* What it takes, at the moment somebody has to decide. */}
              <Label colour={color.neutral700}>
                {t({ en: 'Takes', th: 'รับ', zh: '接收' })}
                {': '}
                {point.accepts.map((key) => t(ACCEPTS_LABEL[key])).join(' · ')}
              </Label>

              {/*
                A pilot point is a proposal, and the line says so in place of
                hours and a signer - neither exists yet, and printing a guess
                sends somebody to a bin that is not there or not open.
              */}
              {point.pilot || point.hours === null ? (
                <Label colour={color.accent}>
                  {t({
                    en: 'Pilot point · awaiting the municipality · no points paid here yet',
                    th: 'จุดนำร่อง · รอเทศบาลยืนยัน · ยังไม่ได้รับแต้มที่จุดนี้',
                    zh: '试点 · 等待市政方确认 · 此处暂不发放积分',
                  })}
                </Label>
              ) : (
                <Label colour={color.neutral700}>
                  {t({ en: 'Open', th: 'เวลาเปิด', zh: '开放时间' })}
                  {': '}
                  {point.hours}
                  {'  ·  '}
                  {t({ en: 'Signed for by', th: 'ผู้ลงนามรับ', zh: '签收人' })}
                  {': '}
                  {point.host.name}
                </Label>
              )}

              {onRoute ? (
                <Pressable
                  onPress={() => onRoute(point)}
                  accessibilityRole="button"
                  accessibilityLabel={t({ en: 'Directions to this drop-off point', th: 'นำทางไปจุดรับนี้', zh: '导航到此投放点' })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}
                >
                  <Navigation size={14} color={color.brand} />
                  <Label colour={color.brand}>{t({ en: 'Directions', th: 'นำทาง', zh: '导航' })}</Label>
                </Pressable>
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}
