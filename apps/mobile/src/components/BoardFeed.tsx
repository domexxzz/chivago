/**
 * The board on Home: what everybody else in this area has left behind.
 *
 * Every phone here is its own account - no sign-up, no password, nothing to
 * link - so a room full of people using the app at once used to be a room
 * full of separate apps, each one a private notebook. This is the one screen
 * where those accounts meet: the clip somebody filmed at the viewpoint and
 * the review somebody wrote at the shop row, in the order they happened, and
 * every card is a door into the place it came from so a reader can go and
 * add their own.
 *
 * A story is here only once a host approved it, which is the rule the
 * projector screen already ran on. A review is here as written, because
 * writing one already costs a geofenced check-in. A check-in itself is not
 * an entry - see packages/core/src/board.ts for why.
 *
 * An empty board says it is empty. It is not padded with a placeholder card,
 * because a board that always looks busy tells a reader nothing about
 * whether anybody is here.
 */

import React from 'react';
import { Image, Pressable, View } from 'react-native';
import { Star, Video } from 'lucide-react-native';
import { strings, type BoardEntry } from '@chivago/core';
import { API_BASE } from '../api/client.ts';
import { color, gutter, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from './Type.tsx';
import { t } from '../i18n/locale.ts';

/** The stars, drawn rather than spelled: five glyphs read faster than "4/5". */
function Stars({ rating }: { rating: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }} accessibilityLabel={`${rating} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={11}
          color={n <= rating ? color.gold : color.neutral300}
          fill={n <= rating ? color.gold : 'transparent'}
          strokeWidth={2}
        />
      ))}
    </View>
  );
}

function EntryCard({ entry, onOpenPlace }: { entry: BoardEntry; onOpenPlace: (placeId: string) => void }) {
  const place = t(entry.placeName);
  const label = entry.kind === 'story'
    ? `${t(strings.board.aClip)} · ${place}${entry.caption ? `. ${entry.caption}` : ''}`
    : `${entry.rating} / 5 · ${place}. ${entry.body ?? ''}`;

  return (
    <Pressable
      onPress={() => onOpenPlace(entry.placeId)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[shadow.card, {
        flexDirection: 'row', gap: 12, padding: 12, marginBottom: 10,
        backgroundColor: color.surface, borderRadius: radius.md,
      }]}
    >
      {entry.kind === 'story' ? (
        <View style={{ width: 54, height: 72, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: color.neutral200 }}>
          <Image
            source={{ uri: `${API_BASE}${entry.posterUrl}` }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
            // The poster is the frame the server made; nothing here draws a
            // stand-in when it is missing, because a grey box is honest and
            // a stock photograph of a beach is not.
            accessibilityIgnoresInvertColors
          />
        </View>
      ) : null}

      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {entry.kind === 'story' ? (
            <>
              {entry.media === 'video' ? <Video size={12} color={color.brand} strokeWidth={2.4} /> : null}
              <Label size={9} tracking={0.1} colour={color.brand}>
                {t(entry.media === 'video' ? strings.board.aClip : strings.board.aPhoto)}
              </Label>
            </>
          ) : (
            <Stars rating={entry.rating} />
          )}
          <Label size={9} tracking={0.1} colour={color.neutral600} style={{ flex: 1, textTransform: 'none' }}>
            {place}
          </Label>
        </View>

        {entry.kind === 'story' ? (
          entry.caption ? <Body size={13} colour={color.neutral800}>{entry.caption}</Body> : null
        ) : (
          <>
            {entry.body ? <Body size={13} colour={color.neutral800}>{entry.body}</Body> : null}
            <Label size={9} tracking={0.04} colour={color.neutral600} style={{ textTransform: 'none' }}>
              {entry.authorName}
            </Label>
          </>
        )}
      </View>
    </Pressable>
  );
}

export function BoardFeed({
  entries, loading, error, onRetry, onOpenPlace,
}: {
  entries: BoardEntry[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenPlace: (placeId: string) => void;
}) {
  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 22 }}>
      <Heading size={17}>{t(strings.board.title)}</Heading>
      <Body size={13} colour={color.neutral600} style={{ marginTop: 2, marginBottom: 12 }}>
        {t(strings.board.subtitle)}
      </Body>

      {error ? (
        <Pressable onPress={onRetry} accessibilityRole="button">
          <Body size={13} colour={color.accent2}>{error}</Body>
        </Pressable>
      ) : loading && !entries ? (
        <Body size={13} colour={color.neutral600}>{t(strings.board.loading)}</Body>
      ) : !entries || entries.length === 0 ? (
        <Body size={13} colour={color.neutral600}>{t(strings.board.empty)}</Body>
      ) : (
        entries.map((entry) => (
          <EntryCard key={`${entry.kind}:${entry.id}`} entry={entry} onOpenPlace={onOpenPlace} />
        ))
      )}
    </View>
  );
}
