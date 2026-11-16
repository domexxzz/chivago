/**
 * The concierge, on screen.
 *
 * Every answer comes from the authenticated server pipeline. Network failure
 * is shown as a failure with Retry; the client never manufactures a substitute
 * answer or place list.
 *
 * Two things this screen does that a chat usually does not:
 *
 * It OPENS with real questions. An empty box makes the user guess what the
 * thing is for, and they guess something it cannot do, and then they stop.
 *
 * It renders answers as CONTROLS, not prose. A recommendation is a card you
 * can open; an emergency is a number you can press. A chat that describes what
 * you could do next, in a paragraph, has made you read a menu instead of
 * handing you one.
 */

import React from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { CalendarDays, ChevronLeft, Clock3, CloudSun, Compass, Leaf, MapPin, Mic, Navigation, Phone, Plus, RotateCw, Send, ShieldCheck, Sparkles, Star, Trash2, Trees, Utensils, Waves } from 'lucide-react-native';
import { OPENERS, detectLang, isHighScore, strings, type AreaWeather, type Bilingual, type ConciergeEvidence, type PlaceRecommendationSet, type Reply, type TripRecommendation } from '@chivago/core';
import type { ScoredPlace } from '@chivago/core';
import { api } from '../api/client.ts';
import { useArea } from '../state/area.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, onFill, radius, shadow } from '../theme/index.ts';
import { tintFor } from '@chivago/tokens';
import { Body, Heading, Label } from '../components/Type.tsx';
import { OceanBackdrop } from '../components/Shell.tsx';
import { ErrorState, SkeletonList } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';
import { useHere } from '../state/here.ts';
import { photoUri } from '../api/photos.ts';
import aiGuideRobot from '../../assets/chivargo-ai-robot-v1.png';

interface Turn {
  id: number;
  /** Null for the concierge's own opening line. */
  asked: string | null;
  /** Null only while the server is classifying the question. */
  reply: Reply | null;
  source: 'groq' | 'rules' | null;
  quickReplies: string[];
  weather: AreaWeather | null;
  evidence: ConciergeEvidence[];
  aiNotice: string | null;
  retryable: boolean;
  recommendations: PlaceRecommendationSet | null;
  tripRecommendation: TripRecommendation | null;
  error: string | null;
}

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

/** Restore the transcript without inventing cards that were not persisted. */
function turnsFromHistory(messages: HistoryMessage[]): Turn[] {
  const turns: Turn[] = [];
  let asked: string | null = null;
  for (const message of messages) {
    if (message.role === 'user') {
      asked = message.content;
      continue;
    }
    turns.push({
      id: turns.length + 1,
      asked,
      reply: {
        intent: 'unknown', lang: detectLang(message.content), text: message.content,
        suggestions: [], dial: [], action: null,
      },
      source: null,
      quickReplies: [],
      weather: null,
      evidence: [],
      aiNotice: null,
      retryable: false,
      recommendations: null,
      tripRecommendation: null,
      error: null,
    });
    asked = null;
  }
  return turns;
}

export function ConciergeScreen({
  onBack, onOpenMap, onOpenPlace, onShowOnMap, onShowRecommendationsOnMap, onNavigatePlace, onAction,
}: {
  onBack?: () => void;
  onOpenMap: () => void;
  onOpenPlace: (placeId: string) => void;
  onShowOnMap?: (place: ScoredPlace) => void;
  onShowRecommendationsOnMap?: (places: ScoredPlace[]) => void;
  onNavigatePlace?: (place: ScoredPlace) => void;
  onAction: (action: NonNullable<Reply['action']>) => void;
}) {
  const places = useAsync(() => api.places(), []);
  const area = useArea();
  const here = useHere();
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [draft, setDraft] = React.useState('');
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [clearModalVisible, setClearModalVisible] = React.useState(false);
  const [clearing, setClearing] = React.useState(false);
  const [clearError, setClearError] = React.useState<string | null>(null);
  const scroller = React.useRef<ScrollView>(null);
  const turnSequence = React.useRef(0);

  React.useEffect(() => {
    let active = true;
    setHistoryLoading(true);
    setTurns([]);
    setConversationId(null);
    turnSequence.current = 0;
    void api.conciergeHistory(area.key).then((result) => {
      if (!active) return;
      if (result.ok) {
        const restored = turnsFromHistory(result.data.messages);
        turnSequence.current = restored.length;
        setConversationId(result.data.conversationId);
        setTurns(restored);
        requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: false }));
      }
      setHistoryLoading(false);
    });
    return () => { active = false; };
  }, [area.key]);

  const ask = React.useCallback((text: string) => {
    const question = text.trim();
    if (question.length === 0) return;
    const id = ++turnSequence.current;
    setTurns((prev) => [...prev, {
      id, asked: question, reply: null, source: null, quickReplies: [], weather: null,
      evidence: [], aiNotice: null, retryable: false, recommendations: null, tripRecommendation: null, error: null,
    }]);
    setDraft('');
    requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true }));

    void api.conciergeChat(question, area.key, { conversationId, location: here }).then((result) => {
      if (result.ok) setConversationId(result.data.conversationId);
      setTurns((prev) => prev.map((turn) => turn.id === id
        ? {
            ...turn,
            reply: result.ok ? result.data.reply : null,
            source: result.ok ? result.data.source : null,
            quickReplies: result.ok ? result.data.quickReplies : [],
            weather: result.ok ? result.data.weather : null,
            evidence: result.ok ? result.data.evidence : [],
            aiNotice: result.ok ? result.data.aiNotice : null,
            retryable: result.ok ? result.data.retryable : true,
            recommendations: result.ok ? result.data.recommendations : null,
            tripRecommendation: result.ok ? result.data.tripRecommendation ?? null : null,
            error: result.ok ? null : t({
              en: 'Chivar Bot could not reach the server. No answer was generated. Check your connection and try again.',
              th: 'Chivar Bot ติดต่อเซิร์ฟเวอร์ไม่ได้ จึงไม่มีการสร้างคำตอบ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
              zh: 'Chivar Bot 无法连接服务器，因此没有生成回答。请检查网络后重试。',
            }),
          }
        : turn));
      // A reply that lands below the fold reads as no reply at all.
      requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true }));
    });
  }, [area.key, conversationId, here]);

  const waiting = turns.some((turn) => turn.reply === null && turn.error === null);
  const placeAction = React.useCallback((placeId: string, action: 'map' | 'navigate') => {
    const place = (places.data ?? []).find((item) => item.id === placeId) as ScoredPlace | undefined;
    if (!place) { onOpenMap(); return; }
    if (action === 'map') (onShowOnMap ?? (() => onOpenMap()))(place);
    else (onNavigatePlace ?? onShowOnMap ?? (() => onOpenMap()))(place);
  }, [places.data, onNavigatePlace, onOpenMap, onShowOnMap]);
  const showRecommendationSet = React.useCallback((placeIds: string[]) => {
    const wanted = new Set(placeIds);
    const found = (places.data ?? []).filter((place) => wanted.has(place.id)) as ScoredPlace[];
    if (found.length === 0) { onOpenMap(); return; }
    if (onShowRecommendationsOnMap) onShowRecommendationsOnMap(found);
    else if (onShowOnMap) onShowOnMap(found[0]!);
    else onOpenMap();
  }, [onOpenMap, onShowOnMap, onShowRecommendationsOnMap, places.data]);

  const clearChat = React.useCallback(() => {
    if (clearing) return;
    setClearing(true);
    setClearError(null);
    void api.clearConciergeHistory(area.key).then((result) => {
      if (result.ok) {
        setTurns([]);
        setConversationId(null);
        setDraft('');
        turnSequence.current = 0;
        setClearModalVisible(false);
      } else {
        setClearError(t({
          en: 'The chat could not be cleared. Please try again.',
          th: 'ยังล้างแชทไม่ได้ กรุณาลองอีกครั้ง',
          zh: '无法清除聊天记录，请重试。',
        }));
      }
      setClearing(false);
    });
  }, [area.key, clearing]);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <View
        style={{
          paddingHorizontal: 14,
          paddingTop: 12,
          paddingBottom: 14,
          backgroundColor: '#075D75',
          overflow: 'hidden',
        }}
      >
        <OceanBackdrop compact />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {onBack ? (
            <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t({ en: 'Back', th: 'ย้อนกลับ', zh: '返回' })} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' }}>
              <ChevronLeft size={23} color="#FFFFFF" strokeWidth={2.2} />
            </Pressable>
          ) : null}
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#77E3DB', alignItems: 'center', justifyContent: 'center' }}>
            <Compass size={25} color="#008C91" strokeWidth={2} />
            <Sparkles size={11} color="#F2A93B" fill="#F2A93B" style={{ position: 'absolute', right: 2, top: 2 }} />
          </View>
          <View style={{ flex: 1 }}>
            <Heading size={18} colour="#FFFFFF">Chivar Bot</Heading>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#83E48E' }} />
              <Body size={13} colour="#D5F6FF">{t({ en: 'Hybrid AI · ready to explore', th: 'Hybrid AI · พร้อมช่วยวางแผน', zh: '混合式 AI · 随时为你规划' })}</Body>
            </View>
          </View>
          {turns.length > 0 ? (
            <Pressable
              onPress={() => { setClearError(null); setClearModalVisible(true); }}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'Clear chat', th: 'ล้างแชท', zh: '清除聊天' })}
              style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' }}
            >
              <Trash2 size={19} color="#FFFFFF" strokeWidth={2.1} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {places.loading ? <SkeletonList rows={4} /> : null}
      {places.error ? <ErrorState message={places.error} onRetry={places.reload} /> : null}

      <ScrollView
        ref={scroller}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {!historyLoading && turns.length === 0 ? <Openers areaName={t(area.name)} onPick={ask} /> : null}

        {turns.map((turn) => (
          <View key={turn.id}>
            {turn.asked ? <Asked text={turn.asked} /> : null}
            {turn.error
              ? <FailedAnswer message={turn.error} onRetry={() => { if (turn.asked) ask(turn.asked); }} />
              : turn.reply
              ? <Answered
                  reply={turn.reply}
                  source={turn.source}
                  quickReplies={turn.quickReplies}
                  weather={turn.weather}
                  evidence={turn.evidence}
                  aiNotice={turn.aiNotice}
                  retryable={turn.retryable}
                  recommendations={turn.recommendations}
                  tripRecommendation={turn.tripRecommendation}
                  onQuickReply={ask}
                  onRetry={() => { if (turn.asked) ask(turn.asked); }}
                  onOpenPlace={onOpenPlace}
                  onShowOnMap={(placeId) => placeAction(placeId, 'map')}
                  onNavigatePlace={(placeId) => placeAction(placeId, 'navigate')}
                  onShowRecommendationsOnMap={showRecommendationSet}
                  onAction={onAction}
                />
              : <Thinking />}
          </View>
        ))}
      </ScrollView>

      <Composer value={draft} onChange={setDraft} onSend={() => ask(draft)} busy={waiting || historyLoading || clearing} />

      <ClearChatModal
        visible={clearModalVisible}
        clearing={clearing}
        error={clearError}
        onCancel={() => { if (!clearing) setClearModalVisible(false); }}
        onConfirm={clearChat}
      />
    </View>
  );
}

function ClearChatModal({
  visible, clearing, error, onCancel, onConfirm,
}: {
  visible: boolean;
  clearing: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(2,43,66,0.62)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={[shadow.card, { width: '100%', maxWidth: 370, padding: 22, borderRadius: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' }]}>
          <View style={{ width: 52, height: 52, borderRadius: 26, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEE2E2' }}>
            <Trash2 size={24} color="#DC2626" strokeWidth={2.2} />
          </View>
          <Heading size={18} style={{ textAlign: 'center', marginTop: 14 }}>
            {t({ en: 'Clear chat history?', th: 'ล้างประวัติแชท?', zh: '清除聊天记录？' })}
          </Heading>
          <Body size={13} colour={color.neutral600} style={{ textAlign: 'center', lineHeight: 20, marginTop: 8 }}>
            {t({
              en: 'All messages and travel context from this area will be permanently deleted. Are you sure you want to continue?',
              th: 'ข้อความและบริบทการเดินทางที่คุยกันในพื้นที่นี้จะหายทั้งหมดและกู้คืนไม่ได้ ยืนยันที่จะลบหรือไม่?',
              zh: '此区域的所有消息和旅行上下文将被永久删除且无法恢复。确定要继续吗？',
            })}
          </Body>
          {error ? <Body size={13} colour="#B91C1C" style={{ textAlign: 'center', marginTop: 9 }}>{error}</Body> : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <Pressable
              onPress={onCancel}
              disabled={clearing}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'Cancel', th: 'ยกเลิก', zh: '取消' })}
              style={{ flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' }}
            >
              <Heading size={13}>{t({ en: 'Cancel', th: 'ยกเลิก', zh: '取消' })}</Heading>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={clearing}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'Confirm clear chat', th: 'ยืนยันล้างแชท', zh: '确认清除聊天' })}
              style={{ flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: clearing ? '#FCA5A5' : '#DC2626' }}
            >
              <Heading size={13} colour="#FFFFFF">
                {clearing ? t({ en: 'Clearing…', th: 'กำลังล้าง…', zh: '正在清除…' }) : t({ en: 'Delete all', th: 'ลบทั้งหมด', zh: '全部删除' })}
              </Heading>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * What to ask, before anything has been asked.
 *
 * Every one of these is covered by a test asserting it does not land on "I
 * don't understand" - an opening chip the app suggested and cannot answer is
 * worse than no chip at all.
 */
function Openers({ areaName, onPick }: { areaName: string; onPick: (text: string) => void }) {
  const hour = new Date().getHours();
  const dayPart = hour < 12
    ? t({ en: 'Morning', th: 'ช่วงเช้า', zh: '上午' })
    : hour < 17
      ? t({ en: 'Afternoon', th: 'ช่วงบ่าย', zh: '下午' })
      : t({ en: 'Evening', th: 'ช่วงเย็น', zh: '晚上' });
  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 16, paddingBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
        <View style={{ width: 94, height: 104, alignItems: 'center', justifyContent: 'center' }}>
          <Image
            source={aiGuideRobot}
            resizeMode="contain"
            accessibilityLabel={t({ en: 'Chivar Bot robot', th: 'หุ่นยนต์ผู้ช่วย Chivar Bot', zh: 'Chivar Bot 机器人' })}
            style={{ width: 108, height: 116 }}
          />
        </View>
        <View style={[shadow.card, { flex: 1, minHeight: 104, justifyContent: 'center', padding: 15, borderRadius: 22, borderTopLeftRadius: 7, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCEFF0' }]}>
          <Heading size={16}>{t({ en: 'Hello! Welcome to ChivarGo', th: 'สวัสดี! ยินดีต้อนรับสู่ ChivarGo', zh: '你好！欢迎来到 ChivarGo' })}</Heading>
          <Body size={13} colour={color.neutral600} style={{ marginTop: 6 }}>{t({ en: 'Your travel AI assistant, ready to plan and find the right places for you.', th: 'ผู้ช่วย AI ด้านการท่องเที่ยว ที่พร้อมแนะนำ วางแผนทริป และหาที่เที่ยวให้คุณ', zh: '你的旅行 AI 助手，随时为你规划行程并寻找合适的目的地。' })}</Body>
        </View>
      </View>

      <View style={[shadow.card, { marginTop: 16, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: '#9FE1DC', backgroundColor: '#E9FBF9' }]}>
        <View style={{ padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: '#D4F7F2', alignItems: 'center', justifyContent: 'center' }}><Navigation size={21} color={color.brand} /></View>
            <Heading size={20}>{t({ en: 'What kind of trip today?', th: 'วันนี้อยากเที่ยวแบบไหน?', zh: '今天想怎样旅行？' })}</Heading>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <ContextPill icon={Clock3} text={dayPart} />
            <ContextPill icon={MapPin} text={areaName} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <PrimarySuggestion icon={CalendarDays} label={t({ en: 'Plan a half-day', th: 'จัดทริปครึ่งวัน', zh: '规划半日游' })} onPress={() => onPick(t(OPENERS[4]!))} filled />
            <PrimarySuggestion icon={MapPin} label={t({ en: 'Places near me', th: 'ที่เที่ยวใกล้ฉัน', zh: '附近景点' })} onPress={() => onPick(t(OPENERS[0]!))} />
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18 }}><Sparkles size={14} color={color.brand} /><Label size={9} tracking={0.08} colour={color.neutral600}>{t({ en: 'POPULAR IDEAS · TRY ASKING', th: 'ไอเดียยอดนิยม · ลองถามว่า', zh: '热门灵感 · 试着问问' })}</Label></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {OPENERS.filter((_, index) => index !== 4).map((o, index) => {
          const Icon = [Trees, Leaf, Waves, Utensils, Leaf][index] ?? Compass;
          return (
          <Pressable
            key={t(o)}
            onPress={() => onPick(t(o))}
            accessibilityRole="button"
            accessibilityLabel={`${t(o)}`}
            // Each opener on its own flat tint, keyed by its English text so
            // it keeps its colour whichever language is showing.
            style={{
              minHeight: 46,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              justifyContent: 'center',
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: radius.lg,
              backgroundColor: tintFor(o.en).fill,
            }}
          >
            <Icon size={16} color={tintFor(o.en).ink} />
            <Body size={13} colour={tintFor(o.en).ink}>{t(o)}</Body>
          </Pressable>
          );
        })}
      </View>
      <View style={{ alignItems: 'center', paddingTop: 28, paddingBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><ShieldCheck size={16} color={color.neutral600} /><Body size={13} colour={color.neutral600}>{t({ en: 'Your trip information is used safely', th: 'ข้อมูลการเดินทางของคุณถูกใช้อย่างปลอดภัย', zh: '你的旅行信息将被安全使用' })}</Body></View>
        <Body size={13} colour={color.brand} style={{ marginTop: 4 }}>{t({ en: 'Suggestions come from verified app data', th: 'คำแนะนำมาจากข้อมูลจริงภายในแอป', zh: '建议来自应用内已验证数据' })}</Body>
      </View>
    </View>
  );
}

function ContextPill({ icon: Icon, text }: { icon: typeof MapPin; text: string }) {
  return <View style={{ minHeight: 36, paddingHorizontal: 10, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.88)', borderWidth: 1, borderColor: '#C6ECE8' }}><Icon size={16} color={color.brand} /><Body size={13}>{text}</Body></View>;
}

function PrimarySuggestion({ icon: Icon, label, onPress, filled = false }: { icon: typeof MapPin; label: string; onPress: () => void; filled?: boolean }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ flex: 1, minHeight: 50, borderRadius: 25, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: filled ? (pressed ? '#007F83' : '#009FA3') : (pressed ? '#E8F8F7' : '#FFFFFF'), borderWidth: 1, borderColor: '#85DAD5' })}><Icon size={18} color={filled ? '#FFFFFF' : color.brand} /><Heading size={13} colour={filled ? '#FFFFFF' : color.text}>{label}</Heading></Pressable>;
}

function Asked({ text }: { text: string }) {
  return (
    <View style={{ paddingHorizontal: gutter, marginTop: 18, alignItems: 'flex-end' }}>
      <View
        style={{
          maxWidth: '84%',
          paddingVertical: 10,
          paddingHorizontal: 14,
          // The traveller's own message. A chat bubble is the conversation,
          // not a verified fact about the island.
          backgroundColor: color.brand,
          borderRadius: radius.md,
        }}
      >
        <Body size={14} colour={onFill.brand}>{text}</Body>
      </View>
    </View>
  );
}

function Thinking() {
  return (
    <View style={{ paddingHorizontal: gutter, marginTop: 12 }}>
      <View style={[shadow.card, { maxWidth: '92%', paddingVertical: 12, paddingHorizontal: 14, backgroundColor: color.surface, borderRadius: radius.md, borderWidth: 1, borderColor: '#DCEFF5' }]}>
        <Body size={14} colour={color.neutral600}>{t({ en: 'Chivar Bot is checking ChivaGo data…', th: 'Chivar Bot กำลังตรวจข้อมูล ChivaGo…', zh: 'Chivar Bot 正在查询 ChivaGo 数据…' })}</Body>
      </View>
    </View>
  );
}

function FailedAnswer({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ paddingHorizontal: gutter, marginTop: 12 }}>
      <View style={[shadow.card, { maxWidth: '92%', padding: 14, backgroundColor: '#FFF7E6', borderRadius: radius.md, borderWidth: 1, borderColor: '#F3D59B' }]}>
        <Body size={14} colour="#765A22">{message}</Body>
        <Pressable onPress={onRetry} accessibilityRole="button" style={{ marginTop: 8, minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <RotateCw size={15} color={color.brand} />
          <Heading size={13} colour={color.brand}>{t({ en: 'Retry', th: 'ลองใหม่', zh: '重试' })}</Heading>
        </Pressable>
      </View>
    </View>
  );
}

function Answered({
  reply, source, quickReplies, weather, evidence, aiNotice, retryable,
  recommendations, tripRecommendation, onQuickReply, onRetry, onOpenPlace, onShowOnMap, onNavigatePlace, onShowRecommendationsOnMap, onAction,
}: {
  reply: Reply;
  source: Turn['source'];
  quickReplies: string[];
  weather: AreaWeather | null;
  evidence: ConciergeEvidence[];
  aiNotice: string | null;
  retryable: boolean;
  recommendations: PlaceRecommendationSet | null;
  tripRecommendation: TripRecommendation | null;
  onQuickReply: (text: string) => void;
  onRetry: () => void;
  onOpenPlace: (placeId: string) => void;
  onShowOnMap: (placeId: string) => void;
  onNavigatePlace: (placeId: string) => void;
  onShowRecommendationsOnMap: (placeIds: string[]) => void;
  onAction: (action: NonNullable<Reply['action']>) => void;
}) {
  const urgent = reply.intent === 'emergency';
  return (
    <View style={{ paddingHorizontal: gutter, marginTop: 12 }}>
      {source === 'groq' ? (
        <Label size={9} tracking={0.08} colour={color.brand} style={{ marginBottom: 5 }}>
          {t({ en: 'GROQ AI · CHIVAGO VERIFIED DATA', th: 'GROQ AI · ข้อมูลจริงจาก CHIVAGO', zh: 'GROQ AI · CHIVAGO 已验证数据' })}
        </Label>
      ) : null}
      <View
        style={[shadow.card, {
          maxWidth: '92%',
          paddingVertical: 12,
          paddingHorizontal: 14,
          backgroundColor: color.surface,
          borderRadius: radius.md,
          // An emergency answer does not look like a suggestion.
          borderWidth: urgent ? layout.ruleStrong : 1,
          borderColor: urgent ? color.accent2 : '#DCEFF5',
        }]}
      >
        <Body size={14}>{reply.text}</Body>
      </View>

      {aiNotice ? (
        <View style={{ maxWidth: '92%', marginTop: 7, padding: 10, borderRadius: 12, backgroundColor: '#FFF7E6', borderWidth: 1, borderColor: '#F3D59B' }}>
          <Body size={13} colour="#765A22">{aiNotice}</Body>
          {retryable ? (
            <Pressable onPress={onRetry} accessibilityRole="button" style={{ marginTop: 7, minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <RotateCw size={14} color={color.brand} />
              <Heading size={12} colour={color.brand}>{t({ en: 'Try Groq again', th: 'ลองเรียก Groq อีกครั้ง', zh: '重试 Groq' })}</Heading>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {weather && weather.observedAt ? (
        <View style={[shadow.card, { marginTop: 9, maxWidth: '92%', padding: 12, borderRadius: 16, backgroundColor: '#EAF8FC', borderWidth: 1, borderColor: '#BFE7F0' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <CloudSun size={20} color={color.brand} />
            <Heading size={14}>{t({ en: 'Current conditions', th: 'สภาพอากาศปัจจุบัน', zh: '当前天气' })}</Heading>
          </View>
          <Body size={13} style={{ marginTop: 7 }}>
            {weather.tempC === null ? '—' : `${weather.tempC.toFixed(1)}°C`}
            {weather.rainMm === null ? '' : ` · ${t({ en: 'rain', th: 'ฝน', zh: '降雨' })} ${weather.rainMm.toFixed(1)} mm`}
            {weather.windKn === null ? '' : ` · ${t({ en: 'wind', th: 'ลม', zh: '风' })} ${weather.windKn.toFixed(1)} kn`}
          </Body>
          <Label size={9} tracking={0.02} colour={color.neutral600} style={{ marginTop: 7, textTransform: 'none' }}>
            {weather.source} · {weather.provenance}
          </Label>
        </View>
      ) : null}

      {/* An emergency is a number you press, not a number you read out. */}
      {reply.dial.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {reply.dial.map((n) => (
            <Pressable
              key={n.dial}
              onPress={() => void Linking.openURL(`tel:${n.dial}`)}
              accessibilityRole="button"
              accessibilityLabel={`${t(n.name)}. ${n.printed}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                minHeight: 44,
                paddingHorizontal: 14,
                borderWidth: layout.ruleStrong,
                borderColor: color.accent2,
                borderRadius: radius.sm,
              }}
            >
              <Phone size={15} color={color.accent2} strokeWidth={2} />
              <Heading size={15} colour={color.accent2}>{n.printed}</Heading>
            </Pressable>
          ))}
        </View>
      ) : null}

      {tripRecommendation ? (
        <View style={[shadow.card, { marginTop: 10, padding: 14, borderRadius: 18, backgroundColor: '#EAF9F7', borderWidth: 1, borderColor: '#8FD8D3' }]}>
          <Label size={9} tracking={0.08} colour={color.brand}>{t({ en: 'TRIP RECOMMENDATION', th: 'TRIP RECOMMENDATION', zh: '行程推荐' })}</Label>
          <Heading size={17} style={{ marginTop: 4 }}>{t(tripRecommendation.title)}</Heading>
          <Body size={13} colour={color.neutral600} style={{ marginTop: 3 }}>{t(tripRecommendation.durationLabel)}</Body>
          <View style={{ marginTop: 10, gap: 7 }}>
            {tripRecommendation.stops.map((stop) => (
              <View key={stop.placeId} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: color.brand }}><Label size={10} colour="#FFFFFF">{stop.order}</Label></View>
                <Heading size={14}>{t(stop.name)}</Heading>
              </View>
            ))}
          </View>
          <Body size={13} colour={color.neutral600} style={{ marginTop: 10 }}>{t(tripRecommendation.limitation)}</Body>
          <Pressable onPress={() => onShowRecommendationsOnMap(tripRecommendation.stops.map((stop) => stop.placeId))} accessibilityRole="button" style={{ marginTop: 11, minHeight: 42, borderRadius: 21, backgroundColor: color.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <MapPin size={15} color="#FFFFFF" />
            <Heading size={13} colour="#FFFFFF">{t({ en: 'View all stops on map', th: 'ดูทุกจุดบนแผนที่', zh: '在地图查看全部站点' })}</Heading>
          </Pressable>
        </View>
      ) : null}

      {recommendations ? (
        <View style={{ marginTop: 10, gap: 9 }}>
          <Heading size={16}>{t(recommendations.title)}</Heading>
          {recommendations.items.map((item) => (
            <View key={item.placeId} style={[shadow.card, { overflow: 'hidden', backgroundColor: color.surface, borderWidth: 1, borderColor: '#CDE8EA', borderRadius: 18 }]}>
              {item.image ? <Image source={{ uri: photoUri(item.image.url) }} resizeMode="cover" style={{ width: '100%', height: 128, backgroundColor: color.neutral200 }} /> : null}
              <View style={{ padding: 13 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Label size={9} tracking={0.06} colour={color.brand}>{t(item.category).toUpperCase()}</Label>
                    <Heading size={16} style={{ marginTop: 3 }}>{t(item.name)}</Heading>
                  </View>
                  <View style={{ minWidth: 48, alignItems: 'center', paddingVertical: 5, paddingHorizontal: 8, borderRadius: 12, backgroundColor: '#E7F8F5' }}>
                    <Heading size={16} colour={color.brand}>{item.score}</Heading>
                    <Label size={9} colour={color.neutral600}>{t({ en: 'MATCH', th: 'ตรงใจ', zh: '匹配' })}</Label>
                  </View>
                </View>
                <Body size={13} colour={color.neutral600} style={{ marginTop: 7 }}>{t(item.description)}</Body>
                <Body size={13} colour={color.brand} style={{ marginTop: 7 }}>{t(item.reason)}</Body>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
                  {item.distanceKm !== null ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><MapPin size={13} color={color.brand} /><Body size={13}>{item.distanceKm.toFixed(1)} km</Body></View> : null}
                  {item.rating ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Star size={13} color="#D79A19" fill="#F5C451" /><Body size={13}>{item.rating.average.toFixed(1)} ({item.rating.reviewCount})</Body></View> : null}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 }}>
                  <RecommendationAction label={t({ en: 'Details', th: 'รายละเอียด', zh: '详情' })} onPress={() => onOpenPlace(item.placeId)} />
                  <RecommendationAction label={t({ en: 'Map', th: 'ดูบนแผนที่', zh: '地图' })} onPress={() => onShowOnMap(item.placeId)} />
                  <RecommendationAction label={t({ en: 'Navigate', th: 'นำทาง', zh: '导航' })} onPress={() => onNavigatePlace(item.placeId)} filled />
                </View>
                <Label size={9} tracking={0.01} colour={color.neutral600} style={{ marginTop: 9, textTransform: 'none' }}>
                  {item.source.name} · {item.verificationStatus}
                </Label>
              </View>
            </View>
          ))}
          {recommendations.limitations.map((limitation, index) => (
            <Body key={`${limitation.en}-${index}`} size={13} colour={color.neutral600}>• {t(limitation)}</Body>
          ))}
          {recommendations.items.length > 1 ? (
            <Pressable onPress={() => onShowRecommendationsOnMap(recommendations.items.map((item) => item.placeId))} accessibilityRole="button" style={{ minHeight: 42, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, borderRadius: 21, backgroundColor: color.brand }}>
              <MapPin size={15} color="#FFFFFF" />
              <Heading size={13} colour="#FFFFFF">{t({ en: 'View all on map', th: 'ดูทั้งหมดบนแผนที่', zh: '在地图查看全部' })}</Heading>
            </Pressable>
          ) : null}
          {recommendations.hasMore ? (
            <Pressable onPress={() => onQuickReply(t({ en: 'Show more places', th: 'ดูสถานที่เพิ่ม', zh: '查看更多地点' }))} accessibilityRole="button" style={{ minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, borderWidth: 1, borderColor: '#8FD8D3', backgroundColor: '#EAF9F7' }}>
              <Heading size={13} colour={color.brand}>{t({ en: 'Show more', th: 'ดูเพิ่ม', zh: '查看更多' })}</Heading>
            </Pressable>
          ) : null}
        </View>
      ) : reply.suggestions.map((s) => (
        <Pressable
          key={s.placeId}
          onPress={() => onOpenPlace(s.placeId)}
          accessibilityRole="button"
          accessibilityLabel={`${t(s.name)}. ${t(s.because)}${reply.intent !== 'recommend' && typeof s.healthyScore === 'number' ? `. ${t(strings.place.healthyScore)} ${s.healthyScore}` : ''}`}
          style={[shadow.card, {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            marginTop: 8,
            padding: 12,
            backgroundColor: color.surface,
            borderWidth: 1,
            borderColor: '#DCEFF5',
            borderRadius: radius.md,
          }]}
        >
          {s.photoUrl ? (
            <Image source={{ uri: photoUri(s.photoUrl) }} resizeMode="cover" style={{ width: 70, height: 66, borderRadius: 12, backgroundColor: color.neutral200 }} />
          ) : null}
          <View style={{ flex: 1 }}>
            <Heading size={15}>{t(s.name)}</Heading>
            <Label
              size={9}
              tracking={0.04}
              colour={color.neutral600}
              style={{ marginTop: 6, textTransform: 'none' }}
            >
              {t(s.because)}
            </Label>
            {s.distanceKm !== undefined && s.distanceKm !== null ? (
              <Body size={13} colour={color.brand} style={{ marginTop: 5 }}>{s.distanceKm.toFixed(1)} km</Body>
            ) : null}
          </View>
          {/*
            Green only when the score has earned it. Painting every score green
            made the colour mean "this is a score" rather than "this one is
            good", which is the same as not colouring it at all.
          */}
          {reply.intent !== 'recommend' && typeof s.healthyScore === 'number' ? (
            <Heading size={20} colour={isHighScore(s.healthyScore) ? color.accent700 : color.text}>
              {s.healthyScore}
            </Heading>
          ) : null}
        </Pressable>
      ))}

      {reply.action ? (
        <Pressable
          onPress={() => onAction(reply.action!)}
          accessibilityRole="button"
          accessibilityLabel={t(ACTION_LABEL[reply.action])}
          style={{
            alignSelf: 'flex-start',
            minHeight: 44,
            justifyContent: 'center',
            marginTop: 10,
            paddingHorizontal: 16,
            borderWidth: layout.ruleStrong,
            borderColor: color.ctaDeep,
            borderRadius: radius.sm,
          }}
        >
          <Heading size={14} colour={color.ctaDeep}>{t(ACTION_LABEL[reply.action])}</Heading>
        </Pressable>
      ) : null}

      {evidence.length > 0 ? (
        <View style={{ marginTop: 10, gap: 3 }}>
          {evidence.map((item, index) => (
            <Label key={`${item.kind}-${index}`} size={9} tracking={0.02} colour={color.neutral600} style={{ textTransform: 'none' }}>
              {item.label}: {item.source} · {item.validity}
            </Label>
          ))}
        </View>
      ) : null}

      {quickReplies.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 }}>
          {quickReplies.map((item) => (
            <Pressable key={item} onPress={() => onQuickReply(item)} accessibilityRole="button" style={{ minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 19, backgroundColor: '#E6F7F6', borderWidth: 1, borderColor: '#A9E1DD' }}>
              <Body size={13} colour={color.brand}>{item}</Body>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function RecommendationAction({ label, onPress, filled = false }: { label: string; onPress: () => void; filled?: boolean }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 18, borderWidth: 1, borderColor: color.brand, backgroundColor: filled ? color.brand : '#FFFFFF' }}><Heading size={11} colour={filled ? onFill.brand : color.brand}>{label}</Heading></Pressable>;
}

const ACTION_LABEL: Record<NonNullable<Reply['action']>, Bilingual> = {
  plan: strings.trip.planCta,
  route: { en: 'Open the router', th: 'เปิดตัวจัดเส้นทาง', zh: '打开路线规划' },
  price: { en: 'See the price band', th: 'ดูช่วงราคา', zh: '查看价格区间' },
  wallet: { en: 'Open my wallet', th: 'เปิดกระเป๋าแต้ม', zh: '打开我的钱包' },
  safety: { en: 'Open Safety', th: 'เปิดความปลอดภัย', zh: '打开安全页' },
};

function Composer({
  value, onChange, onSend, busy,
}: { value: string; onChange: (v: string) => void; onSend: () => void; busy: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: gutter,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: '#DCEFF5',
        backgroundColor: '#F7FFFF',
        shadowColor: '#00676B',
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: -4 },
        elevation: 8,
      }}
    >
      <Pressable accessibilityRole="button" accessibilityLabel={t({ en: 'Add context', th: 'เพิ่มข้อมูลประกอบ', zh: '添加信息' })} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CBE7F0', backgroundColor: '#FFFFFF' }}>
        <Plus size={20} color={color.brand} />
      </Pressable>
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={busy ? undefined : onSend}
        editable={!busy}
        maxLength={500}
        returnKeyType="send"
        placeholder={t({ en: 'Ask about your trip…', th: 'ถามเรื่องการเดินทาง…', zh: '询问旅行问题…' })}
        placeholderTextColor={color.neutral500}
        accessibilityLabel={t({ en: 'Ask the concierge', th: 'ถามผู้ช่วยนำเที่ยว', zh: '向礼宾助手提问' })}
        style={{
          flex: 1,
          minHeight: 44,
          paddingLeft: 16,
          paddingRight: 42,
          borderWidth: 1,
          borderColor: '#CBE7F0',
          borderRadius: 22,
          backgroundColor: color.bg,
          color: color.text,
          fontSize: 14,
        }}
      />
      <View pointerEvents="none" style={{ position: 'absolute', right: 72, top: 22 }}>
        <Mic size={17} color={color.neutral600} />
      </View>
      <Pressable
        onPress={onSend}
        disabled={busy || value.trim().length === 0}
        accessibilityRole="button"
        accessibilityLabel={t({ en: 'Send', th: 'ส่ง', zh: '发送' })}
        style={{
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 22,
          backgroundColor: busy || value.trim().length === 0 ? color.neutral300 : color.brand,
        }}
      >
        <Send
          size={17}
          color={busy || value.trim().length === 0 ? color.neutral600 : onFill.brand}
          strokeWidth={2}
        />
      </Pressable>
    </View>
  );
}
