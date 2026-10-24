/**
 * Courts free now: how many of a venue's courts its own booking system says
 * are free, shown above the "Book" button so a student can tell whether the
 * trip is worth making before tapping through.
 *
 * ChivaGo takes no booking and moves no money, and the line says where both
 * go. The count is the venue's own; nothing is estimated here. A count the
 * service did not just give is dated, and when it could not be reached that is
 * said plainly - never a nought, which would read as "the place is full".
 */

import React from 'react';
import { View } from 'react-native';
import { courtState, islandDateKey, strings, type CourtCount, type PlaceCourts } from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, radius } from '../theme/index.ts';
import { Body, Heading, Label } from './Type.tsx';
import { Button } from './Button.tsx';
import { getLocale, t } from '../i18n/locale.ts';

const DAY_MS = 86_400_000;
const lang = (): string => (getLocale() === 'th' ? 'th-TH' : 'en-GB');

/** "18:30" on the island's clock, whatever the phone's own is set to. */
function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(lang(), {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok',
  });
}

/** When a shut venue opens: a time today, tomorrow and a time, or the day and a time further out. */
function closedLine(opensAt: string, now: Date): string {
  const day = islandDateKey(new Date(opensAt));
  if (day === islandDateKey(now)) return t(strings.place.courtsClosedUntil(clock(opensAt)));
  if (day === islandDateKey(new Date(now.getTime() + DAY_MS))) return t(strings.place.courtsClosedTomorrow(clock(opensAt)));
  const date = new Date(opensAt).toLocaleDateString(lang(), {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok',
  });
  return t(strings.place.courtsClosedOn(date, clock(opensAt)));
}

/** The count as one line. Shut says the hours, because a free court at midnight is not one you can play on. */
function countLine(c: CourtCount, now: Date): string {
  switch (courtState(c)) {
    case 'closed': return c.opensAt ? closedLine(c.opensAt, now) : t(strings.place.courtsClosed);
    case 'full': return t(strings.place.courtsFull(c.total));
    case 'free': return t(strings.place.courtsFree(c.free, c.total));
  }
}

/**
 * How long a live count is shown as one. The screen is not refreshed behind
 * anybody's back; after this the card dates the count and offers to look
 * again instead.
 */
export const LIVE_FOR_MS = 2 * 60_000;

/**
 * When this answer reached the phone, on the phone's own clock. The service's
 * `observedAt` says when the courts were counted; how long ago is counted from
 * here, so a phone set a few minutes wrong still ages a count correctly.
 */
function useReceivedAt(data: unknown): number {
  const stamp = React.useRef<{ data: unknown; at: number }>({ data: undefined, at: 0 });
  if (stamp.current.data !== data) stamp.current = { data, at: Date.now() };
  return stamp.current.at;
}

/** Render again once at `at` (epoch ms), so what is on screen ages without a request being made. */
function useRenderAt(at: number | null): void {
  const [, rerender] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (at === null) return undefined;
    const timer = setTimeout(rerender, Math.max(0, at - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [at]);
}

/** The note under the count, and whether to offer to look again, for an answer that is not simply fresh. */
function noteFor(data: PlaceCourts | null, failed: boolean, fresh: boolean): { note: string | null; again: boolean } {
  if (!data) return { note: failed ? t(strings.place.courtsDown) : null, again: failed };
  // No count at all: the service was not reached, or what it gave is too old to mean anything.
  if (!data.count) return { note: t(strings.place.courtsDown), again: true };
  if (fresh) return { note: null, again: false };
  // The static demo: the venue is named, the count was never read.
  if (!data.observedAt) return { note: t(strings.place.courtsNoStatus), again: false };
  const at = clock(data.observedAt);
  return { note: t(data.provenance === 'live' ? strings.place.courtsAsOf(at) : strings.place.courtsStale(at)), again: true };
}

/**
 * The court count for one place. Rendered only where a place has a court
 * service (`courtSourceFor`), so no other place screen makes this request.
 */
export function CourtsCard({ placeId, liveForMs = LIVE_FOR_MS }: { placeId: string; liveForMs?: number }) {
  const res = useAsync(() => api.courts(placeId), [placeId]);
  const data = res.data;
  const receivedAt = useReceivedAt(data);
  const live = data?.provenance === 'live';
  useRenderAt(live ? receivedAt + liveForMs : null);
  const now = new Date();
  const fresh = live && now.getTime() - receivedAt < liveForMs;
  const { note, again } = noteFor(data, res.error !== null, fresh);
  const count = data?.count ?? null;
  // A count that is no longer live is dated and not claimed: an old "2 free"
  // at six o'clock is a court nobody promised.
  const headline = count && fresh ? countLine(count, now) : null;
  const freeNow = count !== null && fresh && courtState(count) === 'free';

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
      <Label size={10} tracking={0.12}>{t(strings.place.courtsTitle)}</Label>

      {res.loading && !data && !note ? <Body size={13} style={{ marginTop: 8 }}>…</Body> : null}

      {headline ? (
        <Heading size={18} colour={freeNow ? color.text : color.neutral700} style={{ marginTop: 6 }}>
          {headline}
        </Heading>
      ) : null}

      {note ? (
        <Body size={13} colour={color.neutral700} style={{ marginTop: headline ? 4 : 8 }}>{note}</Body>
      ) : null}

      {again ? (
        <Button
          label={t(strings.place.courtsAgain)}
          onPress={res.reload}
          variant="ghost"
          busy={res.loading}
          style={{ marginTop: 4 }}
        />
      ) : null}

      <Label size={9} tracking={0.04} colour={color.neutral600} style={{ marginTop: 10, textTransform: 'none' }}>
        {t(strings.place.courtsVia)}
      </Label>
    </View>
  );
}
