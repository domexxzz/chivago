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
 *   0. Order ahead                only where a food court takes orders ahead
 *                                 (docs/65): on a campus at noon, food first
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
import Svg, { Defs, LinearGradient, Stop, Rect, Path } from 'react-native-svg';
import {
  Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { AREAS, areaOfPlace, fairsIn, featuredFirst, hasFeatured, inArea, isFeatured, stallPlacesIn, type Area, type AreaKey, type Fair } from '@chivago/core';
import { setArea, useArea } from '../state/area.ts';
import { creditWord, fitsWhole, mascotBeachUri, photoBackdrop, photoUri } from '../api/photos.ts';
import { SHOP_CATEGORIES, shopImageUri, type Shop } from '../api/shops.ts';
import { AreaSwitch } from '../components/AreaSwitch.tsx';
import { BoardFeed } from '../components/BoardFeed.tsx';
import { BusStrip } from '../components/BusStrip.tsx';
import { MonsterFeed } from '../components/MonsterFeed.tsx';
import { StallsCard } from '../components/Stalls.tsx';
import { SeaAndSkyCard } from '../components/SeaAndSky.tsx';
import { GuideLanguageFlag, guideLanguageLabel } from '../components/GuideLanguageFlag.tsx';
import {
  Mic, ScanLine, Umbrella, ChevronRight, HeartPulse, Leaf, Map as MapIcon, MapPin, UserRound, Search, Shield, Sparkles, Ticket, Trees, Utensils, Wallet, Waves,
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
import { tint } from '@chivago/tokens';
import { Body, Heading, Label } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { ErrorState } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';
import chivagoLogo from '../../assets/chivago-logo.png';
import { ProfileButton } from '../components/ProfileButton.tsx';

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
  onOpenMap, onOpenQuests, onOpenQuest, onOpenWallet, onOpenMarket, onOpenFair, onOpenPassport,
  onOpenImpact, onOpenConcierge, onOpenSafety, onOpenParty, onOpenProfile, onOpenPlace, onOpenShop, onOpenMascots, onOpenStays,
  onToast, now = new Date(),
}: {
  onOpenMap: () => void;
  onOpenQuests: () => void;
  onOpenQuest: (id: string) => void;
  onOpenWallet: () => void;
  /** The travel marketplace: points for local merchants' vouchers. Falls back to the wallet. */
  onOpenMarket?: () => void;
  onOpenPassport: () => void;
  onOpenImpact: () => void;
  onOpenConcierge: () => void;
  onOpenSafety: () => void;
  onOpenParty: () => void;
  /** The profile: the traveller's own record, from the button at the top right. */
  onOpenProfile: () => void;
  /** A place card. Optional so the screen tests that predate the cards still render. */
  onOpenPlace?: (id: string) => void;
  onOpenShop?: (id: string) => void;
  /** The provincial mascots & island companions guide. */
  onOpenMascots?: () => void;
  /**
   * Stays & tours (docs/61): asking a local operator. A door of its own on
   * Home, because the only way in used to be the bottom of the trip planner
   * and the owner could not find it.
   */
  onOpenStays?: () => void;
  /** A fair's market in this area, lot by lot (docs/66). Optional so the older screen tests still render. */
  onOpenFair?: () => void;
  /** A one-line acknowledgement, for actions that finish without leaving the screen. */
  onToast?: (message: string) => void;
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
  const shops = useAsync(() => api.shops({ area: area.key }), [area.key]);
  const here = React.useMemo(
    () => ({ ...places, data: places.data ? places.data.filter((p) => areaOfPlace(p) === area.key) : places.data }),
    [places, area.key],
  );
  const todayHere = React.useMemo(
    () => ({
      ...quests,
      data: quests.data ? { ...quests.data, quests: quests.data.quests.filter((q) => inArea(area, q)) } : quests.data,
    }),
    [quests, area],
  );
  // Food courts here whose stalls take orders ahead (docs/65). Known without
  // the places list, so the card and the layout under it do not wait for
  // /places, and an area without one asks for nothing more.
  const courts = React.useMemo(() => stallPlacesIn(area.key), [area.key]);
  // A fair on in this area (docs/66), offered at the top with the food court.
  const fair = React.useMemo(() => (onOpenFair ? fairsIn(area.key)[0] ?? null : null), [area.key, onOpenFair]);
  const passport = useAsync(() => api.passport(), []);
  const companions = useAsync(() => api.companions(), []);


  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#EDF6F9' }} showsVerticalScrollIndicator={false}>
      <Hero
        now={now}
        area={area}
        onChangeArea={setArea}
        onOpenConcierge={onOpenConcierge}
        onOpenProfile={onOpenProfile}
      />
      {/*
        Order ahead, first thing under the header, in an area with a food court
        that takes orders ahead (docs/65): at noon on a campus, food is what a
        student opened the app for. An area without one draws nothing here and
        asks for nothing, so the island's Home is unchanged.
      */}
      <TopCards courts={courts} fair={fair} onOpenFair={onOpenFair} />
      <Conditions places={here} onOpenMap={onOpenMap} overHero={courts.length === 0 && fair === null} />
      <Doors
        onOpenMap={onOpenMap}
        onOpenQuests={onOpenQuests}
        onOpenWallet={onOpenWallet}
        onOpenConcierge={onOpenConcierge}
        onOpenImpact={onOpenImpact}
        onOpenSafety={onOpenSafety}
        onOpenParty={onOpenParty}
        onOpenStays={onOpenStays}
        onOpenMarket={onOpenMarket ?? onOpenWallet}
      />
      {/*
        What it is like outside, above where to go: the sea and the sky decide
        whether any of the places below are worth the trip. Read per area, and
        it draws nothing where the feed has nothing - inland there is no wave
        tab at all (components/SeaAndSky.tsx).
      */}
      <View style={{ paddingHorizontal: gutter }}>
        <SeaAndSkyCard area={area.key} />
      </View>
      <Places places={here} shops={shops} onOpenMap={onOpenMap} onOpenPlace={onOpenPlace ?? onOpenMap} onOpenShop={onOpenShop ?? onOpenMap} />
      <MarketPromoCard onOpenMarket={onOpenMarket ?? onOpenWallet} />
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
      {/*
        How to get here, above the board and below the problems. Somebody who
        is not here yet needs it before anything about what to do once they
        are; somebody who IS here has already scrolled past it. It draws
        nothing at all in an area with no route, so the island is unchanged.
      */}
      <Bus areaKey={area.key} onToast={onToast} />
      <Board areaKey={area.key} onOpenPlace={onOpenPlace ?? onOpenMap} />
      <Today quests={todayHere} onOpenQuest={onOpenQuest} onOpenQuests={onOpenQuests} />
      {/*
        The companion sits with the rest of the game layer now, not between the
        places and what is happening around them. A full-width portrait at the
        top of the feed interrupted "around you" before it had started; down
        here it opens the keepsake band - the mascot, then Carrying's points,
        passport and companions - the one stretch of this screen that is about
        YOU rather than the island. The place-first order above it (problems,
        transit, board, then today's missions) is unchanged.
      */}
      <MascotHeroCard now={now} onOpen={onOpenMascots ?? onOpenPassport} />
      <Carrying
        wallet={wallet}
        passport={passport}
        companions={companions}
        onOpenWallet={onOpenWallet}
        onOpenPassport={onOpenPassport}
      />
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

type Async<T> = { data: T | null; loading: boolean; error: string | null; reload: () => void };

// ---------------------------------------------------------------------------
// 0. The header: the island's name, your points, and a place to ask
// ---------------------------------------------------------------------------

/** Native SVG keeps the ocean gradient and waves identical on web and phones. */
function OceanBackdrop({ subtle = false }: { subtle?: boolean }) {
  return (
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFillObject}>
      <Svg width="100%" height="100%" viewBox="0 0 480 340" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={subtle ? 'sand' : 'ocean'} x1="0%" y1="0%" x2="100%" y2="80%">
            <Stop offset="0" stopColor={subtle ? '#FFFFFF' : '#00B4D8'} />
            <Stop offset="1" stopColor={subtle ? '#EDF6F9' : '#004E64'} />
          </LinearGradient>
        </Defs>
        <Rect width="480" height="340" fill={`url(#${subtle ? 'sand' : 'ocean'})`} />
        <Path d="M0 250 Q100 200 220 270 T480 240 V340 H0Z" fill="#48CAE4" opacity={subtle ? 0.1 : 0.3} />
        <Path d="M0 285 Q120 225 260 290 T480 270 V340 H0Z" fill="#FFFFFF" opacity={subtle ? 0.6 : 0.55} />
        <Path d="M0 307 Q120 265 260 310 T480 296 V340 H0Z" fill="#EDF6F9" opacity={subtle ? 0.8 : 1} />
      </Svg>
    </View>
  );
}

function Hero({ now, area, onChangeArea, onOpenConcierge, onOpenProfile }: {
  now: Date; area: Area; onChangeArea: (next: AreaKey) => void;
  onOpenConcierge: () => void; onOpenProfile: () => void;
}) {
  return (
    <View style={{ backgroundColor: '#028090', paddingHorizontal: gutter, paddingTop: 24, paddingBottom: 70, overflow: 'hidden' }}>
      <OceanBackdrop />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#D5F6FF', fontSize: 12, fontWeight: '500', letterSpacing: 1.8, textTransform: 'uppercase' }}>{t(greetingFor(now))}</Text>
          <Heading size={28} colour="#FFFFFF" style={{ marginTop: 5 }}>{t(area.name)}</Heading>
        </View>
        <Image
          source={chivagoLogo}
          resizeMode="contain"
          accessibilityLabel="ChivaGo"
          style={{ width: 68, height: 48, marginLeft: 8, marginRight: 12 }}
        />
        <ProfileButton onPress={onOpenProfile} />
      </View>
      <AreaSwitch area={area.key} onChange={onChangeArea} tone="inverted" />
      <Pressable onPress={onOpenConcierge} accessibilityRole="button" accessibilityLabel={t({ en: 'Ask where to go', th: 'ถามว่าไปไหนดี', zh: '问问去哪儿好' })}
        style={{ marginTop: 20, minHeight: 56, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 28, shadowColor: '#004E64', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}>
        <Search size={21} color="#78909C" />
        <Body colour="#78909C" style={{ flex: 1 }}>{t({ en: 'Where to go today?', th: 'วันนี้ไปไหนดี?', zh: '今天去哪儿好？' })}</Body>
        <ScanLine size={21} color="#0077B6" />
        <Mic size={21} color="#0077B6" />
      </Pressable>
    </View>
  );
}

function Conditions({
  places, onOpenMap, overHero = true,
}: {
  places: Async<ScoredPlace[]>;
  onOpenMap: () => void;
  overHero?: boolean;
}) {
  const list = places.data ?? [];
  const avg = islandAverage(list);
  const provenance = weakestProvenance(list);

  return (
    <View
      style={[shadow.card, {
        marginHorizontal: gutter,
        marginTop: overHero ? -38 : 16,
        padding: 20,
        overflow: 'hidden',
        borderRadius: 24,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#FFFFFF',
        shadowColor: '#0077B6',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
      }]}
    >
      <OceanBackdrop subtle />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <HeartPulse size={16} color="#0077B6" strokeWidth={2} />
          <Label size={10} tracking={0.14} colour={color.neutral700}>
            {`${t(strings.place.healthyScore)} · ${t({ en: 'area average', th: 'เฉลี่ยพื้นที่', zh: '区域平均' })}`}
          </Label>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E2F5FA', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#0077B6' }} />
          <Label size={9} tracking={0.08} colour="#0077B6">
            {t(strings.place.provenance[provenance])}
          </Label>
        </View>
      </View>

      {places.error ? (
        // The block fails alone and says what is missing. It does not fall back
        // to a plausible number, which is the failure this whole app is about.
        <View style={{ marginTop: 10 }}>
          <Body size={13} colour={color.neutral800}>{t({ en: 'Conditions are unavailable right now.', th: 'ยังดึงข้อมูลสภาพพื้นที่ไม่ได้', zh: '暂时无法获取这里的状况。' })}</Body>
          <Button label={t(strings.common.retry)} onPress={places.reload} variant="secondary" height={40} style={{ marginTop: 10 }} />
        </View>
      ) : avg === null ? (
        <Body size={13} colour={color.neutral700} style={{ marginTop: 10 }}>
          {places.loading ? t({ en: 'Loading places…', th: 'กำลังโหลดสถานที่…', zh: '正在加载地点…' }) : t({ en: 'No places here yet.', th: 'ยังไม่มีสถานที่ในพื้นที่นี้', zh: '这里还没有地点。' })}
        </Body>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12 }}>
          <View style={{ minWidth: 70, alignItems: 'center', gap: 4 }}>
            <Heading size={48} tracking={-1.5} colour="#03045E">{avg}</Heading>
            <Waves size={38} color="#48CAE4" strokeWidth={1.6} />
          </View>
          <View style={{ flex: 1 }}>
            <Body size={13} colour={color.neutral800}>
              {t({
                en: `Average score across ${list.length} place${list.length === 1 ? '' : 's'}`,
                th: `คะแนนเฉลี่ยจาก ${list.length} สถานที่`,
                zh: `${list.length} 个地点的平均评分`,
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
              accessibilityLabel={t({
                en: 'See every place and how its score is calculated',
                th: 'ดูทุกสถานที่และวิธีคำนวณคะแนน',
                zh: '查看每个地点及其评分的计算方式',
              })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, minHeight: 44 }}
            >
              <Label size={10} tracking={0.1} colour="#0077B6">{t({ en: 'See every place', th: 'ดูทุกสถานที่', zh: '查看全部地点' })}</Label>
              <ChevronRight size={14} color="#0077B6" strokeWidth={2} />
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
  onOpenStays, onOpenMarket,
}: {
  onOpenMap: () => void; onOpenQuests: () => void; onOpenWallet: () => void; onOpenConcierge: () => void;
  onOpenImpact: () => void; onOpenSafety: () => void; onOpenParty: () => void; onOpenStays?: () => void;
  onOpenMarket: () => void;
}) {
  const doors = [
    { Icon: MapIcon, name: strings.tabs.map, onPress: onOpenMap, fill: '#C8F0FA', ink: '#0077B6' },
    { Icon: Umbrella, name: strings.ask.context, onPress: onOpenStays ?? onOpenConcierge, fill: '#FFE2D4', ink: '#B95429' },
    { Icon: Sparkles, name: strings.tabs.quests, onPress: onOpenQuests, fill: '#FFD6AF', ink: '#B34C00' },
    { Icon: Wallet, name: strings.tabs.wallet, onPress: onOpenWallet, fill: '#FFD5CF', ink: '#AE433C' },
    { Icon: Ticket, name: { en: 'Deals', th: 'สิทธิพิเศษ', zh: '优惠' }, onPress: onOpenMarket, fill: '#FFF0AD', ink: '#916000' },
  ];
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: Math.max(8, gutter - 8), paddingTop: 22 }}>
      {doors.map(({ Icon, name, onPress, fill, ink }) => (
        <Pressable key={name.en} onPress={onPress} accessibilityRole="button" accessibilityLabel={t(name)}
          style={{ flex: 1, alignItems: 'center', gap: 8, minHeight: 88 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: fill, alignItems: 'center', justifyContent: 'center', borderTopWidth: 2, borderTopColor: 'rgba(255,255,255,0.8)', shadowColor: ink, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 5, elevation: 2 }}>
            <Icon size={25} color={ink} strokeWidth={1.8} />
          </View>
          <Text style={{ fontSize: 12, color: '#2B2D42', textAlign: 'center' }}>{t(name)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * The travel marketplace, as a card under the places.
 *
 * Its icon is on a flat tint, not green: a deal is something to spend points
 * on, not something a host verified.
 */
function MarketPromoCard({ onOpenMarket }: { onOpenMarket: () => void }) {
  return (
    <View style={{ paddingTop: 20, paddingHorizontal: gutter }}>
      <Pressable
        onPress={onOpenMarket}
        accessibilityRole="button"
        accessibilityLabel={t(strings.market.context)}
        style={[
          shadow.card,
          {
            backgroundColor: color.surface, borderRadius: radius.md, padding: 16,
            borderWidth: 1, borderColor: color.neutral300,
            flexDirection: 'row', alignItems: 'center', gap: 12,
          },
        ]}
      >
        <View
          style={{
            width: 48, height: 48, borderRadius: radius.md,
            backgroundColor: tint.peach.fill, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ticket size={24} color={tint.peach.ink} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Label size={9} tracking={0.12} colour={color.brand}>
              {t({ en: 'TRAVEL MARKETPLACE', th: 'ตลาดสิทธิพิเศษ', zh: '旅行优惠市集' })}
            </Label>
            <View style={{ backgroundColor: color.goldSoft, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.lg }}>
              <Label size={9} tracking={0.04} colour={color.goldDeep}>{t({ en: 'NEW', th: 'ใหม่', zh: '新' })}</Label>
            </View>
          </View>
          <Heading size={15} tracking={-0.3} style={{ marginTop: 2 }}>
            {t({ en: 'Redeem local deals and perks', th: 'แลกสิทธิพิเศษร้านค้าชุมชน', zh: '兑换本地商家的优惠' })}
          </Heading>
          <Body size={13} colour={color.neutral700} style={{ marginTop: 2 }}>
            {t({
              en: 'Use your Green and Trip points for café discounts, wellness and island tours.',
              th: 'ใช้แต้มกรีนและแต้มทริป แลกรับส่วนลดคาเฟ่ ร้านอาหาร และกิจกรรมบนเกาะ',
              zh: '用你的绿色积分和旅行积分，兑换咖啡馆折扣、康养和岛上行程。',
            })}
          </Body>
        </View>
        <ChevronRight size={18} color={color.brand} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

const CARD_GAP = 12;

/**
 * What the row is actually ordered by, said plainly.
 *
 * A pinned place sits ahead of the distance order (featured.ts), so once one
 * is in the row the head must stop claiming the row is simply nearest-first.
 * Without a position there is no distance order to name at all, so only the
 * pin is worth saying; with neither, the head says nothing rather than
 * naming an order it cannot vouch for.
 */
function noteForOrder(pinned: boolean, located: boolean): string | undefined {
  if (pinned) return t(located ? strings.place.featuredThenNearest : strings.place.featuredFirstOnly);
  return located ? t(strings.place.nearestFirst) : undefined;
}

function Places({
  places, shops, onOpenMap, onOpenPlace, onOpenShop,
}: { places: Async<ScoredPlace[]>; shops: Async<Shop[]>; onOpenMap: () => void; onOpenPlace: (id: string) => void; onOpenShop: (id: string) => void }) {
  const served = places.data ?? [];
  const [kind, setKind] = React.useState<'all' | 'places' | 'shops'>('all');
  const [shopCategory, setShopCategory] = React.useState<string>('');
  // ONE position for the whole row. A card that asked for its own would take
  // a fix per place, and the row would answer the same question five times.
  const here = useHere();
  // Nearest first once there is a position, and the server's order until
  // then. The head says which of the two you are looking at, because an
  // order that changes when somebody walks two streets is a claim, and every
  // other number on this screen names itself.
  // Nearest first, then the pinned place lifted to the front of that order
  // (featured.ts). The head below stops saying "nearest first" when one is
  // pinned, because by then it would not be true.
  const list = React.useMemo(() => featuredFirst(nearestFirst(served, here)), [served, here]);
  const pinned = React.useMemo(() => hasFeatured(list), [list]);

  // Warm the photographs while there is signal: the place screen at the
  // mangrove opens off the cache, not off a stalled request. Keyed to the
  // SERVED list, not the sorted one - the set to warm is the same set whichever
  // end of it is on the left, and keying it to the sorted array would fetch
  // them all again the moment a position arrived.
  React.useEffect(() => {
    for (const p of served) if (p.photo) void Image.prefetch(photoUri(p.photo.url)).catch(() => {});
  }, [served]);

  const shownPlaces = kind === 'shops' ? [] : list;
  const shownShops = kind === 'places' ? [] : (shops.data ?? []).filter((shop) => !shopCategory || shop.category === shopCategory);
  const loading = (kind !== 'shops' && places.loading) || (kind !== 'places' && shops.loading);
  if (list.length === 0 && (shops.data?.length ?? 0) === 0 && !loading && !places.error && !shops.error) return null;
  return (
    <View style={{ paddingTop: 26 }}>
      <SectionHead
        en="Places in this area"
        th="สถานที่ในพื้นที่นี้"
        zh="这一带的地点"
        note={noteForOrder(pinned, here !== null)}
        onSeeAll={onOpenMap}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: gutter, gap: 8, paddingBottom: 4 }}>
        {([['all', { en: 'All', th: 'ทั้งหมด', zh: '全部' }], ['places', { en: 'Places', th: 'สถานที่', zh: '地点' }], ['shops', { en: 'Services', th: 'สถานบริการ', zh: '服务' }]] as const).map(([value, label]) => <Pressable key={value} onPress={() => setKind(value)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: kind === value ? '#0077B6' : '#E1F2F7' }}><Text style={{ color: kind === value ? '#fff' : '#123B64', fontSize: 12, fontWeight: '700' }}>{t(label)}</Text></Pressable>)}
      </ScrollView>
      {kind === 'shops' ? <View style={{ paddingTop: 10 }}>
        <Label size={11} colour="#123B64" style={{ paddingHorizontal: gutter, paddingBottom: 6 }}>{t({ en: 'Service category', th: 'ประเภทบริการ', zh: '服务类别' })}</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: gutter, gap: 8 }}>
          <Pressable onPress={() => setShopCategory('')} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: !shopCategory ? '#0077B6' : '#E1F2F7' }}><Text style={{ color: !shopCategory ? '#fff' : '#123B64', fontSize: 12, fontWeight: '700' }}>{t({ en: 'All', th: 'ทั้งหมด', zh: '全部' })}</Text></Pressable>
          {SHOP_CATEGORIES.map((category) => <Pressable key={category} onPress={() => setShopCategory(category)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: shopCategory === category ? '#0077B6' : '#E1F2F7' }}><Text style={{ color: shopCategory === category ? '#fff' : '#123B64', fontSize: 12, fontWeight: '700' }}>{shopCategoryLabel(category)}</Text></Pressable>)}
        </ScrollView>
      </View> : null}
      {places.error && kind !== 'shops' ? <Pressable onPress={places.reload} style={{ paddingHorizontal: gutter, paddingTop: 8 }}><Body size={13} colour="#B91C1C">{t({ en: 'Could not load places. Try again.', th: 'โหลดสถานที่ไม่สำเร็จ · ลองใหม่', zh: '地点加载失败 · 请重试' })}</Body></Pressable> : null}
      {shops.error && kind !== 'places' ? <Pressable onPress={shops.reload} style={{ paddingHorizontal: gutter, paddingTop: 8 }}><Body size={13} colour="#B91C1C">{t({ en: 'Could not load services. Try again.', th: 'โหลดบริการไม่สำเร็จ · ลองใหม่', zh: '服务加载失败 · 请重试' })}</Body></Pressable> : null}
      {loading ? <Body size={13} style={{ paddingHorizontal: gutter, paddingTop: 8 }}>{t({ en: 'Loading this area…', th: 'กำลังโหลดข้อมูลในพื้นที่...', zh: '正在加载这一带的信息…' })}</Body> : null}
      {shownPlaces.length || shownShops.length ? (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: gutter, gap: 14, paddingVertical: 8 }}
      >
        {shownPlaces.map((p) => (
          <PlaceCard key={p.id} place={p} here={here} onPress={() => onOpenPlace(p.id)} />
        ))}
        {shownShops.map((shop) => <ShopCard key={shop.id} shop={shop} onPress={() => onOpenShop(shop.id)} />)}
      </ScrollView>
      ) : !loading ? <Body style={{ marginHorizontal: gutter, marginTop: 8 }} colour={color.neutral700}>{kind === 'shops' ? (shopCategory ? t({ en: `No ${shopCategoryLabel(shopCategory)} services in this area yet.`, th: `ยังไม่มีบริการประเภท${shopCategoryLabel(shopCategory)}ในพื้นที่นี้`, zh: `这一带还没有${shopCategoryLabel(shopCategory)}服务。` }) : t({ en: 'No services in this area yet.', th: 'ยังไม่มีสถานบริการในพื้นที่นี้', zh: '这一带还没有服务。' })) : kind === 'places' ? t({ en: 'No places in this area yet.', th: 'ยังไม่มีสถานที่ในพื้นที่นี้', zh: '这一带还没有地点。' }) : t({ en: 'No places or services in this area yet.', th: 'ยังไม่มีสถานที่หรือบริการในพื้นที่นี้', zh: '这一带还没有地点或服务。' })}</Body> : null}
    </View>
  );
}

function shopCategoryLabel(category: string): string {
  const labels: Record<string, { en: string; th: string; zh?: string }> = {
    'ที่พัก': { en: 'Accommodation', th: 'ที่พัก', zh: '住宿' },
    'ร้านอาหาร': { en: 'Restaurants', th: 'ร้านอาหาร', zh: '餐厅' },
    'ร้านขายของ': { en: 'Souvenirs & shopping', th: 'ของฝาก/ช้อปปิ้ง', zh: '纪念品与购物' },
    'เช่ารถ': { en: 'Car rental', th: 'เช่ารถ', zh: '租车' },
    'เสริมสวย': { en: 'Beauty', th: 'เสริมสวย', zh: '美容' },
    'ตัดผม': { en: 'Haircuts', th: 'ตัดผม', zh: '理发' },
    'ไกด์นำเที่ยว': { en: 'Tour guide', th: 'ไกด์นำเที่ยว', zh: '导游' },
    'อื่นๆ': { en: 'Other', th: 'อื่นๆ', zh: '其他' },
  };
  return t(labels[category] ?? { en: category, th: category });
}

function ShopCard({ shop, onPress }: { shop: Shop; onPress: () => void }) {
  if (shop.serviceType === 'guide') return <GuideCard shop={shop} onPress={onPress} />;
  return (
    <Pressable onPress={onPress} accessibilityLabel={`${t({ en: 'Service', th: 'บริการ', zh: '服务' })} ${shop.name}`} style={[shadow.card, { width: 204, backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden' }]}>
      {shop.coverUrl ? <Image source={{ uri: shopImageUri(shop.coverUrl) }} style={{ width: '100%', height: 125 }} /> : <View style={{ height: 125, backgroundColor: '#DFF3F8', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 36 }}>🏪</Text></View>}
      <View style={{ padding: 10 }}><Label size={10} colour="#0077B6">{shopCategoryLabel(shop.category)}</Label><Heading size={15}>{shop.name}</Heading><Body size={13} colour="#64748B">{shop.rating === null ? t({ en: 'No reviews yet', th: 'ยังไม่มีรีวิว', zh: '还没有评价' }) : `★ ${shop.rating} (${shop.reviewCount})`}</Body></View>
    </Pressable>
  );
}

function GuideCard({ shop, onPress }: { shop: Shop; onPress: () => void }) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(390, Math.max(260, width - gutter * 2));
  const photo = shop.guideProfilePhotoUrl || shop.coverUrl;
  const area = AREAS.find((item) => item.key === shop.areaKey);
  const tourNames: Record<string, string> = { 'ทัวร์ธรรมชาติ': 'Nature', 'ดำน้ำ': 'Snorkelling', 'เดินป่า': 'Hiking', 'วัฒนธรรม/วัด': 'Culture & temples', 'อาหารท้องถิ่น': 'Local food', 'เที่ยวเกาะ': 'Island hopping' };
  const expertise = [...new Set([...(shop.guideSkills ?? []), ...(shop.guideTourStyles ?? []).map((value) => t({ en: tourNames[value] ?? value, th: value }))])];
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${t({ en: 'View guide profile', th: 'ดูโปรไฟล์ไกด์', zh: '查看导游资料' })} ${shop.name}`} style={[shadow.card, { width: cardWidth, borderRadius: 20, overflow: 'hidden', backgroundColor: '#fff', flexDirection: 'row', minHeight: 224 }]}>
    <View style={{ width: '43%', backgroundColor: '#DFF3F8', minHeight: 224 }}>
      {photo ? <Image source={{ uri: shopImageUri(photo) }} resizeMode="cover" style={{ position: 'absolute', width: '100%', height: '100%' }} /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><UserRound size={52} color="#4195AB" /></View>}
      {shop.guideStatus === 'approved' ? <View style={{ margin: 8, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 12, backgroundColor: '#148764', alignSelf: 'flex-start' }}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>✓ {t({ en: 'Verified', th: 'ตรวจสอบแล้ว', zh: '已验证' })}</Text></View> : null}
    </View>
    <View style={{ flex: 1, padding: 12, gap: 7 }}>
      <Text style={{ color: '#0077B6', fontSize: 11 }}>{t({ en: 'Tour guide', th: 'ไกด์นำเที่ยว', zh: '导游' })}</Text>
      <Text numberOfLines={2} style={{ color: '#123B64', fontWeight: '800', fontSize: 17 }}>{shop.name}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><MapPin size={12} color="#64748B" /><Text numberOfLines={2} style={{ flex: 1, color: '#64748B', fontSize: 11 }}>{area ? t(area.name) : shop.areaKey}</Text></View>
      <Text style={{ color: shop.rating === null ? '#64748B' : '#94620C', fontSize: 11 }}>{shop.rating === null ? t({ en: 'No reviews yet', th: 'ยังไม่มีรีวิว', zh: '还没有评价' }) : `★ ${shop.rating.toFixed(1)} (${shop.reviewCount})`}</Text>
      {shop.guideLanguages.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>{shop.guideLanguages.slice(0, 3).map((name) => <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 9, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: '#EAF7FB' }}><GuideLanguageFlag language={name} size={17} /><Text style={{ color: '#123B64', fontSize: 10 }}>{guideLanguageLabel(name)}</Text></View>)}{shop.guideLanguages.length > 3 ? <Text style={{ color: '#64748B', fontSize: 10 }}>+{shop.guideLanguages.length - 3}</Text> : null}</View> : null}
      {expertise.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>{expertise.slice(0, 2).map((value) => <View key={value} style={{ maxWidth: '100%', borderRadius: 9, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: '#EFF8F4' }}><Text numberOfLines={1} style={{ color: '#276759', fontSize: 10 }}>{value}</Text></View>)}</View> : null}
      <View style={{ marginTop: 'auto', alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', borderRadius: 15, backgroundColor: '#0077B6', paddingHorizontal: 10, paddingVertical: 6 }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{t({ en: 'View profile', th: 'ดูโปรไฟล์', zh: '查看资料' })}</Text><ChevronRight size={13} color="#fff" /></View>
    </View>
  </Pressable>;
}

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
        ...(way ? [way.arrived ? t(strings.place.arrived) : t(strings.place.away(t(way.distance), t(way.direction)))] : []),
      ].join(', ')}
      style={[
        shadow.card,
        {
          width: 204,
          backgroundColor: '#ffffff',
          borderRadius: 24,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: '#E2EFF3',
          shadowColor: '#0077B6',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.10,
          shadowRadius: 10,
          elevation: 3,
        },
      ]}
    >
      {/* A fitted logo sits on its own field colour, so the frame is the venue's panel, not a failed load. */}
      <View style={{ height: 140, backgroundColor: photoBackdrop(place.photo), position: 'relative' }}>
        {place.photo ? (
          <Image
            source={{ uri: photoUri(place.photo.url) }}
            /*
              A logo is drawn to its own edges: cropped to fill, the venue's
              name comes off its own mark. Fitted whole instead.
            */
            resizeMode={fitsWhole(place.photo) ? 'contain' : 'cover'}
            style={{ width: '100%', height: '100%' }}
            accessibilityLabel={`${t(place.name)}, ${t(creditWord(place.photo))} ${place.photo.credit}`}
          />
        ) : (
          <NoPhotograph place={place} />
        )}

        <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 }}>
          <Svg width="100%" height="100%">
            <Defs><LinearGradient id="photoShade" x1="0%" y1="0%" x2="0%" y2="100%"><Stop offset="0" stopColor="#004E64" stopOpacity="0" /><Stop offset="1" stopColor="#004E64" stopOpacity="0.38" /></LinearGradient></Defs>
            <Rect width="100%" height="100%" fill="url(#photoShade)" />
          </Svg>
        </View>
        {/* Top left: Score chip */}
        <View
          style={{
            position: 'absolute', top: 10, left: 10, paddingVertical: 4, paddingHorizontal: 10,
            borderRadius: 16, backgroundColor: high ? '#268250' : '#0077B6',
            flexDirection: 'row', alignItems: 'center', gap: 4,
            shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3,
          }}
        >
          <Heading size={12} colour="#FFFFFF">{String(place.healthyScore)}</Heading>
        </View>

        {/* Top right: Distance badge */}
        {far ? (
          <View
            style={{
              position: 'absolute', top: 10, right: 10, paddingVertical: 4, paddingHorizontal: 10,
              borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.92)',
              shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3,
            }}
          >
            <Label size={10} tracking={0.06} colour={color.neutral800}>{far}</Label>
          </View>
        ) : null}

        {/*
          Bottom left: why this card is at the front. The row is otherwise
          ordered by distance, so a place placed ahead of it says so on its
          own face rather than leaving a reader to assume it is the nearest
          or the best (featured.ts).
        */}
        {isFeatured(place.id) ? (
          <View
            style={{
              position: 'absolute', bottom: 10, left: 10, paddingVertical: 4, paddingHorizontal: 10,
              borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.92)',
              shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3,
            }}
          >
            <Label size={10} tracking={0.06} colour={color.neutral800}>{t(strings.place.featuredBadge)}</Label>
          </View>
        ) : null}
      </View>

      <View style={{ padding: 12 }}>
        <Heading size={16} colour="#03045E">{t(place.name)}</Heading>
        <Label size={9} tracking={0.04} colour="#647F8B" style={{ marginTop: 5, textTransform: 'none' }} >
          {place.meta}
        </Label>
      </View>
    </Pressable>
  );
}

/**
 * Meet your Island Companions hero card:
 * Showcases the 5 Koh Samui companions on the beach with dynamic daylight / sunset imagery,
 * and invites travellers into the 77-province Mascots field guide.
 */
function MascotHeroCard({
  now, onOpen,
}: {
  now: Date;
  onOpen: () => void;
}) {
  const isSunset = now.getHours() >= 17 || now.getHours() < 6;
  return (
    <View style={{ paddingTop: 20, paddingHorizontal: gutter }}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${t({ en: 'Meet your Island Companions', th: 'แก๊งเพื่อนร่วมทางเกาะสมุย', zh: '认识你的岛屿伙伴' })}. ${t({ en: 'Open Field Guide', th: 'เปิดสมุดบันทึกมาสคอต', zh: '打开伙伴图鉴' })}`}
        style={[
          shadow.card,
          {
            backgroundColor: color.surface,
            borderRadius: radius.md,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: color.neutral300,
          },
        ]}
      >
        <View style={{ position: 'relative' }}>
          <Image
            source={{ uri: mascotBeachUri(now) }}
            style={{ width: '100%', aspectRatio: 16 / 10 }}
            resizeMode="cover"
            accessibilityLabel={t(strings.common.companionsAlt)}
          />
          <View
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              paddingVertical: 3,
              paddingHorizontal: 8,
              borderRadius: radius.sm,
              backgroundColor: 'rgba(0,0,0,0.55)',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Sparkles size={11} color="#ffe28a" />
            <Label size={9} tracking={0.08} colour="#ffffff">
              {isSunset
                ? t({ en: 'Golden Hour • Samui', th: 'ช่วงพระอาทิตย์ตก • สมุย', zh: '黄金时刻 • 苏梅岛' })
                : t({ en: 'Daylight • Samui', th: 'ช่วงกลางวัน • สมุย', zh: '白天 • 苏梅岛' })}
            </Label>
          </View>
        </View>

        <View style={{ padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Label size={9} tracking={0.12} colour={color.brand}>
                {t({ en: 'ISLAND COMPANIONS', th: 'แก๊งเพื่อนร่วมทาง', zh: '岛屿伙伴' })}
              </Label>
              <Heading size={15} tracking={-0.3} style={{ marginTop: 2 }}>
                {t({ en: 'Meet your Island Companions', th: 'แก๊งเพื่อนร่วมทางเกาะสมุย', zh: '认识你的岛屿伙伴' })}
              </Heading>
              <Body size={13} colour={color.neutral700} style={{ marginTop: 4 }}>
                {t({
                  en: 'Explore local habitats, collect provincial passport stamps, and hatch companions.',
                  th: 'ออกสำรวจถิ่นที่อยู่ สะสมตราประทับพาสปอร์ต และฟักไข่เพื่อนร่วมทางจากการเดินทางจริง',
                  zh: '探索本地的栖息地，收集各府的护照印章，孵出属于你的伙伴。',
                })}
              </Body>
            </View>
            <ChevronRight size={18} color={color.neutral500} strokeWidth={2.2} />
          </View>
        </View>
      </Pressable>
    </View>
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
    <View style={{ paddingTop: 26 }}>
      <SectionHead
        en="Recommended"
        th="แนะนำสำหรับคุณ"
        zh="为你推荐"
        note={t({ en: "Today's Eco-Adventures", th: "ภารกิจกรีนวันนี้", zh: "今日绿色任务" })}
        onSeeAll={onOpenQuests}
      />

      {quests.error ? (
        <ErrorState message={quests.error} onRetry={quests.reload} />
      ) : quests.loading ? (
        <Body size={13} colour={color.neutral600} style={{ paddingHorizontal: gutter }}>
          {t({ en: 'Loading today’s missions…', th: 'กำลังโหลดภารกิจวันนี้…', zh: '正在加载今天的任务…' })}
        </Body>
      ) : ordered.length === 0 ? (
        <View style={[shadow.card, { marginHorizontal: gutter, padding: 18, borderRadius: 24, backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(14, 165, 233, 0.16)' }]}>
          {finished > 0 ? (
            <Body size={13} colour={color.accent700}>
              {t({
                en: `All ${finished} of today’s missions are done. Nothing left to verify until tomorrow.`,
                th: `ทำภารกิจวันนี้ครบทั้ง ${finished} รายการแล้ว ไม่มีอะไรรอตรวจจนถึงพรุ่งนี้`,
                zh: `今天的 ${finished} 个任务都完成了，明天之前没有要验证的了。`,
              })}
            </Body>
          ) : (
            <Body size={13} colour={color.neutral700}>{t({ en: 'No missions running today. The map still works, and the weekend list usually has something.', th: 'วันนี้ยังไม่มีภารกิจ แผนที่ยังใช้ได้ และรายการสุดสัปดาห์มักมีให้ทำ', zh: '今天没有进行中的任务。地图照常可用，周末的任务列表通常也有可做的。' })}</Body>
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
              accessibilityLabel={t({ en: `See all missions, ${rest} more`, th: `ดูภารกิจทั้งหมด อีก ${rest} รายการ`, zh: `查看全部任务，还有 ${rest} 个` })}
              style={{ marginHorizontal: gutter, marginTop: 10, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Label size={10} tracking={0.12} colour="#0284c7">{t({ en: `${rest} more today`, th: `อีก ${rest} ภารกิจวันนี้`, zh: `今天还有 ${rest} 个` })}</Label>
              <ChevronRight size={16} color="#0284c7" strokeWidth={2} />
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
        marginTop: 12,
        padding: 16,
        backgroundColor: '#ffffff',
        borderRadius: 22,
        borderWidth: started ? 2 : 1,
        borderColor: started ? '#0284c7' : 'rgba(14, 165, 233, 0.18)',
        shadowColor: '#0284c7',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
      }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            {started ? (
              <Label size={9} tracking={0.14} colour="#0284c7">{t({ en: 'IN PROGRESS', th: 'กำลังทำอยู่', zh: '进行中' })}</Label>
            ) : null}
            <View style={{ backgroundColor: 'rgba(14, 165, 233, 0.1)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 }}>
              <Label size={9} tracking={0.06} colour="#0284c7">{t(quest.duration)}</Label>
            </View>
          </View>
          <Heading size={16}>{t(quest.name)}</Heading>
          <Body size={13} colour={color.neutral600} style={{ marginTop: 4 }}>
            {`${t(quest.where)} · ${t(quest.duration)}`}
          </Body>
          <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 4, textTransform: 'none' }}>
            {t(strings.quests.by(quest.host.name))}
          </Label>
        </View>
        <View style={{ backgroundColor: tone.fill, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16 }}>
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
      <SectionHead en="What you’re carrying" th="สิ่งที่คุณสะสมไว้" zh="你随身带着的" />

      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: gutter }}>
        {/*
          The two purses side by side and coloured apart, because this is the
          screen where somebody first learns there are two of them. Green is
          host-verified, gold is self-verified, and the labels say which.
        */}
        <Figure value={green === null ? '—' : green.toLocaleString('en-US')} unit="G" en="Green · verified" th="ตรวจแล้ว" zh="绿色 · 已验证" tone={color.accent700} onPress={onOpenWallet} />
        <Figure value={trip === null ? '—' : trip.toLocaleString('en-US')} unit="T" en="Trip · self" th="บันทึกเอง" zh="旅行 · 自行记录" tone={color.goldDeep} onPress={onOpenWallet} />
      </View>

      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: gutter, marginTop: 10 }}>
        <Figure value={stamps === null ? '—' : String(stamps.visited)} unit={stamps === null ? '' : `/ ${stamps.total}`} en="Provinces" th="จังหวัด" zh="府" tone={color.brand} onPress={onOpenPassport} />
        <Figure value={found === null ? '—' : String(found.found)} unit={found === null ? '' : `/ ${found.total}`} en="Companions" th="เพื่อนร่วมทาง" zh="伙伴" tone={color.brand} onPress={onOpenWallet} />
      </View>

      {wallet.error || passport.error || companions.error ? (
        <Label size={9} tracking={0.04} colour={color.neutral600} style={{ paddingHorizontal: gutter, marginTop: 8, textTransform: 'none' }}>
          {t({
            en: 'Some figures could not be loaded and are shown as —, not as zero.',
            th: 'ตัวเลขบางส่วนโหลดไม่สำเร็จ จึงแสดงเป็น — ไม่ใช่ศูนย์',
            zh: '部分数字没有加载成功，所以显示为 —，而不是零。',
          })}
        </Label>
      ) : null}
    </View>
  );
}

/** One figure in a tappable card. `—` when unknown, which is not the same as 0. */
function Figure({
  value, unit, en, th, zh, tone, onPress,
}: {
  value: string; unit: string; en: string; th: string; zh?: string; tone: string; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${en}, ${value} ${unit}`}
      style={[
        shadow.card,
        {
          flex: 1,
          minHeight: 48,
          padding: 16,
          backgroundColor: '#ffffff',
          borderRadius: 20,
          borderWidth: 1,
          borderColor: 'rgba(14, 165, 233, 0.16)',
          shadowColor: '#0284c7',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 6,
          elevation: 1,
        },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Heading size={24} colour={tone}>{value}</Heading>
        {unit ? <Label size={10} tracking={0.08} colour={color.neutral600}>{unit}</Label> : null}
      </View>
      <Label size={9} tracking={0.08} colour={color.neutral700} style={{ marginTop: 4 }}>{t({ en, th, zh })}</Label>
    </Pressable>
  );
}

/**
 * A card with no photograph yet.
 *
 * Not a grey box, and not somebody else's photograph either: the five campus
 * places had nothing under a licence anywhere in the open sources (Commons,
 * Wikipedia, Openverse, checked on 8 September), so until the team's own
 * photographs land in `public/media/places/` the card wears its habitat -
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
      accessibilityLabel={`${t(place.name)}, ${t(strings.place.noPhotoYet)}`}
      style={{ width: '100%', height: '100%', backgroundColor: habitat.tint, alignItems: 'center', justifyContent: 'center' }}
    >
      {place.id === 'mangrove' ? (
        <Image
          source={{ uri: photoUri('/media/illustrations/mangrove-habitat-v1.jpg') }}
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
/**
 * What this area has on at the top of Home: a fair's directory (docs/66),
 * then the food courts whose stalls take orders ahead, each as the place
 * screen shows it, named (docs/65). The first card floats over the header's
 * curve, the way Conditions does when none of these is here: the card's own
 * 12 above, less 42, puts its top 30 into the header.
 */
function TopCards({ courts, fair, onOpenFair }: {
  courts: ReturnType<typeof stallPlacesIn>;
  fair: Fair | null;
  onOpenFair?: () => void;
}) {
  if (courts.length === 0 && !fair) return null;
  return (
    <View style={{ marginTop: -42, paddingHorizontal: gutter }}>
      {fair && onOpenFair ? <FairCard fair={fair} onOpen={onOpenFair} /> : null}
      {courts.map((c) => <StallsCard key={c.placeId} placeId={c.placeId} placeName={t(c.source.name)} />)}
    </View>
  );
}

/**
 * A fair on in this area (docs/66): its directory, one tap away - which stall
 * is in which lot, found by name, by what it sells or by lot number. An
 * example plan says so on the card, in the coral of everything not real yet.
 */
function FairCard({ fair, onOpen }: { fair: Fair; onOpen: () => void }) {
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${t(fair.name)}. ${t(strings.fair.open)}${fair.example ? `. ${t(strings.fair.example)}` : ''}`}
      style={[shadow.card, {
        marginTop: 12, padding: 14, gap: 12, flexDirection: 'row', alignItems: 'center',
        backgroundColor: color.surface, borderRadius: radius.md, borderWidth: 1, borderColor: color.neutral300,
      }]}
    >
      <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: color.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 26 }}>🧺</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Label size={9} tracking={0.12} colour={color.brand}>{t(strings.fair.kicker)}</Label>
        <Heading size={16} tracking={-0.2} style={{ marginTop: 2 }}>{t(fair.name)}</Heading>
        <Body size={13} colour={color.neutral700} style={{ marginTop: 2 }}>{t(strings.fair.find)}</Body>
        {fair.example ? (
          <Label size={9} tracking={0.08} colour={color.accent2} style={{ marginTop: 4 }}>{t(strings.fair.example)}</Label>
        ) : null}
      </View>
      <ChevronRight size={18} color={color.brand} strokeWidth={2.2} />
    </Pressable>
  );
}

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

/** What runs to this area, fetched here so Home owns one request for it. */
function Bus({ areaKey, onToast }: { areaKey: string; onToast?: (m: string) => void }) {
  const transit = useAsync(() => api.transit(areaKey), [areaKey]);
  return (
    <BusStrip
      routes={transit.data?.routes ?? null}
      campus={transit.data?.campus ?? null}
      loading={transit.loading}
      error={transit.error}
      onToast={onToast}
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
  en, th, zh, note, onSeeAll,
}: { en: string; th: string; zh?: string; note?: string; onSeeAll?: () => void }) {
  return (
    <View style={{ paddingHorizontal: gutter, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View>
        <Heading size={20} colour="#0f2942">{t({ en, th, zh })}</Heading>
        {note ? <Label size={10} tracking={0.08} colour="#0284c7" style={{ marginTop: 2 }}>{note}</Label> : null}
      </View>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} accessibilityRole="button" accessibilityLabel={`${t({ en: 'See all', th: 'ดูทั้งหมด', zh: '查看全部' })}: ${t({ en, th, zh })}`} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Label size={11} tracking={0.08} colour="#0284c7" style={{ fontWeight: '600' }}>{t({ en: 'See all', th: 'ดูทั้งหมด', zh: '查看全部' })}</Label>
        </Pressable>
      ) : null}
    </View>
  );
}
