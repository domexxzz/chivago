/**
 * The sea and sky above the area you are looking at, live from Open-Meteo
 * through the API (apps/api/src/weather.ts).
 *
 * Same card discipline as the stalls and the courts: a figure the service did
 * not just give is DATED, and when it could not be reached that is said -
 * never a nought, which on a wave height reads as a flat calm.
 *
 * It says it is not a navigation forecast, because it is not one: Open-Meteo
 * is a model, the reading is at the area's centre, and nobody should cross a
 * channel on it.
 */

import React from 'react';
import { View } from 'react-native';
import { categoriesFor, strings, type AreaKey, type WeatherCategoryKey } from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, radius } from '../theme/index.ts';
import { Body, Heading, Label } from './Type.tsx';
import { Button } from './Button.tsx';
import { WeatherCategoriesBar, categoryLine } from './WeatherCategoriesBar.tsx';
import { t } from '../i18n/locale.ts';
import { formatTime } from '../i18n/format.ts';

/** "22:45" on the island's clock, whatever the phone's own is set to. */
function clock(iso: string): string {
  return formatTime(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Bangkok' });
}

/**
 * How long a reading is shown without a date on it. Open-Meteo steps every
 * fifteen minutes, so a quarter hour is as fresh as the feed itself gets.
 */
export const LIVE_FOR_MS = 15 * 60_000;

/** When this answer reached the phone, on the phone's own clock. */
function useReceivedAt(data: unknown): number {
  const stamp = React.useRef<{ data: unknown; at: number }>({ data: undefined, at: 0 });
  if (stamp.current.data !== data) stamp.current = { data, at: Date.now() };
  return stamp.current.at;
}

export function SeaAndSkyCard({ area, liveForMs = LIVE_FOR_MS }: { area: AreaKey; liveForMs?: number }) {
  const res = useAsync(() => api.weather(area), [area]);
  const data = res.data;
  const receivedAt = useReceivedAt(data);
  const [picked, setPicked] = React.useState<WeatherCategoryKey | null>(null);

  const offered = data ? categoriesFor(data) : [];
  // The chosen tab, or the first the reading can fill. A tab that stops being
  // answerable (the sea feed drops out) falls back rather than showing empty.
  const selected = picked !== null && offered.includes(picked) ? picked : offered[0];

  const live = data?.provenance === 'live';
  const fresh = live && Date.now() - receivedAt < liveForMs;
  const line = data && selected ? categoryLine(data, selected) : null;

  // Nothing read: say so plainly rather than drawing an empty bar.
  const nothing = !data || offered.length === 0;
  const note = nothing
    ? t(res.error !== null || data ? strings.place.weatherDown : strings.place.weatherNoStatus)
    : !data.observedAt
      ? t(strings.place.weatherNoStatus)
      : fresh
        ? null
        : t(data.provenance === 'live'
          ? strings.place.weatherAsOf(clock(data.observedAt))
          : strings.place.weatherStale(clock(data.observedAt)));

  return (
    <View
      style={{
        marginTop: 16,
        padding: 14,
        backgroundColor: color.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: color.neutral300,
      }}
    >
      <Label size={10} tracking={0.12}>{t(strings.place.weatherTitle)}</Label>

      {res.loading && !data ? <Body size={13} style={{ marginTop: 8 }}>…</Body> : null}

      {line && selected ? (
        <Heading size={18} style={{ marginTop: 6 }}>{line}</Heading>
      ) : null}

      {note ? (
        <Body size={13} colour={color.neutral700} style={{ marginTop: line ? 4 : 8 }}>{note}</Body>
      ) : null}

      {nothing ? (
        <Button
          label={t(strings.place.weatherAgain)}
          onPress={res.reload}
          variant="ghost"
          busy={res.loading}
          style={{ marginTop: 4 }}
        />
      ) : null}

      {data && selected ? (
        <WeatherCategoriesBar weather={data} selected={selected} onSelect={setPicked} />
      ) : null}

      <Label size={9} tracking={0.04} colour={color.neutral600} style={{ marginTop: 4, textTransform: 'none' }}>
        {t(strings.place.weatherVia)}
      </Label>
    </View>
  );
}
