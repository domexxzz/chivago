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
import { Image, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Camera, Images, X } from 'lucide-react-native';
import { strings } from '@chivago/core';
import { API_BASE, type PickedMedia, type Story } from '../api/client.ts';
import { color, gutter, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from './Type.tsx';
import { Button } from './Button.tsx';
import { t } from '../i18n/locale.ts';
import { useServerConfig } from '../state/server-config.ts';

const CARD_W = 178;
const CAPTION_MAX = 80;

/** API paths are prefixed; browser-local preview URLs are already complete. */
const storyUri = (path: string): string => /^(blob:|data:|https?:)/.test(path) ? path : `${API_BASE}${path}`;

/**
 * The clips left at a place.
 *
 * It used to carry its own "Tell a story here" button beside the reviews
 * block's "Write a review", which asked a traveller to decide which KIND of
 * thing they were leaving before they had said anything. One sheet takes
 * the stars, the words and the clip together now - see ComposeSheet - so
 * this block shows what is here and nothing else.
 */
export function StoriesBlock({
  open, stories, pending, busy = false, onPickMedia, onPostStory,
}: {
  open: boolean;
  stories: Story[];
  /** How many this device has sent that a host has not yet looked at. */
  pending: number;
  busy?: boolean;
  onPickMedia?: () => Promise<PickedMedia | null>;
  onPostStory?: (media: PickedMedia, caption: string) => Promise<boolean>;
}) {
  const [viewer, setViewer] = React.useState<number | null>(null);
  const [composing, setComposing] = React.useState(false);
  // Whether anybody looks at a clip before it is public. See fence.ts.
  const { storiesAutoApprove } = useServerConfig();
  return (
    <View style={{ marginTop: 26 }}>
      <Heading size={21}>{t(strings.place.stories)}</Heading>
      <Body size={13} colour={color.neutral700} style={{ marginTop: 5, lineHeight: 19 }}>
        {t(strings.place.storiesIntro)}
      </Body>
      {stories.length === 0 ? (
        <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={[shadow.sm, { width: 72, height: 82, padding: 6, backgroundColor: '#FFFDF8', transform: [{ rotate: '-2deg' }] }]}>
            <View style={{ flex: 1, backgroundColor: '#E8F5F8', alignItems: 'center', justifyContent: 'center' }}>
              <Camera size={25} color={color.brand} strokeWidth={1.8} />
            </View>
          </View>
          <Body size={13} colour={color.neutral600} style={{ flex: 1 }}>{t(strings.place.storiesEmpty)}</Body>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }} contentContainerStyle={{ gap: 14, paddingHorizontal: 3, paddingVertical: 7 }}>
          {stories.map((s, i) => (
            <Pressable
              key={s.id}
              onPress={() => setViewer(i)}
              accessibilityRole="button"
              accessibilityLabel={`${t(strings.place.stories)}: ${s.caption || s.kind}`}
              style={({ pressed }) => [shadow.card, {
                width: CARD_W,
                padding: 9,
                paddingBottom: 13,
                borderRadius: 5,
                backgroundColor: '#FFFDF8',
                opacity: pressed ? 0.82 : 1,
                transform: [{ rotate: i % 2 === 0 ? '-1.2deg' : '1.2deg' }],
              }]}
            >
              <Image source={{ uri: storyUri(s.poster) }} style={{ width: '100%', height: 182, backgroundColor: color.neutral200 }} resizeMode="cover" />
              <Body size={13} colour={color.text} numberOfLines={2} style={{ marginTop: 10, minHeight: 36, lineHeight: 18, alignSelf: 'stretch' }}>
                {s.caption || t({ en: 'A moment from here', th: 'โมเมนต์จากที่นี่', zh: '这里的一个瞬间' })}
              </Body>
              <Label size={9} tracking={0.08} colour={color.neutral600} style={{ marginTop: 5, alignSelf: 'stretch' }}>
                {s.kind === 'video' ? `VIDEO · ${Math.max(1, Math.round(s.durationS ?? 0))} S` : t({ en: 'CHECK-IN PHOTO', th: 'รูปเช็กอิน', zh: '打卡照片' })}
              </Label>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {!open ? (
        <Body size={13} colour={color.neutral600} style={{ marginTop: 10 }}>{t(strings.place.storiesClosed)}</Body>
      ) : onPickMedia && onPostStory ? (
        <Button
          label={t(strings.place.tellStory)}
          onPress={() => setComposing(true)}
          variant="secondary"
          height={44}
          style={{ marginTop: 14, borderRadius: 22 }}
          icon={<Images size={18} color={color.brand} strokeWidth={2.1} />}
        />
      ) : null}
      {/* Only a queue that exists can be waited on. */}
      {pending > 0 && !storiesAutoApprove ? (
        <Body size={13} colour={color.brand} style={{ marginTop: 8 }}>{`${t(strings.place.storyPending)} · ${pending}`}</Body>
      ) : null}

      {viewer !== null && stories[viewer] ? (
        <StoryViewer stories={stories} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />
      ) : null}

      {onPickMedia && onPostStory ? (
        <StoryComposer
          visible={composing}
          busy={busy}
          onPickMedia={onPickMedia}
          onPost={onPostStory}
          onClose={() => setComposing(false)}
        />
      ) : null}
    </View>
  );
}

function StoryComposer({
  visible, busy, onPickMedia, onPost, onClose,
}: {
  visible: boolean;
  busy: boolean;
  onPickMedia: () => Promise<PickedMedia | null>;
  onPost: (media: PickedMedia, caption: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [media, setMedia] = React.useState<PickedMedia | null>(null);
  const [caption, setCaption] = React.useState('');
  const [posting, setPosting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!visible) return;
    setMedia(null);
    setCaption('');
    setPosting(false);
    setError(null);
  }, [visible]);

  const pick = async () => {
    const chosen = await onPickMedia();
    if (chosen) { setMedia(chosen); setError(null); }
  };
  const post = async () => {
    if (!media || posting || busy) return;
    setPosting(true);
    setError(null);
    const ok = await onPost(media, caption.trim());
    setPosting(false);
    if (ok) onClose();
    else setError(t({ en: 'Could not post. Your draft is still here.', th: 'โพสต์ไม่สำเร็จ ข้อมูลที่เขียนยังอยู่', zh: '发布失败，草稿仍保留。' }));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(13,45,60,0.42)' }}>
        <View style={{ maxHeight: '92%', backgroundColor: '#F4FAFC', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' }}>
          <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: color.neutral400, alignSelf: 'center', marginTop: 9 }} />
          <View style={{ paddingHorizontal: gutter, paddingTop: 14, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Heading size={20}>{t(strings.place.storyComposeTitle)}</Heading>
              <Body size={13} colour={color.neutral600} style={{ marginTop: 3 }}>{t(strings.place.storyFromAnywhere)}</Body>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t(strings.common.close)} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: color.neutral200, alignItems: 'center', justifyContent: 'center' }}>
              <X size={20} color={color.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
            <View style={[shadow.card, { alignSelf: 'center', width: '100%', maxWidth: 380, padding: 12, paddingBottom: 18, backgroundColor: '#FFFDF8', borderRadius: 6, transform: [{ rotate: '-0.5deg' }] }]}>
              {media ? (
                media.type.startsWith('video') ? (
                  <View style={{ width: '100%', aspectRatio: 4 / 5, backgroundColor: '#DDF2F6', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Camera size={38} color={color.brand} />
                    <Body size={13} colour={color.brand}>{media.name}</Body>
                  </View>
                ) : (
                  <Image source={{ uri: media.uri }} style={{ width: '100%', aspectRatio: 4 / 5, backgroundColor: color.neutral200 }} resizeMode="cover" />
                )
              ) : (
                <Pressable onPress={pick} accessibilityRole="button" accessibilityLabel={t(strings.place.addMedia)} style={({ pressed }) => ({ width: '100%', aspectRatio: 4 / 5, backgroundColor: pressed ? '#DDF2F6' : '#EAF7F9', borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#8EC8D5', alignItems: 'center', justifyContent: 'center', gap: 9 })}>
                  <Images size={34} color={color.brand} strokeWidth={1.8} />
                  <Heading size={14} colour={color.brand}>{t(strings.place.addMedia)}</Heading>
                </Pressable>
              )}

              <TextInput
                value={caption}
                onChangeText={setCaption}
                maxLength={CAPTION_MAX}
                multiline
                placeholder={t(strings.place.storyCaption)}
                placeholderTextColor={color.neutral500}
                accessibilityLabel={t(strings.place.storyCaption)}
                style={{ minHeight: 72, marginTop: 12, paddingHorizontal: 4, paddingVertical: 6, fontSize: 15, lineHeight: 21, color: color.text, textAlignVertical: 'top' }}
              />
              <Label size={9} colour={color.neutral600} style={{ alignSelf: 'flex-end' }}>{`${caption.trim().length} / ${CAPTION_MAX}`}</Label>
            </View>

            {media ? <Button label={t({ en: 'Choose another photo or clip', th: 'เลือกรูปหรือคลิปใหม่', zh: '重新选择照片或短片' })} onPress={pick} variant="ghost" style={{ marginTop: 10 }} /> : null}
            <Body size={13} colour={color.neutral600} style={{ marginTop: 12, textAlign: 'center' }}>{t(strings.place.storyNotice)}</Body>
            {error ? <Body size={13} colour={color.accent2} style={{ marginTop: 10, textAlign: 'center' }}>{error}</Body> : null}
            <Button
              label={posting || busy ? t({ en: 'Posting…', th: 'กำลังโพสต์…', zh: '正在发布…' }) : t(strings.place.leaveSubmit)}
              onPress={post}
              disabled={!media || posting || busy}
              height={48}
              style={{ marginTop: 16, borderRadius: 24 }}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** The video element, on the web only. A phone gets the poster until it has a player. */
function StoryMedia({ story, onEnded }: { story: Story; onEnded: () => void }) {
  if (story.kind === 'video' && Platform.OS === 'web') {
    return React.createElement('video', {
      key: story.id,
      src: storyUri(story.media),
      poster: storyUri(story.poster),
      autoPlay: true,
      muted: true,
      playsInline: true,
      onEnded,
      style: { width: '100%', height: '100%', objectFit: 'contain', background: '#000' },
    });
  }
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <Image source={{ uri: storyUri(story.poster) }} style={{ width: '100%', aspectRatio: 9 / 16 }} resizeMode="contain" />
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
          accessibilityLabel={t({ en: 'Close', th: 'ปิด', zh: '关闭' })}
          style={{ position: 'absolute', top: 24, right: 10, padding: 10, borderRadius: radius.lg }}
        >
          <X size={22} color="#ffffff" strokeWidth={2.2} />
        </Pressable>
      </View>
    </Modal>
  );
}
