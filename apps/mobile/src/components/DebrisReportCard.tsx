/**
 * The door to the debris report, on Home.
 *
 * Drawn only on an island that takes reports AND only while somebody is named
 * to read them (`/config` → `debrisReader`). Otherwise it draws nothing at all:
 * a door to an empty room is worse than no door, because the person who walks
 * through it and is never answered does not try again.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { Camera } from 'lucide-react-native';
import { DEBRIS_CASE_PREFIX } from '@chivago/core';
import { useArea } from '../state/area.ts';
import { useServerConfig } from '../state/server-config.ts';
import { color, radius, shadow } from '../theme/index.ts';
import { Body, Heading } from './Type.tsx';
import { t } from '../i18n/locale.ts';

export function DebrisReportCard({ onOpen }: { onOpen: () => void }) {
  const area = useArea();
  const { debrisReader } = useServerConfig();
  if (!DEBRIS_CASE_PREFIX[area.key] || !debrisReader) return null;
  return (
    <Pressable
      accessibilityRole="button"
      // The label replaces the card's text for a screen reader, so it carries
      // the two things the card exists to say: who gets it, and no points.
      accessibilityLabel={t({
        en: `Report rubbish on the shore to ${debrisReader}. No points.`,
        th: `รายงานขยะที่ลอยมาติดหาดถึง${debrisReader} ไม่ได้แต้ม`,
        zh: `向${debrisReader}报告岸边的垃圾。不计积分。`,
      })}
      onPress={onOpen}
      style={{ ...shadow.card, flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 14, padding: 16, borderRadius: radius.md, backgroundColor: color.surface }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color.ctaSoft }}>
        <Camera size={22} color={color.ctaDeep} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Heading size={16}>{t({ en: 'Seen rubbish washed up?', th: 'เห็นขยะลอยมาติดหาด?', zh: '看到冲上岸的垃圾了吗？' })}</Heading>
        <Body size={13} colour={color.neutral700}>
          {t({
            en: `Photograph it from where you stand and ${debrisReader} gets it. No need to pick it up. No points, on purpose.`,
            th: `ถ่ายจากจุดที่ยืนอยู่ แล้ว${debrisReader}จะได้รับ ไม่ต้องเก็บเอง และไม่ได้แต้ม โดยตั้งใจ`,
            zh: `在您所站的位置拍下来，${debrisReader}就会收到。无需亲手捡拾。刻意不给积分。`,
          })}
        </Body>
      </View>
    </Pressable>
  );
}
