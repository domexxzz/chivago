import React from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  Image, Linking, Platform, Pressable, ScrollView, Share, TextInput, View, useWindowDimensions,
} from 'react-native';
import { Camera, ExternalLink, Heart, MessageCircle, Play, Send, X } from 'lucide-react-native';

import {
  API_BASE, api, type CommunityPost, type PickedMedia,
} from '../api/client.ts';
import { useAuthedImage } from '../api/authed-image.ts';
import { Button } from '../components/Button.tsx';
import { PushHeader } from '../components/Shell.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { Body, Heading, Label } from '../components/Type.tsx';
import { formatDateTime, formatInteger } from '../i18n/format.ts';
import { t } from '../i18n/locale.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, radius, shadow } from '../theme/index.ts';

const mediaUri = (path: string): string => /^(https?:\/\/|blob:|data:|file:)/.test(path) ? path : `${API_BASE}${path}`;

export function CommunityFeedScreen({
  onBack, onToast,
}: { onBack: () => void; onToast: (message: string) => void }) {
  const { width } = useWindowDimensions();
  const feed = useAsync(() => api.communityFeed(), []);
  const [draft, setDraft] = React.useState('');
  const [media, setMedia] = React.useState<PickedMedia | null>(null);
  const [posting, setPosting] = React.useState(false);
  const contentWidth = Math.min(width, 760);

  const pickMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      onToast(t({ en: 'Allow photo access to attach media.', th: 'อนุญาตการเข้าถึงรูปภาพเพื่อแนบสื่อ', zh: '请允许访问照片以添加媒体。' }));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.82,
      videoMaxDuration: 60,
    });
    if (!result || result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setMedia({
      uri: asset.uri,
      name: asset.fileName ?? (asset.type === 'video' ? 'community-video.mp4' : 'community-photo.jpg'),
      type: asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      file: (asset as { file?: Blob }).file,
    });
  };

  const publish = async () => {
    if (!draft.trim() && !media) {
      onToast(t({ en: 'Write something or attach a photo or video.', th: 'เขียนข้อความหรือแนบรูปหรือวิดีโอก่อนโพสต์', zh: '请输入内容或添加照片或视频。' }));
      return;
    }
    setPosting(true);
    const result = await api.createCommunityPost(draft, media);
    setPosting(false);
    if (!result.ok) { onToast(result.error); return; }
    setDraft('');
    setMedia(null);
    feed.reload();
    onToast(t({ en: 'Your post is live.', th: 'โพสต์ของคุณเผยแพร่แล้ว', zh: '你的帖子已发布。' }));
  };

  const mutate = async (action: () => Promise<{ ok: boolean; error?: string }>) => {
    const result = await action();
    if (!result.ok) onToast(result.error ?? t({ en: 'Please try again.', th: 'กรุณาลองอีกครั้ง', zh: '请重试。' }));
    else feed.reload();
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#EDF6F9' }}>
      <PushHeader context={t({ en: 'Community Feed', th: 'ฟีดคอมมูนิตี้', zh: '社区动态' })} onBack={onBack} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ width: '100%', maxWidth: contentWidth, alignSelf: 'center', padding: gutter, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginBottom: 18 }}>
          <Heading size={27}>{t({ en: 'Around ChivarGo', th: 'เรื่องราวรอบ ChivarGo', zh: 'ChivarGo 身边的新鲜事' })}</Heading>
          <Body size={13} colour={color.neutral600} style={{ marginTop: 4 }}>
            {t({ en: 'Share a moment, ask the community, or pass on a useful find.', th: 'แชร์ช่วงเวลาดี ๆ ถามชุมชน หรือบอกต่อสิ่งที่เป็นประโยชน์', zh: '分享旅途瞬间、向社区提问，或推荐实用信息。' })}
          </Body>
        </View>

        <View style={[shadow.card, { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 16, marginBottom: 18, borderWidth: 1, borderColor: '#D7ECF2' }]}>
          <Label size={10} tracking={0.12} colour="#007E87">{t({ en: 'CREATE A POST', th: 'สร้างโพสต์', zh: '发布动态' })}</Label>
          <TextInput
            accessibilityLabel={t({ en: 'Post message', th: 'ข้อความโพสต์', zh: '帖子内容' })}
            value={draft}
            onChangeText={setDraft}
            placeholder={t({ en: 'What would you like to share?', th: 'วันนี้อยากแบ่งปันอะไร?', zh: '你想分享什么？' })}
            placeholderTextColor="#78909C"
            multiline
            maxLength={2_000}
            style={{ minHeight: 92, marginTop: 10, padding: 13, borderRadius: 16, backgroundColor: '#F4FAFC', borderWidth: 1, borderColor: '#D7ECF2', color: '#123B64', fontSize: 15, textAlignVertical: 'top' }}
          />
          {media ? <PickedMediaPreview media={media} onRemove={() => setMedia(null)} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <Pressable
              onPress={pickMedia}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'Add photo or video', th: 'เพิ่มรูปหรือวิดีโอ', zh: '添加照片或视频' })}
              style={{ minHeight: 46, paddingHorizontal: 15, borderRadius: 23, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E4F7F8' }}
            >
              <Camera size={19} color="#007E87" />
              <Body size={13} colour="#007E87">{t({ en: 'Photo / Video', th: 'รูป / วิดีโอ', zh: '照片 / 视频' })}</Body>
            </Pressable>
            <Button
              label={posting ? t({ en: 'Posting…', th: 'กำลังโพสต์…', zh: '发布中…' }) : t({ en: 'Post', th: 'โพสต์', zh: '发布' })}
              onPress={publish}
              disabled={posting}
              height={46}
              style={{ flex: 1 }}
            />
          </View>
        </View>

        {feed.error ? <ErrorState message={feed.error} onRetry={feed.reload} /> : null}
        {feed.loading && !feed.data ? <LoadingState /> : null}
        {feed.data?.posts.length === 0 ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}>
            <MessageCircle size={36} color="#7AA7B2" />
            <Heading size={18} style={{ marginTop: 12 }}>{t({ en: 'Start the conversation', th: 'เริ่มต้นบทสนทนา', zh: '开启第一条动态' })}</Heading>
            <Body size={13} colour={color.neutral600} style={{ marginTop: 5, textAlign: 'center' }}>{t({ en: 'The first post can be yours.', th: 'โพสต์แรกอาจเป็นของคุณ', zh: '第一条帖子可以由你发布。' })}</Body>
          </View>
        ) : null}
        {feed.data?.posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onLike={() => mutate(() => api.toggleCommunityLike(post.id))}
            onComment={(body) => mutate(() => api.addCommunityComment(post.id, body))}
            onShare={async () => {
              try {
                const shared = await Share.share({ message: `${post.author.displayName}: ${post.body || t({ en: 'Shared a moment on ChivarGo', th: 'แชร์ช่วงเวลาบน ChivarGo', zh: '在 ChivarGo 分享了一个瞬间' })}` });
                if (shared.action === Share.dismissedAction) return;
                await mutate(() => api.recordCommunityShare(post.id));
              } catch {
                onToast(t({ en: 'Sharing is not available on this device.', th: 'อุปกรณ์นี้ยังไม่รองรับการแชร์', zh: '此设备暂不支持分享。' }));
              }
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function PickedMediaPreview({ media, onRemove }: { media: PickedMedia; onRemove: () => void }) {
  const video = media.type.startsWith('video/');
  return (
    <View style={{ marginTop: 12, borderRadius: 16, overflow: 'hidden', minHeight: 130, backgroundColor: '#D7ECF2', alignItems: 'center', justifyContent: 'center' }}>
      {video ? <><Play size={34} color="#007E87" /><Body size={13} colour="#123B64" style={{ marginTop: 6 }}>{media.name}</Body></> : <Image source={{ uri: media.uri }} resizeMode="cover" style={{ width: '100%', height: 190 }} />}
      <Pressable onPress={onRemove} accessibilityLabel={t({ en: 'Remove attachment', th: 'ลบไฟล์แนบ', zh: '移除附件' })} style={{ position: 'absolute', top: 8, right: 8, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center' }}>
        <X size={18} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

function PostCard({
  post, onLike, onComment, onShare,
}: { post: CommunityPost; onLike: () => Promise<void>; onComment: (body: string) => Promise<void>; onShare: () => Promise<void> }) {
  const [commenting, setCommenting] = React.useState(false);
  const [comment, setComment] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const submitComment = async () => {
    if (!comment.trim() || busy) return;
    setBusy(true);
    await onComment(comment);
    setBusy(false);
    setComment('');
    setCommenting(false);
  };
  return (
    <View style={[shadow.card, { backgroundColor: '#FFFFFF', borderRadius: 22, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#D7ECF2' }]}>
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
          <Avatar name={post.author.displayName} uri={post.author.profilePhotoUrl} />
          <View style={{ flex: 1 }}>
            <Heading size={16}>{post.author.displayName}</Heading>
            <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center', marginTop: 2 }}>
              <Label size={9} tracking={0.08} colour={post.author.accountType === 'operator' ? '#A25C00' : '#007E87'}>
                {post.author.accountType === 'operator' ? t({ en: 'BUSINESS OPERATOR', th: 'ผู้ประกอบการ', zh: '商家' }) : t({ en: 'TRAVELLER', th: 'นักท่องเที่ยว', zh: '旅行者' })}
              </Label>
              <Body size={13} colour={color.neutral500}>{formatDateTime(post.createdAt)}</Body>
            </View>
          </View>
        </View>
        {post.body ? <Body size={14} colour="#183A53" style={{ marginTop: 13, lineHeight: 23 }}>{post.body}</Body> : null}
      </View>
      {post.media ? <PostMedia post={post} /> : null}
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#E7F1F4', paddingHorizontal: 8, paddingVertical: 6 }}>
        <Action label={formatInteger(post.likeCount)} a11y={t({ en: 'Like post', th: 'ถูกใจโพสต์', zh: '点赞帖子' })} active={post.likedByMe} onPress={onLike} Icon={Heart} />
        <Action label={formatInteger(post.commentCount)} a11y={t({ en: 'Comment on post', th: 'แสดงความคิดเห็น', zh: '评论帖子' })} onPress={() => setCommenting((value) => !value)} Icon={MessageCircle} />
        <Action label={formatInteger(post.shareCount)} a11y={t({ en: 'Share post', th: 'แชร์โพสต์', zh: '分享帖子' })} onPress={onShare} Icon={ExternalLink} />
      </View>
      {post.comments.length > 0 || commenting ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 14, borderTopWidth: 1, borderTopColor: '#EFF5F7' }}>
          {post.comments.map((item) => (
            <View key={item.id} style={{ flexDirection: 'row', gap: 9, marginTop: 12 }}>
              <Avatar name={item.author.displayName} uri={item.author.profilePhotoUrl} small />
              <View style={{ flex: 1, backgroundColor: '#F2F8FA', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 }}>
                <Label size={10} colour="#123B64">{item.author.displayName}</Label>
                <Body size={13} colour="#294B61" style={{ marginTop: 2 }}>{item.body}</Body>
              </View>
            </View>
          ))}
          {commenting ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'flex-end' }}>
              <TextInput accessibilityLabel={t({ en: 'Write a comment', th: 'เขียนความคิดเห็น', zh: '撰写评论' })} value={comment} onChangeText={setComment} maxLength={500} multiline placeholder={t({ en: 'Write a comment…', th: 'เขียนความคิดเห็น…', zh: '写评论…' })} placeholderTextColor="#78909C" style={{ flex: 1, minHeight: 44, maxHeight: 110, borderRadius: 18, backgroundColor: '#F2F8FA', borderWidth: 1, borderColor: '#D7ECF2', paddingHorizontal: 13, paddingVertical: 10, color: '#123B64' }} />
              <Pressable onPress={submitComment} disabled={busy || !comment.trim()} accessibilityLabel={t({ en: 'Send comment', th: 'ส่งความคิดเห็น', zh: '发送评论' })} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: comment.trim() ? '#00A6A6' : '#C9DDE2', alignItems: 'center', justifyContent: 'center' }}><Send size={18} color="#FFFFFF" /></Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Avatar({ name, uri, small = false }: { name: string; uri: string | null; small?: boolean }) {
  const size = small ? 34 : 44;
  const source = useAuthedImage(uri);
  if (source) return <Image source={source} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#D7ECF2' }} />;
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#C9F0F1', alignItems: 'center', justifyContent: 'center' }}><Heading size={small ? 13 : 16} colour="#007E87">{name.trim().charAt(0).toUpperCase() || 'C'}</Heading></View>;
}

function PostMedia({ post }: { post: CommunityPost }) {
  const media = post.media!;
  const uri = mediaUri(media.url);
  if (media.kind === 'video' && Platform.OS === 'web') {
    return React.createElement('video', { src: uri, controls: true, playsInline: true, preload: 'metadata', style: { width: '100%', maxHeight: 520, background: '#061B25' } });
  }
  if (media.kind === 'video') {
    return <Pressable accessibilityRole="button" accessibilityLabel={t({ en: 'Play video', th: 'เล่นวิดีโอ', zh: '播放视频' })} onPress={() => { void Linking.openURL(uri); }} style={{ height: 230, backgroundColor: '#092A38', alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' }}><Play size={28} color="#007E87" fill="#007E87" /></View><Body size={13} colour="#FFFFFF" style={{ marginTop: 10 }}>{t({ en: 'Tap to play video', th: 'แตะเพื่อเล่นวิดีโอ', zh: '点击播放视频' })}</Body></Pressable>;
  }
  return <Image source={{ uri }} resizeMode="cover" style={{ width: '100%', aspectRatio: 4 / 3, maxHeight: 540, backgroundColor: '#D7ECF2' }} />;
}

function Action({ label, a11y, active = false, onPress, Icon }: { label: string; a11y: string; active?: boolean; onPress: () => void | Promise<void>; Icon: typeof Heart }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ selected: active }} style={{ flex: 1, minHeight: 44, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: active ? '#FFF0F1' : 'transparent' }}><Icon size={19} color={active ? '#E44D61' : '#527282'} fill={active ? '#E44D61' : 'transparent'} /><Body size={13} colour={active ? '#C8344B' : '#527282'}>{label}</Body></Pressable>;
}
