/**
 * Stories on a place: the ring of posters, the door, and the viewer.
 *
 * The block sits on the place screen under the live figures. A row of round
 * posters, gold-ringed, one per approved story, newest first; tapping one
 * opens the viewer - full screen, one story at a time, tap right for the
 * next and left for the last, the way every phone already knows. Under the
 * row, the door: "Tell a story here" when the deployment has opened it, and
 * an honest line saying when it opens when it has not. A sent story is
 * pending and says so; it never appears in the row until a host has looked.
 *
 * Video plays on the web, where the pitch is, through the browser's own
 * <video>; a phone shows the poster and says so until it has a player.
 */

import React from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { X } from 'lucide-react-native';
import { strings } from '@chivago/core';
import { API_BASE, type Story } from '../api/client.ts';
import { color, gutter, radius } from '../theme/index.ts';
import { Body, Heading, Label } from './Type.tsx';
import { Button } from './Button.tsx';
import { t } from '../i18n/locale.ts';
import { useServerConfig } from '../state/server-config.ts';

const RING = 64;

export function StoriesBlock({
  open, stories, pending, busy, onTell,
}: {
  open: boolean;
  stories: Story[];
  /** How many this device has sent that a host has not yet looked at. */
  pending: number;
  busy: boolean;
  onTell: () => void;
}) {
  const [viewer, setViewer] = React.useState<number | null>(null);
  // Whether anybody looks at a clip before it is public. See fence.ts.
  const { autoApprove } = useServerConfig();
  return (
    <View style={{ marginTop: 24 }}>
      <Label size={10} tracking={0.14}>{t(strings.place.stories)}</Label>
      {stories.length === 0 ? (
        <Body size={13} colour={color.neutral600} style={{ marginTop: 6 }}>{t(strings.place.storiesEmpty)}</Body>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ gap: 12 }}>
          {stories.map((s, i) => (
            <Pressable
              key={s.id}
              onPress={() => setViewer(i)}
              accessibilityRole="button"
              accessibilityLabel={`${t(strings.place.stories)}: ${s.caption || s.kind}`}
              style={{ alignItems: 'center', width: RING + 8 }}
            >
              <View style={{ width: RING + 8, height: RING + 8, borderRadius: (RING + 8) / 2, borderWidth: 3, borderColor: color.gold, padding: 2 }}>
                <Image
                  source={{ uri: `${API_BASE}${s.poster}` }}
                  style={{ width: RING - 2, height: RING - 2, borderRadius: (RING - 2) / 2, backgroundColor: color.neutral200 }}
                />
              </View>
              <Label size={9} colour={color.neutral600} style={{ marginTop: 4 }}>
                {s.kind === 'video' ? `${Math.max(1, Math.round(s.durationS ?? 0))} s` : t({ en: 'photo', th: 'รูป' })}
              </Label>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {open ? (
        <>
          {/* The notice before the camera (docs/46). Going on is the consent. */}
          <Body size={13} colour={color.neutral600} style={{ marginTop: 12 }}>{t(strings.place.storyNotice)}</Body>
          {/*
            And, where nothing is reviewed first, what that means for the
            person about to post. It belongs HERE rather than in a toast
            afterwards: the room they are posting into is the one thing they
            cannot see, and by the time a toast says it the clip is up.
          */}
          {autoApprove ? (
            <Body size={13} colour={color.accent2} style={{ marginTop: 6 }}>{t(strings.place.storyUnreviewed)}</Body>
          ) : null}
          <Button
            label={t(strings.place.tellStory)}
            thai={strings.place.tellStory.th}
            onPress={onTell}
            disabled={busy}
            variant="secondary"
            height={44}
            style={{ marginTop: 8 }}
          />
        </>
      ) : (
        <Body size={13} colour={color.neutral600} style={{ marginTop: 10 }}>{t(strings.place.storiesClosed)}</Body>
      )}
      {/* Only a queue that exists can be waited on. */}
      {pending > 0 && !autoApprove ? (
        <Body size={13} colour={color.brand} style={{ marginTop: 8 }}>{`${t(strings.place.storyPending)} · ${pending}`}</Body>
      ) : null}

      {viewer !== null && stories[viewer] ? (
        <StoryViewer stories={stories} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />
      ) : null}
    </View>
  );
}

/** The video element, on the web only. A phone gets the poster until it has a player. */
function StoryMedia({ story, onEnded }: { story: Story; onEnded: () => void }) {
  if (story.kind === 'video' && Platform.OS === 'web') {
    return React.createElement('video', {
      key: story.id,
      src: `${API_BASE}${story.media}`,
      poster: `${API_BASE}${story.poster}`,
      autoPlay: true,
      muted: true,
      playsInline: true,
      onEnded,
      style: { width: '100%', height: '100%', objectFit: 'contain', background: '#000' },
    });
  }
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <Image source={{ uri: `${API_BASE}${story.poster}` }} style={{ width: '100%', aspectRatio: 9 / 16 }} resizeMode="contain" />
      {story.kind === 'video' ? (
        <Body size={13} colour="#ffffff" style={{ textAlign: 'center', marginTop: 8 }}>{t(strings.place.storyWebOnly)}</Body>
      ) : null}
    </View>
  );
}

export function StoryViewer({
  stories, index, onIndex, onClose,
}: {
  stories: Story[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const story = stories[index]!;
  const next = () => { if (index + 1 < stories.length) onIndex(index + 1); else onClose(); };
  const prev = () => { onIndex(Math.max(0, index - 1)); };
  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {/* One segment per story, the ones seen filled: where you are in the row. */}
        <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingTop: 14 }}>
          {stories.map((s, i) => (
            <View key={s.id} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= index ? '#ffffff' : 'rgba(255,255,255,0.35)' }} />
          ))}
        </View>

        <View style={{ flex: 1, marginTop: 10 }}>
          <StoryMedia story={story} onEnded={next} />
        </View>

        {/* Tap zones: the left third goes back, the right two thirds go on. */}
        <Pressable onPress={prev} accessibilityRole="button" accessibilityLabel={t(strings.place.storyPrev)}
          style={{ position: 'absolute', top: 70, bottom: 130, left: 0, width: '33%' }} />
        <Pressable onPress={next} accessibilityRole="button" accessibilityLabel={t(strings.place.storyNext)}
          style={{ position: 'absolute', top: 70, bottom: 130, right: 0, width: '67%' }} />

        <View style={{ paddingHorizontal: gutter, paddingBottom: 28, paddingTop: 12 }}>
          {story.caption ? <Heading size={18} colour="#ffffff">{story.caption}</Heading> : null}
          <Label size={10} tracking={0.12} colour="rgba(255,255,255,0.7)" style={{ marginTop: 6 }}>
            {`${index + 1} / ${stories.length} · ${t(strings.place.storyViewerHint)}`}
          </Label>
        </View>

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t({ en: 'Close', th: 'ปิด' })}
          style={{ position: 'absolute', top: 24, right: 10, padding: 10, borderRadius: radius.lg }}
        >
          <X size={22} color="#ffffff" strokeWidth={2.2} />
        </Pressable>
      </View>
    </Modal>
  );
}
