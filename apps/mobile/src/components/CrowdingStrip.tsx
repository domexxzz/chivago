/**
 * How crowded a place is, from the people who are in it.
 *
 * Written for the food court's queue and now the library's seats as well
 * (`canteen-queue.ts` in core, which holds the reading rules and every word
 * either of them uses). The component knows nothing about which is which: it
 * is handed a `CrowdingKind` and reads its words from one table, so a third
 * kind is a table entry and not another copy of this file.
 *
 * WHAT IT WILL NOT DO. It does not retry behind anybody's back - a failed
 * report says so beside the control, the rule `useAsync` keeps everywhere -
 * and it shows no level at all when the report did not go through, because a
 * level on screen that the server never took is the app inventing an
 * observation.
 */

import React from 'react';
import { View } from 'react-native';
import {
  CROWDING_WORDS, NO_QUEUE_READING, QUEUE_LEVELS, sayCrowding, strings,
  type CrowdingKind, type QueueLevel, type QueueReading,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, radius } from '../theme/index.ts';
import { Body, Label } from './Type.tsx';
import { Button } from './Button.tsx';
import { t } from '../i18n/locale.ts';

export function CrowdingStrip({ placeId, kind, divider = true }: {
  placeId: string;
  kind: CrowdingKind;
  /** The rule above it, for when it sits under something else inside one card. */
  divider?: boolean;
}) {
  const words = CROWDING_WORDS[kind];
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
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  if (res.loading && reading === null && !res.error) return null;

  return (
    <View style={divider
      ? { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: color.neutral300 }
      : undefined}
    >
      <Label size={10} tracking={0.12}>{t(words.title)}</Label>
      <Body size={13} colour={color.neutral700} style={{ marginTop: 6 }}>
        {res.error !== null && reading === null
          ? t(words.down)
          : t(sayCrowding(kind, reading ?? NO_QUEUE_READING))}
      </Body>
      <Body size={13} colour={color.neutral700} style={{ marginTop: 10 }}>{t(words.ask)}</Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {QUEUE_LEVELS.map((level) => (
          <Button
            key={level}
            label={t(words.button[level])}
            accessibilityLabel={t(strings.place.queueReport(t(words.button[level])))}
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
 * The same thing with a card around it, for a place whose screen has nothing
 * else to put it inside.
 *
 * The food court's strip lives under the stalls, because the stall's own wait
 * and the length of the line are one question asked twice. The library has no
 * stalls, so the crowd is the card.
 */
export function CrowdingCard({ placeId, kind }: { placeId: string; kind: CrowdingKind }) {
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
      <CrowdingStrip placeId={placeId} kind={kind} divider={false} />
    </View>
  );
}
