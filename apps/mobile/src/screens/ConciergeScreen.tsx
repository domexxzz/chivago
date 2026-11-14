/**
 * The concierge, on screen.
 *
 * Answers come from `@chivago/core`, which reads the same places the map reads
 * and nothing else. See the header of `concierge.ts` for why this is not a
 * language model; the short version is that the demo has no server, the app is
 * used on a beach with one bar, and a component that can invent a beach would
 * be the only thing in the product allowed to.
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
import { Image, Linking, Pressable, ScrollView, TextInput, View } from 'react-native';
import { CalendarDays, ChevronLeft, Clock3, CloudSun, Compass, Leaf, MapPin, Mic, Navigation, Phone, Plus, Send, ShieldCheck, Sparkles, Trees, Utensils, Waves } from 'lucide-react-native';
import { OPENERS, answer, isHighScore, strings, type Bilingual, type Reply } from '@chivago/core';
import type { ScoredPlace } from '@chivago/core';
import { api } from '../api/client.ts';
import { areaOfPlace } from '@chivago/core';
import { useArea } from '../state/area.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, onFill, radius, shadow } from '../theme/index.ts';
import { tintFor } from '@chivago/tokens';
import { Body, Heading, Label } from '../components/Type.tsx';
import { OceanBackdrop } from '../components/Shell.tsx';
import { ErrorState, SkeletonList } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';
import { ChivarBot, type BotMood } from '../components/ChivarBot.tsx';
import { ChivarBotScene } from '../components/ChivarBotScene.tsx';
import aiGuideSamuiCard from '../../assets/ai-guide-samui-card-v1.png';

/** The face Chivar Bot wears for a given answer. */
function moodFor(intent: string): BotMood {
  switch (intent) {
    case 'emergency': return 'surprised';
    case 'recommend': return 'happy';
    case 'plan': return 'cheer';
    case 'route': return 'cool';
    case 'price':
    case 'currency': return 'smile';
    case 'unknown': return 'thinking';
    default: return 'smile';
  }
}

interface Turn {
  /** Null for the concierge's own opening line. */
  asked: string | null;
  reply: Reply;
}

export function ConciergeScreen({
  onBack, onOpenMap, onOpenPlace, onAction,
}: {
  onBack?: () => void;
  onOpenMap: () => void;
  onOpenPlace: (placeId: string) => void;
  onAction: (action: NonNullable<Reply['action']>) => void;
}) {
  const places = useAsync(() => api.places(), []);
  const area = useArea();
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [draft, setDraft] = React.useState('');
  const scroller = React.useRef<ScrollView>(null);

  const ask = React.useCallback((text: string) => {
    const question = text.trim();
    if (question.length === 0) return;
    // The concierge speaks about the area on screen, not about a beach 400 km from the campus.
    const ctx = { places: (places.data ?? []).filter((p) => areaOfPlace(p) === area.key) as ScoredPlace[], quests: [] };
    setTurns((prev) => [...prev, { asked: question, reply: answer(question, ctx) }]);
    setDraft('');
    // A reply that lands below the fold reads as no reply at all.
    requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true }));
  }, [places.data, area.key]);

  // The bot in the header mirrors the last thing it said - surprised at an
  // emergency, pleased at a recommendation, thinking when it did not follow.
  const headerMood: BotMood = turns.length === 0
    ? 'happy'
    : moodFor(turns[turns.length - 1]!.reply.intent);

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
          <View style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
            <ChivarBot size={52} mood={headerMood} waving={turns.length === 0} />
          </View>
          <View style={{ flex: 1 }}>
            <Heading size={18} colour="#FFFFFF">Chivar Bot</Heading>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#83E48E' }} />
              <Body size={13} colour="#D5F6FF">{t({ en: 'Mockup · ready to explore', th: 'Mockup · พร้อมช่วยวางแผน', zh: 'Mockup · 随时为你规划' })}</Body>
            </View>
          </View>
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
        {turns.length === 0 ? <Openers areaName={t(area.name)} onPick={ask} /> : null}

        {turns.map((turn, i) => (
          <View key={`${i}-${turn.asked ?? ''}`}>
            {turn.asked ? <Asked text={turn.asked} /> : null}
            <Answered reply={turn.reply} onOpenPlace={onOpenPlace} onAction={onAction} />
          </View>
        ))}
        {turns.length > 0 ? <MockPlanCard onOpen={onOpenMap} /> : null}
      </ScrollView>

      <Composer value={draft} onChange={setDraft} onSend={() => ask(draft)} />
    </View>
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
        <ChivarBotScene
          width={118}
          height={138}
          mood="happy"
          waving
          label={t({ en: 'Chivar Bot robot - drag to turn him round', th: 'หุ่นยนต์ผู้ช่วย Chivar Bot - ลากเพื่อหมุนดูรอบตัว', zh: 'Chivar Bot 机器人 - 拖动可转身' })}
        />
        <View style={[shadow.card, { flex: 1, minHeight: 104, justifyContent: 'center', padding: 15, borderRadius: 22, borderTopLeftRadius: 7, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCEFF0' }]}>
          <Heading size={16}>{t({ en: 'Hello! Welcome to ChivarGo', th: 'สวัสดี! ยินดีต้อนรับสู่ ChivarGo', zh: '你好！欢迎来到 ChivarGo' })}</Heading>
          <Body size={13} colour={color.neutral600} style={{ marginTop: 6 }}>{t({ en: 'Your travel AI assistant, ready to plan and find the right places for you.', th: 'ผู้ช่วย AI ด้านการท่องเที่ยว ที่พร้อมแนะนำ วางแผนทริป และหาที่เที่ยวให้คุณ', zh: '你的旅行 AI 助手，随时为你规划行程并寻找合适的目的地。' })}</Body>
        </View>
      </View>

      <View style={[shadow.card, { marginTop: 16, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: '#9FE1DC', backgroundColor: '#E9FBF9' }]}>
        <Image source={aiGuideSamuiCard} resizeMode="cover" accessibilityIgnoresInvertColors style={{ position: 'absolute', right: 0, top: 0, width: '100%', height: '100%' }} />
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(229,252,249,0.28)' }} />
        <View style={{ padding: 16, backgroundColor: 'rgba(235,253,251,0.34)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: '#D4F7F2', alignItems: 'center', justifyContent: 'center' }}><Navigation size={21} color={color.brand} /></View>
            <Heading size={20}>{t({ en: 'What kind of trip today?', th: 'วันนี้อยากเที่ยวแบบไหน?', zh: '今天想怎样旅行？' })}</Heading>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <ContextPill icon={CloudSun} text={t({ en: 'Local conditions', th: 'สภาพอากาศพื้นที่', zh: '当地天气' })} />
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

function MockPlanCard({ onOpen }: { onOpen: () => void }) {
  return (
    <View style={[shadow.card, { marginHorizontal: gutter, marginTop: 12, padding: 12, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CFE9EC' }]}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ width: 92, height: 92, borderRadius: 16, overflow: 'hidden', backgroundColor: '#42C8CF' }}>
          <OceanBackdrop compact />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><MapPin size={28} color="#FFFFFF" /></View>
        </View>
        <View style={{ flex: 1 }}>
          <Label size={9} tracking={0.12} colour={color.brand}>{t({ en: 'MOCK ITINERARY', th: 'แผนตัวอย่าง', zh: '示例行程' })}</Label>
          <Heading size={16} style={{ marginTop: 4 }}>{t({ en: 'Koh Samui half-day', th: 'ทริปสมุยครึ่งวัน', zh: '苏梅岛半日游' })}</Heading>
          <Body size={13} colour={color.neutral600} style={{ marginTop: 5 }}>{t({ en: 'About 4 hours · 3 nearby stops', th: 'ประมาณ 4 ชั่วโมง · 3 จุดใกล้กัน', zh: '约 4 小时 · 3 个邻近地点' })}</Body>
          <Body size={13} colour="#347A54" style={{ marginTop: 5 }}>{t({ en: 'Safe route · lower travel distance', th: 'เส้นทางปลอดภัย · ลดระยะเดินทาง', zh: '安全路线 · 减少路程' })}</Body>
        </View>
      </View>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={t({ en: 'View mock itinerary on map', th: 'ดูแผนตัวอย่างบนแผนที่', zh: '在地图上查看示例行程' })} style={{ marginTop: 12, minHeight: 46, borderRadius: 23, backgroundColor: '#009FA3', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <MapPin size={17} color="#FFFFFF" />
        <Heading size={14} colour="#FFFFFF">{t({ en: 'View on map', th: 'ดูบนแผนที่', zh: '在地图上查看' })}</Heading>
      </Pressable>
    </View>
  );
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

function Answered({
  reply, onOpenPlace, onAction,
}: {
  reply: Reply;
  onOpenPlace: (placeId: string) => void;
  onAction: (action: NonNullable<Reply['action']>) => void;
}) {
  const urgent = reply.intent === 'emergency';
  return (
    <View style={{ paddingHorizontal: gutter, marginTop: 12 }}>
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

      {/* Each suggestion carries the measurement it was chosen on. */}
      {reply.suggestions.map((s) => (
        <Pressable
          key={s.placeId}
          onPress={() => onOpenPlace(s.placeId)}
          accessibilityRole="button"
          accessibilityLabel={`${t(s.name)}. ${t(s.because)}. ${t(strings.place.healthyScore)} ${s.healthyScore}`}
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
          </View>
          {/*
            Green only when the score has earned it. Painting every score green
            made the colour mean "this is a score" rather than "this one is
            good", which is the same as not colouring it at all.
          */}
          <Heading size={20} colour={isHighScore(s.healthyScore) ? color.accent700 : color.text}>
            {s.healthyScore}
          </Heading>
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
    </View>
  );
}

const ACTION_LABEL: Record<NonNullable<Reply['action']>, Bilingual> = {
  plan: strings.trip.planCta,
  route: { en: 'Open the router', th: 'เปิดตัวจัดเส้นทาง', zh: '打开路线规划' },
  price: { en: 'See the price band', th: 'ดูช่วงราคา', zh: '查看价格区间' },
  wallet: { en: 'Open my wallet', th: 'เปิดกระเป๋าแต้ม', zh: '打开我的钱包' },
  safety: { en: 'Open Safety', th: 'เปิดความปลอดภัย', zh: '打开安全页' },
};

function Composer({
  value, onChange, onSend,
}: { value: string; onChange: (v: string) => void; onSend: () => void }) {
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
        onSubmitEditing={onSend}
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
        disabled={value.trim().length === 0}
        accessibilityRole="button"
        accessibilityLabel={t({ en: 'Send', th: 'ส่ง', zh: '发送' })}
        style={{
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 22,
          backgroundColor: value.trim().length === 0 ? color.neutral300 : color.brand,
        }}
      >
        <Send
          size={17}
          color={value.trim().length === 0 ? color.neutral600 : onFill.brand}
          strokeWidth={2}
        />
      </Pressable>
    </View>
  );
}
