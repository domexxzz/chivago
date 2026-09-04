/**
 * Two things the seed could only fake, shown as what they are.
 *
 * HereNow: how many ChivaGo travellers checked in at this place in the last
 * hour, counted from the ledger. Beside the crowd estimate, not instead of
 * it - the estimate is labelled an estimate now, and this is the fact.
 *
 * AirHistory: the air over this place by island day, as the server recorded
 * it. Bars, min to max, with the mean marked. It starts the day recording
 * started and says so; an empty chart is empty, not thirty days of zeros.
 */

import React from 'react';
import { View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { Users } from 'lucide-react-native';
import { CROWD_SOURCE, crowdLine, strings, type AirHistory, type LiveCrowd } from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from './Type.tsx';
import { t } from '../i18n/locale.ts';

export function HereNow({ crowd }: { crowd: LiveCrowd | undefined }) {
  if (!crowd) return null;
  return (
    <View
      style={[shadow.card, {
        flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, padding: 14,
        backgroundColor: color.surface, borderRadius: radius.md,
      }]}
      accessibilityLabel={`${t(strings.place.hereNow)}: ${t(crowdLine(crowd))}`}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Users size={18} color={color.brand} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Heading size={22}>{String(crowd.checkinsLastHour)}</Heading>
          <Label size={10} tracking={0.12}>{t(strings.place.hereNow)}</Label>
        </View>
        <Body size={13} colour={color.neutral800}>{t(crowdLine(crowd))}</Body>
        <Label size={9} tracking={0.04} colour={color.neutral600} style={{ marginTop: 2, textTransform: 'none' }}>
          {t(CROWD_SOURCE)}
        </Label>
      </View>
    </View>
  );
}

/** The chart's geometry, pure, so a test can hold it. */
export function historyBars(history: AirHistory, width: number, height: number, days = 30): {
  x: number; w: number; top: number; bottom: number; mid: number; day: string; aqi: number;
}[] {
  const byDay = new Map(history.days.map((d) => [d.day, d]));
  const keys = [...byDay.keys()].sort();
  const last = keys[keys.length - 1];
  if (!last) return [];
  // Thirty slots ending on the last recorded day, so a gap is a gap.
  const end = new Date(`${last}T00:00:00Z`).getTime();
  const slots: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) slots.push(new Date(end - i * 86_400_000).toISOString().slice(0, 10));
  const maxAqi = Math.max(50, ...history.days.map((d) => d.max));
  const slotW = width / days;
  const scale = (v: number) => height - (v / maxAqi) * height;
  return slots.flatMap((day, i) => {
    const d = byDay.get(day);
    if (!d) return [];
    return [{ x: i * slotW + slotW * 0.2, w: slotW * 0.6, top: scale(d.max), bottom: scale(d.min), mid: scale(d.avg), day, aqi: d.avg }];
  });
}

/** US AQI bands, for the bar colour. Green is not the evidence green: it is the AQI scale's own. */
const aqiTone = (aqi: number): string => (aqi <= 50 ? '#7fb069' : aqi <= 100 ? '#e0b34a' : aqi <= 150 ? '#e8963b' : '#d33a2f');

export function AirHistoryCard({ placeId }: { placeId: string }) {
  const history = useAsync(() => api.placeHistory(placeId), [placeId]);
  const width = 300;
  const height = 90;
  const bars = history.data ? historyBars(history.data, width, height) : [];
  const since = history.data?.since ? history.data.since.slice(0, 10) : null;
  return (
    <View style={[shadow.card, { marginTop: 12, padding: 14, backgroundColor: color.surface, borderRadius: radius.md }]}>
      <Label size={10} tracking={0.12}>{t(strings.place.airHistory)}</Label>
      {history.data && bars.length > 0 ? (
        <View style={{ marginTop: 10 }}>
          <Svg width="100%" height={height + 16} viewBox={`0 0 ${width} ${height + 16}`} accessibilityLabel={t(strings.place.airFewDays(history.data.days.length))}>
            {[50, 100].map((v) => {
              const maxAqi = Math.max(50, ...history.data!.days.map((d) => d.max));
              if (v > maxAqi) return null;
              const y = height - (v / maxAqi) * height;
              return <Line key={v} x1={0} y1={y} x2={width} y2={y} stroke={color.neutral300} strokeWidth={1} strokeDasharray="3 4" />;
            })}
            {bars.map((b) => (
              <React.Fragment key={b.day}>
                <Rect x={b.x} y={b.top} width={b.w} height={Math.max(2, b.bottom - b.top)} rx={2} fill={aqiTone(b.aqi)} opacity={0.85} />
                <Line x1={b.x} y1={b.mid} x2={b.x + b.w} y2={b.mid} stroke={color.text} strokeWidth={1.5} />
              </React.Fragment>
            ))}
            <SvgText x={0} y={height + 13} fontSize={9} fill={color.neutral600}>{bars[0]!.day.slice(5)}</SvgText>
            <SvgText x={width} y={height + 13} fontSize={9} fill={color.neutral600} textAnchor="end">{bars[bars.length - 1]!.day.slice(5)}</SvgText>
          </Svg>
          <Label size={9} tracking={0.04} colour={color.neutral600} style={{ marginTop: 6, textTransform: 'none' }}>
            {`${t(strings.place.airFewDays(history.data.days.length))}${since ? ` ${t(strings.place.airSince(since))}` : ''}`}
          </Label>
        </View>
      ) : (
        <Body size={13} colour={color.neutral700} style={{ marginTop: 8 }}>
          {history.loading ? '…' : t(strings.place.airNoHistory)}
        </Body>
      )}
    </View>
  );
}
