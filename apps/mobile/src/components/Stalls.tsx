/**
 * Order ahead (docs/65): the stalls at a food court that take orders ahead,
 * each with the wait its own kitchen queue gives, and a button that opens the
 * stall's order page in สั่งก่อน.
 *
 * ChivarGo takes no order and moves no money, and the card says where both go.
 * Figures the service did not just give are dated, and what a stall can do is
 * not claimed from them; a stand-in stall is labelled an example, the way an
 * example offer is.
 */

import React from 'react';
import { Linking, View } from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import {
  NO_QUEUE_READING, QUEUE_LEVELS, QUEUE_REPORT_WORDS, islandDateKey, isOrderLink, sayQueue, stallState, strings,
  type PlaceStalls, type QueueLevel, type QueueReading, type Stall,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, onFill, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from './Type.tsx';
import { Button } from './Button.tsx';
import { t } from '../i18n/locale.ts';
import { formatDate, formatTime } from '../i18n/format.ts';

const DAY_MS = 86_400_000;
/** "06:00" on the island's clock, whatever the phone's own is set to. */
function clock(iso: string): string {
  return formatTime(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Bangkok' });
}

/** When a closed stall opens: a time today, tomorrow and a time, or the day and a time further out. */
function closedLine(opensAt: string, now: Date): string {
  const day = islandDateKey(new Date(opensAt));
  if (day === islandDateKey(now)) return t(strings.place.stallClosedUntil(clock(opensAt)));
  if (day === islandDateKey(new Date(now.getTime() + DAY_MS))) return t(strings.place.stallClosedTomorrow(clock(opensAt)));
  const date = formatDate(opensAt, {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok',
  });
  return t(strings.place.stallClosedOn(date, clock(opensAt)));
}

/** What the stall can do now, as one line. Empty when there is nothing to add to the button. */
function stallLine(s: Stall, now: Date): string {
  switch (stallState(s)) {
    case 'closed': return s.opensAt ? closedLine(s.opensAt, now) : t(strings.place.stallClosed);
    case 'paused': return t(strings.place.stallPaused);
    case 'unpaid': return t(strings.place.stallUnpaid);
    case 'full': return t(strings.place.stallFull);
    case 'order': return s.waitMin !== null ? t(strings.place.stallWait(s.waitMin)) : '';
  }
}

/**
 * How long a live wait is shown as one. The screen is not refreshed behind
 * the student's back; after this the card dates the wait and offers to look
 * again instead.
 */
export const LIVE_FOR_MS = 2 * 60_000;

/**
 * When this answer reached the phone, on the phone's own clock. The service's
 * `observedAt` says when a wait was read; how long ago is counted from here,
 * so a phone set a few minutes wrong still ages a wait correctly.
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

/** The line above the stalls, and whether to offer to look again, for an answer that is not simply fresh. */
function noteFor(data: PlaceStalls | null, failed: boolean, fresh: boolean): { note: string | null; again: boolean } {
  if (!data) return { note: failed ? t(strings.place.stallsDown) : null, again: failed };
  if (data.stalls.length === 0) {
    // None take orders ahead is an answer; asking again will not add a stall.
    return data.provenance === 'live'
      ? { note: t(strings.place.stallsNone), again: false }
      : { note: t(strings.place.stallsDown), again: true };
  }
  if (fresh) return { note: null, again: false };
  // The static demo: named, never read, nothing to ask again.
  if (!data.observedAt) return { note: t(strings.place.stallsNoStatus), again: false };
  const at = clock(data.observedAt);
  return { note: t(data.provenance === 'live' ? strings.place.stallsAsOf(at) : strings.place.stallsStale(at)), again: true };
}

export function StallsCard({ placeId, placeName, liveForMs = LIVE_FOR_MS }: {
  placeId: string;
  /** Away from the place's own screen (on Home), the card says which food court it is. */
  placeName?: string;
  liveForMs?: number;
}) {
  const res = useAsync(() => api.stalls(placeId), [placeId]);
  const data = res.data;
  const receivedAt = useReceivedAt(data);
  const live = data?.provenance === 'live';
  useRenderAt(live ? receivedAt + liveForMs : null);
  const now = new Date();
  const fresh = live && now.getTime() - receivedAt < liveForMs;
  const listed = data !== null && data.stalls.length > 0;
  const { note, again } = noteFor(data, res.error !== null, fresh);
  return (
    <View style={[shadow.card, { marginTop: 12, padding: 14, backgroundColor: color.surface, borderRadius: radius.md }]}>
      <Label size={10} tracking={0.12}>
        {placeName ? t(strings.place.stallsTitleAt(placeName)) : t(strings.place.stallsTitle)}
      </Label>
      <Body size={13} colour={color.neutral700} style={{ marginTop: 6 }}>{t(strings.place.stallsIntro)}</Body>

      {res.loading && !data && !note ? <Body size={13} style={{ marginTop: 10 }}>…</Body> : null}
      {note && !listed ? <Body size={13} colour={color.neutral700} style={{ marginTop: 10 }}>{note}</Body> : null}
      {note && listed ? (
        <Label size={10} tracking={0.04} colour={color.neutral600} style={{ marginTop: 10, textTransform: 'none' }}>{note}</Label>
      ) : null}
      {again ? (
        <Button label={t(strings.place.stallsAgain)} onPress={res.reload} variant="ghost" busy={res.loading} style={{ marginTop: 4 }} />
      ) : null}

      {data?.stalls.map((s) => <StallRow key={s.slug} stall={s} live={fresh} now={now} />)}

      {/*
        The queue, which is a different question from the wait and answered by
        different people. It sits below the stalls because the kitchen's own
        figure is the better answer whenever there is one.
      */}
      <QueueStrip placeId={placeId} />

      <Label size={9} tracking={0.04} colour={color.neutral600} style={{ marginTop: 12, textTransform: 'none' }}>
        {t(strings.place.stallsVia)}
      </Label>
    </View>
  );
}

/**
 * How long the queue is, as the people standing in it said.
 *
 * A level and its age, never minutes: minutes belong to the kitchen. A press
 * records what you can see and redraws from the answer, so the count and the
 * disagreement come from the server rather than from a guess made here. A
 * second press inside the window answers 200 with `recorded: false`, which is
 * not an error and must not look like one.
 */
function QueueStrip({ placeId }: { placeId: string }) {
  const res = useAsync(() => api.queue(placeId), [placeId]);
  const [said, setSaid] = React.useState<QueueReading | null>(null);
  const [busy, setBusy] = React.useState<QueueLevel | null>(null);
  const [failed, setFailed] = React.useState(false);
  const reading = said ?? res.data?.queue ?? null;

  const tell = async (level: QueueLevel) => {
    setBusy(level);
    setFailed(false);
    try {
      const answer = await api.reportQueue(placeId, level);
      // A refusal is a refusal, including the ceiling that answers 200 with
      // `recorded: false` - which carries a reading, so it is not a failure.
      if (!answer.ok) { setFailed(true); return; }
      setSaid(answer.data.queue);
    } catch {
      // Said once, beside the control. The app does not retry behind anybody's
      // back, the rule `useAsync` holds everywhere else.
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  if (res.loading && reading === null && !res.error) return null;

  return (
    <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: color.neutral300 }}>
      <Label size={10} tracking={0.12}>{t(strings.place.queueTitle)}</Label>
      <Body size={13} colour={color.neutral700} style={{ marginTop: 6 }}>
        {res.error !== null && reading === null
          ? t(strings.place.queueDown)
          : t(sayQueue(reading ?? NO_QUEUE_READING))}
      </Body>
      <Body size={13} colour={color.neutral700} style={{ marginTop: 10 }}>{t(strings.place.queueAsk)}</Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {QUEUE_LEVELS.map((level) => (
          <Button
            key={level}
            label={t(QUEUE_REPORT_WORDS[level])}
            accessibilityLabel={t(strings.place.queueReport(t(QUEUE_REPORT_WORDS[level])))}
            onPress={() => { void tell(level); }}
            variant="secondary"
            height={40}
            busy={busy === level}
            style={{ flexGrow: 1 }}
          />
        ))}
      </View>
      {failed ? (
        <Body size={13} colour={color.accent2} style={{ marginTop: 8 }}>{t(strings.place.queueFailed)}</Body>
      ) : null}
    </View>
  );
}

/**
 * One stall. From figures that are not live it is named and linked, nothing
 * more: an old "ready in 5 min" at noon is a promise nobody made.
 */
function StallRow({ stall, live, now }: { stall: Stall; live: boolean; now: Date }) {
  const canOrder = live && stallState(stall) === 'order';
  const line = live ? stallLine(stall, now) : '';
  return (
    <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: color.neutral300 }}>
      <Heading size={16}>{stall.name}</Heading>
      {/* Coral, like an example offer: a reader must not take this one at face value. */}
      {stall.example ? (
        <Label size={10} tracking={0.12} colour={color.accent2} style={{ marginTop: 3 }}>{t(strings.place.stallExample)}</Label>
      ) : null}
      {line ? (
        <Body size={13} colour={canOrder ? color.text : color.neutral700} style={{ marginTop: 4 }}>{line}</Body>
      ) : null}
      {/* The API built this link; it is checked again here before a tap can take anyone anywhere. */}
      {isOrderLink(stall.orderUrl) ? (
        <Button
          label={canOrder ? t(strings.place.stallOrder) : t(strings.place.stallMenu)}
          onPress={() => { void Linking.openURL(stall.orderUrl); }}
          variant={canOrder ? 'primary' : 'secondary'}
          icon={<ExternalLink size={16} color={canOrder ? onFill.brand : color.brand} strokeWidth={2} />}
          height={44}
          style={{ marginTop: 10 }}
        />
      ) : null}
    </View>
  );
}
