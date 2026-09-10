/**
 * Home.
 *
 * Every travel app opens the same way: a hero photograph, a search bar, and a
 * grid of twelve icons. That Home is aspirational — it shows you a beach you
 * are not on and asks where you would like to go.
 *
 * This one opens with what is TRUE on the island right now, because measured
 * conditions are the only thing this product has that the others do not, and
 * burying them under a stock sunset would be throwing away the argument on the
 * first screen a judge sees.
 *
 * The order is the argument, the same way it is on the sponsor page:
 *
 *   1. What is true here now      measured, and labelled with its provenance
 *   2. Where to go                a row of doors, and the measured places
 *   3. What you can do today      real quests, yours first, honest when empty
 *   4. What you are carrying      the two purses, the passport, the companions
 *
 * THE LOOK (docs/36). A teal header with a search field, a white card lifted
 * over its bottom edge, a row of round doors, cards with photographs that
 * scroll sideways. It is the shape of the reference the product now follows;
 * what is IN the shapes is still the measured island - the search field asks
 * the concierge, the photographs are the licensed ones, the score chip on a
 * photo is the same number the map pin carries.
 *
 * INDEPENDENT FAILURE. Each block loads on its own `useAsync`, so a dead
 * /places does not blank the screen — the conditions block says it is down and
 * everything else still works. A Home that white-screens because one endpoint
 * failed is the worst screen in an app to lose, because it is the one someone
 * opens when they are lost.
 */

import React from 'react';
import { Animated, Easing, Image, Platform, Pressable, ScrollView, View } from 'react-native';
import { areaOfProvince, inArea, type Area, type AreaKey } from '@chivago/core';
import { useReduceMotion } from '../components/reduce-motion.ts';
import { setArea, useArea } from '../state/area.ts';
import { photoUri } from '../api/photos.ts';
import { AreaSwitch } from '../components/AreaSwitch.tsx';
import { BoardFeed } from '../components/BoardFeed.tsx';
import { MonsterFeed } from '../components/MonsterFeed.tsx';
import {
  ChevronRight, Compass, HeartPulse, Leaf, MessageCircle, Search, Shield, Sparkles, Trees, UserRound, Users, Utensils, Wallet,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import {
  greetingFor, isHighScore, nearestFirst, passportProgress, strings, wayThere,
  type Quest, type QuestProgress, type ScoredPlace,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { useHere, type Here } from '../state/here.ts';
import { color, currencyTone, gutter, layout, onFill, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { ErrorState } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';

const HOME_QUEST_LIMIT = 3;

/**
 * The island's condition, as one number.
 *
 * A mean of the measured Healthy Scores. It is a summary and says so — the
 * per-place numbers, which are the ones with a breakdown behind them, are one
 * tap away on the map. `null` when there is nothing to average, never 0: an
 * island with no data is not an island scoring zero.
 */
export function islandAverage(places: ScoredPlace[]): number | null {
  if (places.length === 0) return null;
  return Math.round(places.reduce((sum, p) => sum + p.healthyScore, 0) / places.length);
}

/**
 * The weakest provenance in the set, because a summary is only as fresh as its
 * stalest input. Reporting "Live" for an average that contains a stale reading
 * would be the average laundering the weakest number in it.
 */
export function weakestProvenance(places: ScoredPlace[]): 'live' | 'daily' | 'estimated' | 'stale' {
  const rank = { live: 0, daily: 1, estimated: 2, stale: 3 } as const;
  let worst: keyof typeof rank = 'live';
  for (const p of places) {
    for (const c of p.breakdown.components) {
      if (rank[c.provenance] > rank[worst]) worst = c.provenance;
    }
  }
  return worst;
}

/**
 * Yours first, then the rest in the server's order.
 *
 * This is NOT a recommendation and does not pretend to be one — it is the
 * traveller's own state, which is the only ranking this screen can justify
 * without a basis it does not have. Sorting by reward would be the app
 * recommending whatever it most wants done.
 */
export function questOrder(
  quests: Quest[], progress: Record<string, QuestProgress>,
): Quest[] {
  const started = (q: Quest) => {
    const p = progress[q.id];
    return p != null && p.stage !== 'complete';
  };
  return [...quests].sort((a, b) => Number(started(b)) - Number(started(a)));
}

export function HomeScreen({
  onOpenMap, onOpenQuests, onOpenQuest, onOpenWallet, onOpenPassport,
  onOpenImpact, onOpenConcierge, onOpenSafety, onOpenParty, onOpenProfile, onOpenPlace, now = new Date(),
}: {
  onOpenMap: () => void;
  onOpenQuests: () => void;
  onOpenQuest: (id: string) => void;
  onOpenWallet: () => void;
  onOpenPassport: () => void;
  onOpenImpact: () => void;
  onOpenConcierge: () => void;
  onOpenSafety: () => void;
  onOpenParty: () => void;
  /** The profile: the traveller's own record, from the button at the top right. */
  onOpenProfile: () => void;
  /** A place card. Optional so the screen tests that predate the cards still render. */
  onOpenPlace?: (id: string) => void;
  /** Injected so the greeting is testable rather than whatever the clock says. */
  now?: Date;
}) {
  const places = useAsync(() => api.places(), []);
  const quests = useAsync(() => api.quests('today'), []);
  const wallet = useAsync(() => api.wallet(), []);
  /*
    One area at a time. The API answers with every place and every quest;
    the screen frames the island or the campus, whichever the traveller
    chose - or the QR code did (docs/43).
  */
  const area = useArea();
  const here = React.useMemo(
    () => ({ ...places, data: places.data ? places.data.filter((p) => areaOfProvince(p.province) === area.key) : places.data }),
    [places, area.key],
  );
  const todayHere = React.useMemo(
    () => ({
      ...quests,
      data: quests.data ? { ...quests.data, quests: quests.data.quests.filter((q) => inArea(area, q)) } : quests.data,
    }),
    [quests, area],
  );
  const passport = useAsync(() => api.passport(), []);
  const companions = useAsync(() => api.companions(), []);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <Hero now={now} wallet={wallet} area={area} onChangeArea={setArea} onOpenWallet={onOpenWallet} onOpenConcierge={onOpenConcierge} onOpenProfile={onOpenProfile} />
      <Conditions places={here} onOpenMap={onOpenMap} />
      <Doors
        onOpenMap={onOpenMap}
        onOpenQuests={onOpenQuests}
        onOpenWallet={onOpenWallet}
        onOpenConcierge={onOpenConcierge}
        onOpenImpact={onOpenImpact}
        onOpenSafety={onOpenSafety}
        onOpenParty={onOpenParty}
      />
      <Places places={here} onOpenMap={onOpenMap} onOpenPlace={onOpenPlace ?? onOpenMap} />
      {/*
        The board, under the places and above today's missions: it is what
        other people did, which belongs after what is around you and before
        what you could do next. Keyed by area, because the board of a campus
        and the board of an island are two different rooms.
      */}
      {/*
        What is wrong here, above what other people left. A problem the
        island can act on outranks a clip somebody filmed, and both outrank
        the missions list because both are about THIS place today.
      */}
      <Monsters areaKey={area.key} onOpenPlace={onOpenPlace ?? onOpenMap} />
      <Board areaKey={area.key} onOpenPlace={onOpenPlace ?? onOpenMap} />
      <Today quests={todayHere} onOpenQuest={onOpenQuest} onOpenQuests={onOpenQuests} />
      <Carrying
        wallet={wallet}
        passport={passport}
        companions={companions}
        onOpenWallet={onOpenWallet}
        onOpenPassport={onOpenPassport}
      />
      <View style={{ height: 28 }} />
    </ScrollView>
  );
}

type Async<T> = { data: T | null; loading: boolean; error: string | null; reload: () => void };

// ---------------------------------------------------------------------------
// 0. The header: the island's name, your points, and a place to ask
// ---------------------------------------------------------------------------

function Hero({
  now, wallet, area, onChangeArea, onOpenWallet, onOpenConcierge, onOpenProfile,
}: {
  now: Date;
  wallet: Async<{ balances: { green: number; trip: number } }>;
  area: Area;
  onChangeArea: (next: AreaKey) => void;
  onOpenWallet: () => void;
  onOpenConcierge: () => void;
  onOpenProfile: () => void;
}) {
  const greeting = greetingFor(now);
  const green = wallet.data?.balances.green ?? null;
  return (
    <View
      style={{
        backgroundColor: color.brand,
        paddingHorizontal: gutter,
        paddingTop: 18,
        // Room for the conditions card that overlaps the bottom edge.
        paddingBottom: 46,
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          {/*
            No name. The app collects none, and "Hi, Paul" on a screen that
            has never asked who you are is the first lie the reference tells.
          */}
          <Label size={10} tracking={0.16} colour={color.brandSoft}>{t(greeting)}</Label>
          <Heading size={26} tracking={-0.5} colour={onFill.brand} style={{ marginTop: 2 }}>
            {t(area.name)}
          </Heading>
          <View style={{ marginTop: 10 }}>
            <AreaSwitch area={area.key} onChange={onChangeArea} tone="inverted" />
          </View>
        </View>
        {/* The verified purse, as a chip. Green means a host checked it - even here. */}
        <Pressable
          onPress={onOpenWallet}
          accessibilityRole="button"
          accessibilityLabel={`Green Points, ${green === null ? 'unknown' : green.toLocaleString('en-US')} G`}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36,
            paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.lg,
            backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
          }}
        >
          <Leaf size={14} color={color.accent300} strokeWidth={2.2} />
          <Heading size={14} colour={onFill.brand}>{green === null ? '—' : green.toLocaleString('en-US')}</Heading>
          <Label size={9} tracking={0.1} colour={color.brandSoft}>G</Label>
        </Pressable>
        {/*
          The profile, top right, where every app keeps it. A drawn figure
          rather than a photograph, because the app has none to show and
          would not invent one.
        */}
        <Pressable
          onPress={onOpenProfile}
          accessibilityRole="button"
          accessibilityLabel={t(strings.profile.context)}
          style={{
            width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
          }}
        >
          <UserRound size={18} color={onFill.brand} strokeWidth={2} />
        </Pressable>
      </View>

      {/*
        The search field is the concierge's door. It looks like search because
        that is what a traveller reaches for; it asks a person-shaped thing
        because a search over five places is not worth a field.
      */}
      <Pressable
        onPress={onOpenConcierge}
        accessibilityRole="button"
        accessibilityLabel={t({ en: 'Ask where to go', th: 'ถามว่าไปไหนดี' })}
        style={{
          marginTop: 16, minHeight: 46, paddingHorizontal: 16,
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: color.surface, borderRadius: radius.lg,
        }}
      >
        <Search size={16} color={color.neutral600} strokeWidth={2} />
        <Body size={14} colour={color.neutral600}>{t({ en: 'Where to go today?', th: 'วันนี้ไปไหนดี?' })}</Body>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 1. What is true here now
// ---------------------------------------------------------------------------

function Conditions({
  places, onOpenMap,
}: { places: Async<ScoredPlace[]>; onOpenMap: () => void }) {
  const list = places.data ?? [];
  const avg = islandAverage(list);
  const provenance = weakestProvenance(list);

  return (
    <View
      style={[shadow.card, {
        marginHorizontal: gutter,
        marginTop: -30,
        padding: 18,
        borderRadius: radius.md,
        backgroundColor: color.surface,
      }]}
    >
      <Label size={10} tracking={0.14} colour={color.neutral700}>
        {`${t(strings.place.healthyScore)} · ${t({ en: 'today', th: 'วันนี้' })}`}
      </Label>

      {places.error ? (
        // The block fails alone and says what is missing. It does not fall back
        // to a plausible number, which is the failure this whole app is about.
        <View style={{ marginTop: 10 }}>
          <Body size={13} colour={color.neutral800}>{t({ en: 'Conditions are unavailable right now.', th: 'ยังดึงข้อมูลสภาพพื้นที่ไม่ได้' })}</Body>
          <Button label={t(strings.common.retry)} onPress={places.reload} variant="secondary" height={40} style={{ marginTop: 10 }} />
        </View>
      ) : avg === null ? (
        <Body size={13} colour={color.neutral700} style={{ marginTop: 10 }}>
          {places.loading ? 'Reading the island…' : 'No measured places yet.'}
        </Body>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 }}>
          <Heading size={44} tracking={-1} colour={isHighScore(avg) ? color.accent700 : color.text}>{avg}</Heading>
          <View style={{ flex: 1 }}>
            <Body size={13} colour={color.neutral800}>
              {t({
                en: `Average across ${list.length} measured place${list.length === 1 ? '' : 's'}`,
                th: `เฉลี่ยจาก ${list.length} สถานที่ที่วัดจริง`,
              })}
            </Body>
            <Label size={9} tracking={0.1} colour={color.neutral600} style={{ marginTop: 2 }}>
              {t(strings.place.provenance[provenance])}
            </Label>
            {/*
              The average is a summary; the numbers with a breakdown behind
              them are the per-place ones. Saying so, and pointing at them, is
              cheaper than defending an aggregate nobody can interrogate.
            */}
            <Pressable
              onPress={onOpenMap}
              accessibilityRole="button"
              accessibilityLabel="See every place and how its score is calculated"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, minHeight: 28 }}
            >
              <Label size={10} tracking={0.1} colour={color.brand}>{t({ en: 'See every place', th: 'ดูทุกสถานที่' })}</Label>
              <ChevronRight size={14} color={color.brand} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// 2. Where to go: the doors, and the measured places
// ---------------------------------------------------------------------------

function Doors({
  onOpenMap, onOpenQuests, onOpenWallet, onOpenConcierge, onOpenImpact, onOpenSafety, onOpenParty,
}: {
  onOpenMap: () => void; onOpenQuests: () => void; onOpenWallet: () => void; onOpenConcierge: () => void;
  onOpenImpact: () => void; onOpenSafety: () => void; onOpenParty: () => void;
}) {
  // Seven round doors in a row that scrolls, not a grid of twelve. Untyped on
  // purpose: annotating the icon narrower than LucideIcon fights the
  // library's own forwardRef signature for nothing.
  const doors = [
    { Icon: Compass, name: strings.tabs.map, onPress: onOpenMap },
    { Icon: Sparkles, name: strings.tabs.quests, onPress: onOpenQuests },
    { Icon: Wallet, name: strings.tabs.wallet, onPress: onOpenWallet },
    { Icon: Shield, name: strings.tabs.safety, onPress: onOpenSafety },
    { Icon: MessageCircle, name: { en: 'Ask', th: 'ถาม' }, onPress: onOpenConcierge },
    { Icon: Leaf, name: strings.tabs.impact, onPress: onOpenImpact },
    { Icon: Users, name: { en: 'Group', th: 'กลุ่ม' }, onPress: onOpenParty },
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 18, gap: 14 }}
    >
      {doors.map(({ Icon, name, onPress }) => (
        <Pressable
          key={name.en}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={t(name)}
          style={{ alignItems: 'center', gap: 6, width: 64 }}
        >
          <View
            style={{
              width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
              backgroundColor: color.brandSoft,
            }}
          >
            <Icon size={20} color={color.brand} strokeWidth={2} />
          </View>
          <Label size={9} tracking={0.06} colour={color.neutral800} style={{ textTransform: 'none' }}>{t(name)}</Label>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const CARD_WIDTH = 172;
const CARD_GAP = 12;
const ITEM_WIDTH = CARD_WIDTH + CARD_GAP;
const MARQUEE_SPEED_PX_PER_SEC = 35;

function Places({
  places, onOpenMap, onOpenPlace,
}: { places: Async<ScoredPlace[]>; onOpenMap: () => void; onOpenPlace: (id: string) => void }) {
  const served = places.data ?? [];
  // ONE position for the whole row. A card that asked for its own would take
  // a fix per place, and the row would answer the same question five times.
  const here = useHere();
  // Nearest first once there is a position, and the server's order until
  // then. The head says which of the two you are looking at, because an
  // order that changes when somebody walks two streets is a claim, and every
  // other number on this screen names itself.
  const list = React.useMemo(() => nearestFirst(served, here), [served, here]);
  const still = useReduceMotion();

  // Warm the photographs while there is signal: the place screen at the
  // mangrove opens off the cache, not off a stalled request. Keyed to the
  // SERVED list, not the sorted one - the set of photographs to warm is the
  // same set whichever end of it is on the left, and keying it to the sorted
  // array would fetch them all again the moment a position arrived.
  React.useEffect(() => {
    for (const p of served) if (p.photo) void Image.prefetch(photoUri(p.photo.url)).catch(() => {});
  }, [served]);

  // Ensure the base sequence has enough cards to loop smoothly without gaps across wide viewports.
  const sequence = React.useMemo(() => {
    if (list.length === 0) return [];
    let s = list;
    while (s.length < 5) {
      s = [...s, ...list];
    }
    return s;
  }, [list]);

  const oneSetWidth = sequence.length * ITEM_WIDTH;
  const loopCards = React.useMemo(() => [...sequence, ...sequence, ...sequence], [sequence]);

  const anim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (still || list.length < 2) {
      anim.setValue(0);
      return undefined;
    }
    const duration = (oneSetWidth / MARQUEE_SPEED_PX_PER_SEC) * 1000;
    anim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, oneSetWidth, list.length, still]);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [gutter, gutter - oneSetWidth],
  });

  if (list.length === 0) return null;
  return (
    <View style={{ paddingTop: 22 }}>
      <SectionHead
        en="Measured places"
        th="สถานที่ที่วัดจริง"
        note={here ? t(strings.place.nearestFirst) : undefined}
        onSeeAll={onOpenMap}
      />
      {list.length < 2 || still ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: gutter, gap: CARD_GAP, paddingVertical: 6 }}
        >
          {list.map((p) => (
            <PlaceCard key={p.id} place={p} here={here} onPress={() => onOpenPlace(p.id)} />
          ))}
        </ScrollView>
      ) : (
        <View style={{ overflow: 'hidden', paddingVertical: 6 }}>
          <Animated.View
            style={{
              flexDirection: 'row',
              gap: CARD_GAP,
              transform: [{ translateX }],
            }}
          >
            {loopCards.map((p, index) => (
              <PlaceCard
                key={`${p.id}-${index}`}
                place={p}
                here={here}
                onPress={() => onOpenPlace(p.id)}
              />
            ))}
          </Animated.View>
        </View>
      )}
    </View>
  );
}

/**
 * A place, as a card with its photograph and its score.
 *
 * The photograph is the licensed one the place screen shows, credit and all,
 * or no photograph: a card with a stock beach on it would be the aspirational
 * Home this file's header refuses. The chip is the map pin's number, in the
 * map pin's colours - green only past the threshold a host would recognise.
 *
 * Two chips, and they are deliberately not the same thing. Top left is the
 * SCORE, which is a claim about the place. Top right is the DISTANCE, which
 * is a fact about where the reader is standing - the question this row is
 * really being scanned for, and the one the app could always answer and
 * never did (docs/52).
 *
 * The distance goes on the photograph rather than under the name, because
 * `meta` is already a sentence with a kilometre in it - "Beach · 2.1 km of
 * sand" - and two adjacent kilometre figures meaning different things is
 * worse than no figure at all.
 */
function PlaceCard({ place, here, onPress }: { place: ScoredPlace; here: Here | null; onPress: () => void }) {
  const high = isHighScore(place.healthyScore);
  const way = here ? wayThere(here, place) : null;
  const far = way ? (way.arrived ? t(strings.place.arrivedShort) : t(way.distance)) : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[
        t(place.name),
        `${t(strings.place.healthyScore)} ${place.healthyScore}`,
        // The distance is spoken too, or a screen reader gets the one card
        // fact a sighted reader is scanning this row for and not the other.
        ...(way ? [way.arrived ? t(strings.place.arrived) : t(strings.place.away(t(way.distance), t(way.direction)))] : []),
      ].join(', ')}
      style={[shadow.card, { width: 172, backgroundColor: color.surface, borderRadius: radius.md, overflow: 'hidden' }]}
    >
      <View style={{ height: 112, backgroundColor: color.neutral200 }}>
        {place.photo ? (
          <Image source={{ uri: photoUri(place.photo.url) }} resizeMode="cover" style={{ width: '100%', height: '100%' }}
            accessibilityLabel={`${t(place.name)}, photographed by ${place.photo.credit}`} />
        ) : (
          <NoPhotograph place={place} />
        )}
        <View
          style={{
            position: 'absolute', top: 8, left: 8, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.lg,
            backgroundColor: high ? color.accent : color.surface,
          }}
        >
          <Heading size={12} colour={high ? onFill.accent : color.text}>{String(place.healthyScore)}</Heading>
        </View>
        {far ? (
          <View
            style={{
              position: 'absolute', top: 8, right: 8, paddingVertical: 3, paddingHorizontal: 8,
              borderRadius: radius.lg, backgroundColor: color.surface,
            }}
          >
            <Label size={10} tracking={0.06} colour={color.neutral800}>{far}</Label>
          </View>
        ) : null}
      </View>
      <View style={{ padding: 10 }}>
        <Heading size={14}>{t(place.name)}</Heading>
        <Label size={9} tracking={0.04} colour={color.neutral600} style={{ marginTop: 3, textTransform: 'none' }} >
          {place.meta}
        </Label>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// 3. What you can do today
// ---------------------------------------------------------------------------

function Today({
  quests, onOpenQuest, onOpenQuests,
}: {
  quests: Async<{ quests: Quest[]; progress: Record<string, QuestProgress> }>;
  onOpenQuest: (id: string) => void;
  onOpenQuests: () => void;
}) {
  const all = quests.data?.quests ?? [];
  const progress = quests.data?.progress ?? {};
  /*
    Finished quests are not things you can do today, so they leave this list.
    The demo account has completed all four of today's, which rendered a
    "Today" block listing four missions the traveller had already done - an
    invitation to repeat work that cannot be repeated.
  */
  const open = all.filter((q) => progress[q.id]?.stage !== 'complete');
  const finished = all.length - open.length;
  const ordered = questOrder(open, progress).slice(0, HOME_QUEST_LIMIT);
  const rest = open.length - ordered.length;

  return (
    <View style={{ paddingTop: 22 }}>
      <SectionHead en="Today" th="วันนี้" onSeeAll={onOpenQuests} />

      {quests.error ? (
        <ErrorState message={quests.error} onRetry={quests.reload} />
      ) : quests.loading ? (
        <Body size={13} colour={color.neutral600} style={{ paddingHorizontal: gutter }}>
          {t({ en: 'Loading today’s missions…', th: 'กำลังโหลดภารกิจวันนี้…' })}
        </Body>
      ) : ordered.length === 0 ? (
        /*
          Said plainly, and not padded. Two different empty states, because
          they are two different days: having finished everything is an
          achievement and reads as one; there being nothing to do is not the
          traveller's doing and should not be dressed up as praise.
        */
        <View style={[shadow.card, { marginHorizontal: gutter, padding: 16, borderRadius: radius.md, backgroundColor: color.surface }]}>
          {finished > 0 ? (
            <Body size={13} colour={color.accent700}>
              {t({
                en: `All ${finished} of today’s missions are done. Nothing left to verify until tomorrow.`,
                th: `ทำภารกิจวันนี้ครบทั้ง ${finished} รายการแล้ว ไม่มีอะไรรอตรวจจนถึงพรุ่งนี้`,
              })}
            </Body>
          ) : (
            <Body size={13} colour={color.neutral700}>{t({ en: 'No missions running today. The map still works, and the weekend list usually has something.', th: 'วันนี้ยังไม่มีภารกิจ แผนที่ยังใช้ได้ และรายการสุดสัปดาห์มักมีให้ทำ' })}</Body>
          )}
          <Button label="See all missions" thai="ดูภารกิจทั้งหมด" onPress={onOpenQuests} variant="secondary" height={44} style={{ marginTop: 12 }} />
        </View>
      ) : (
        <>
          {ordered.map((q) => (
            <QuestCard key={q.id} quest={q} progress={progress[q.id] ?? null} onPress={() => onOpenQuest(q.id)} />
          ))}
          {rest > 0 ? (
            <Pressable
              onPress={onOpenQuests}
              accessibilityRole="button"
              accessibilityLabel={`See all missions, ${rest} more`}
              style={{ marginHorizontal: gutter, marginTop: 10, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Label size={10} tracking={0.12} colour={color.brand}>{t({ en: `${rest} more today`, th: `อีก ${rest} ภารกิจวันนี้` })}</Label>
              <ChevronRight size={16} color={color.brand} strokeWidth={2} />
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

function QuestCard({
  quest, progress, onPress,
}: { quest: Quest; progress: QuestProgress | null; onPress: () => void }) {
  const started = progress != null && progress.stage !== 'complete';
  const tone = currencyTone(quest.rewardCurrency);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t(quest.name)}. ${t(quest.where)}. ${started ? 'In progress' : 'Not started'}`}
      style={[shadow.card, {
        marginHorizontal: gutter,
        marginTop: 10,
        padding: 14,
        backgroundColor: color.surface,
        borderRadius: radius.md,
        // A quest already under way is the app reminding you of your own
        // commitment, so it is outlined in brand - not in green, which would
        // say a host had already approved something nobody has done yet.
        borderWidth: started ? layout.ruleStrong : 0,
        borderColor: color.brand,
      }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1 }}>
          {started ? (
            <Label size={9} tracking={0.14} colour={color.brand} style={{ marginBottom: 4 }}>{t({ en: 'IN PROGRESS', th: 'กำลังทำอยู่' })}</Label>
          ) : null}
          <Heading size={16}>{t(quest.name)}</Heading>
          <Body size={13} colour={color.neutral600} style={{ marginTop: 6 }}>
            {`${t(quest.where)} · ${t(quest.duration)}`}
          </Body>
          {/*
            The host is named on the card, not only inside the quest. The
            person who will approve this is the reason the reward means
            anything, and an anonymous mission is just a task list.
          */}
          <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 4, textTransform: 'none' }}>
            {t(strings.quests.by(quest.host.name))}
          </Label>
        </View>
        <View style={{ backgroundColor: tone.fill, paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.lg }}>
          <Heading size={13} colour={tone.on}>
            {`+${quest.rewardPoints} ${quest.rewardCurrency === 'green' ? 'G' : 'T'}`}
          </Heading>
        </View>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// 4. What you are carrying
// ---------------------------------------------------------------------------

function Carrying({
  wallet, passport, companions, onOpenWallet, onOpenPassport,
}: {
  wallet: Async<{ balances: { green: number; trip: number } }>;
  passport: Async<{ visited: string[] }>;
  companions: Async<{ summary: { found: number; total: number; grown: number } }>;
  onOpenWallet: () => void;
  onOpenPassport: () => void;
}) {
  const green = wallet.data?.balances.green ?? null;
  const trip = wallet.data?.balances.trip ?? null;
  const stamps = passport.data ? passportProgress(passport.data.visited) : null;
  const found = companions.data?.summary ?? null;

  return (
    <View style={{ paddingTop: 22 }}>
      <SectionHead en="What you’re carrying" th="สิ่งที่คุณสะสมไว้" />

      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: gutter }}>
        {/*
          The two purses side by side and coloured apart, because this is the
          screen where somebody first learns there are two of them. Green is
          host-verified, gold is self-verified, and the labels say which.
        */}
        <Figure value={green === null ? '—' : green.toLocaleString('en-US')} unit="G" en="Green · verified" th="ตรวจแล้ว" tone={color.accent700} onPress={onOpenWallet} />
        <Figure value={trip === null ? '—' : trip.toLocaleString('en-US')} unit="T" en="Trip · self" th="บันทึกเอง" tone={color.goldDeep} onPress={onOpenWallet} />
      </View>

      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: gutter, marginTop: 10 }}>
        <Figure value={stamps === null ? '—' : String(stamps.visited)} unit={stamps === null ? '' : `/ ${stamps.total}`} en="Provinces" th="จังหวัด" tone={color.brand} onPress={onOpenPassport} />
        <Figure value={found === null ? '—' : String(found.found)} unit={found === null ? '' : `/ ${found.total}`} en="Companions" th="เพื่อนร่วมทาง" tone={color.brand} onPress={onOpenWallet} />
      </View>

      {wallet.error || passport.error || companions.error ? (
        <Label size={9} tracking={0.04} colour={color.neutral600} style={{ paddingHorizontal: gutter, marginTop: 8, textTransform: 'none' }}>
          Some figures could not be loaded and are shown as —, not as zero.
        </Label>
      ) : null}
    </View>
  );
}

/** One figure in a tappable card. `—` when unknown, which is not the same as 0. */
function Figure({
  value, unit, en, th, tone, onPress,
}: {
  value: string; unit: string; en: string; th: string; tone: string; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${en}, ${value} ${unit}`}
      style={[shadow.card, { flex: 1, minHeight: 44, padding: 14, backgroundColor: color.surface, borderRadius: radius.md }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Heading size={24} colour={tone}>{value}</Heading>
        {unit ? <Label size={10} tracking={0.08} colour={color.neutral600}>{unit}</Label> : null}
      </View>
      <Label size={9} tracking={0.08} colour={color.neutral700} style={{ marginTop: 4 }}>{t({ en, th })}</Label>
    </Pressable>
  );
}

/**
 * A card with no photograph yet.
 *
 * Not a grey box, and not somebody else's photograph either: the five campus
 * places had nothing under a licence anywhere in the open sources (Commons,
 * Wikipedia, Openverse, checked on 8 September), so until the team's own
 * photographs land in `public/assets/places/` the card wears its habitat -
 * the layer's tint and mark - and says so to a screen reader. A picture of
 * a different building would have been the one lie on the screen.
 */
const HABITAT: Record<string, { Mark: LucideIcon; tint: string; tone: string }> = {
  Green: { Mark: Trees, tint: color.accent100, tone: color.accent500 },
  Wellness: { Mark: HeartPulse, tint: color.brandSoft, tone: color.brand },
  Food: { Mark: Utensils, tint: color.goldSoft, tone: color.gold },
  Safe: { Mark: Shield, tint: color.neutral200, tone: color.neutral500 },
  Quest: { Mark: Sparkles, tint: color.goldSoft, tone: color.goldDeep },
};

function NoPhotograph({ place }: { place: ScoredPlace }) {
  const habitat = HABITAT[place.layer] ?? HABITAT.Safe!;
  return (
    <View
      accessibilityLabel={`${t(place.name)}, ${t({ en: 'no photograph yet', th: 'ยังไม่มีรูป' })}`}
      style={{ width: '100%', height: '100%', backgroundColor: habitat.tint, alignItems: 'center', justifyContent: 'center' }}
    >
      {place.id === 'mangrove' ? (
        <Image
          source={{ uri: photoUri('/assets/illustrations/mangrove-habitat-v1.jpg') }}
          accessible={false}
          resizeMode="cover"
          style={{ position: 'absolute', top: 0, bottom: 24, width: '100%' }}
        />
      ) : null}
      <View style={{ opacity: 0.45 }}>
        <habitat.Mark size={44} color={habitat.tone} strokeWidth={1.6} />
      </View>
      <Label size={9} tracking={0.14} colour={habitat.tone} style={{ position: 'absolute', bottom: 8, right: 10, opacity: 0.9 }}>
        {place.short}
      </Label>
    </View>
  );
}

/** A section's title, and the reference's "See all" beside it when there is a place to go. */
/** The area's monsters, fetched here so Home owns one request for them. */
function Monsters({ areaKey, onOpenPlace }: { areaKey: string; onOpenPlace: (placeId: string) => void }) {
  const found = useAsync(() => api.monsters(areaKey), [areaKey]);
  return (
    <MonsterFeed
      monsters={found.data?.monsters ?? null}
      loading={found.loading}
      error={found.error}
      onRetry={found.reload}
      onOpenPlace={onOpenPlace}
    />
  );
}

/** The area's board, fetched here so Home owns one request for it. */
function Board({ areaKey, onOpenPlace }: { areaKey: string; onOpenPlace: (placeId: string) => void }) {
  const board = useAsync(() => api.board(areaKey), [areaKey]);
  return (
    <BoardFeed
      entries={board.data?.entries ?? null}
      loading={board.loading}
      error={board.error}
      onRetry={board.reload}
      onOpenPlace={onOpenPlace}
    />
  );
}

function SectionHead({
  en, th, note, onSeeAll,
}: { en: string; th: string; note?: string; onSeeAll?: () => void }) {
  return (
    <View style={{ paddingHorizontal: gutter, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View>
        <Heading size={16}>{t({ en, th })}</Heading>
        {/* How the section is ordered, when something other than the server ordered it. */}
        {note ? <Label size={9} tracking={0.08} colour={color.neutral600} style={{ marginTop: 2 }}>{note}</Label> : null}
      </View>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} accessibilityRole="button" accessibilityLabel={`${t({ en: 'See all', th: 'ดูทั้งหมด' })}: ${t({ en, th })}`} style={{ minHeight: 28, justifyContent: 'center' }}>
          <Label size={10} tracking={0.1} colour={color.brand}>{t({ en: 'See all', th: 'ดูทั้งหมด' })}</Label>
        </Pressable>
      ) : null}
    </View>
  );
}
