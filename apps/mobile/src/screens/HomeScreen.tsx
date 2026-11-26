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
  Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ImageSourcePropType,
} from 'react-native';
import { AREAS, areaOfPlace, campusServicesFor, fairsIn, featuredFirst, hasFeatured, isFeatured, stallPlacesIn, type Area, type AreaKey, type Fair, type Localised } from '@chivago/core';
import { setArea, useArea } from '../state/area.ts';
import { areaWords } from '../i18n/area-words.ts';
import { creditWord, fitsWhole, mascotBeachUri, photoBackdrop, photoUri } from '../api/photos.ts';
import { SHOP_CATEGORIES, shopImageUri, type Shop } from '../api/shops.ts';
import { AreaSwitch } from '../components/AreaSwitch.tsx';
import { BoardFeed } from '../components/BoardFeed.tsx';
import { BusStrip } from '../components/BusStrip.tsx';
import { GreeterCard } from '../components/GreeterCard.tsx';
import { GreeterMark } from '../components/GreeterMark.tsx';
import { MonsterFeed } from '../components/MonsterFeed.tsx';
import { StallsCard } from '../components/Stalls.tsx';
import { SeaAndSkyCard } from '../components/SeaAndSky.tsx';
import { GuideLanguageFlag, guideLanguageLabel } from '../components/GuideLanguageFlag.tsx';
import { serviceAppearance, shopCategoryLabel } from '../components/ShopCategory.tsx';
import {
  Grid2X2, Star, ArrowRight, Mic, ScanLine, ChevronDown, ChevronRight, HeartPulse, Leaf, MapPin, Search, Shield, Sparkles, Ticket, Trees, Utensils, Waves,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
/*
  THE MAIN DOORS ARE DRAWINGS, NOT GLYPHS.

  They were lucide line icons tinted to the circle behind them, which is the
  right choice for a toolbar and the wrong one for the front door: seven
  one-weight outlines in seven pastel circles read as a settings menu rather
  than as somewhere to go.

  The supplied artwork is 512px with the drawing filling about a third of
  each, off-centre and at differing sizes - Map sat right of centre and
  Community left, and the two differed by a fifth in size. Pasted in as they
  came, the row stepped up and down. Each is cropped to its own ink, centred,
  and scaled to one optical size by scripts/normalise-menu-icons.py, which is
  kept so the next icon can be made to match rather than guessed at.
*/
import menuMapArt from '../../assets/menu-map-v1.png';
import menuStaysArt from '../../assets/menu-stays-v1.png';
import menuQuestsArt from '../../assets/menu-quests-v1.png';
import menuWalletArt from '../../assets/menu-wallet-v1.png';
import menuDealsArt from '../../assets/menu-deals-v1.png';
import menuPartyArt from '../../assets/menu-party-v1.png';
import menuTravelBoxArt from '../../assets/menu-travel-box-v1.png';
import menuCommunityArt from '../../assets/menu-community-v1.png';
import {
  greetingFor, isHighScore, nearestFirst, passportProgress, strings, wayThere,
  type Quest, type QuestProgress, type ScoredPlace,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { useHere, type Here } from '../state/here.ts';
import { color, gutter, layout, onFill, platformShadow, radius, shadow } from '../theme/index.ts';
import { tint } from '@chivago/tokens';
import { Body, Heading, Label } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { LOCALES, LOCALE_NAMES, setLocale, t, useLocale, type Locale } from '../i18n/locale.ts';
import { formatInteger } from '../i18n/format.ts';
import chivagoLogo from '../../assets/chivago-logo.png';
import { ProfileButton } from '../components/ProfileButton.tsx';
import { TravelHeroBackdrop, WIDE_TABS_AT } from '../components/Shell.tsx';


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
  onOpenMap, onOpenQuests, onOpenQuest, onOpenWallet, onOpenMarket, onOpenFair, onOpenCampus, onOpenPassport,
  onOpenImpact, onOpenConcierge, onOpenSafety, onOpenParty, onOpenProfile, onOpenPlace, onOpenShop, onOpenMascots, onOpenStays, onOpenSummon, onOpenLocalPicks, onOpenCommunity,
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
  /**
   * The summoning (docs/68): a charm from a verified quest or a day checked
   * in, spent on a creature. Reached from the game tab as well; this is the
   * door on Home, for the same reason `onOpenStays` has one.
   */
  onOpenSummon?: () => void;
  /**
   * Local Picks: this area's businesses by category. Reached from "see all"
   * over the service cards, not from a door - the door row is full, and the
   * last thing added to it had to be rescued from under a floating button.
   */
  onOpenLocalPicks?: () => void;
  /** Shared posts from travellers and operators. */
  onOpenCommunity?: () => void;
  /** A fair's market in this area, lot by lot (docs/66). Optional so the older screen tests still render. */
  onOpenFair?: () => void;
  /** A university's booking and services. Optional for the same reason. */
  onOpenCampus?: () => void;
  /** A one-line acknowledgement, for actions that finish without leaving the screen. */
  onToast?: (message: string) => void;
  /** Injected so the greeting is testable rather than whatever the clock says. */
  now?: Date;
}) {
  const { width: viewportWidth } = useWindowDimensions();
  /*
    WHICH HEADER PANEL IS OPEN, held here rather than in the header itself.

    It was the header's own state, and nothing outside the header could clear
    it - so an open menu survived a scroll and sat over the top third of the
    phone for as long as the reader kept reading. A dropdown has to close when
    the page moves under it, and only the ScrollView knows that it did.
  */
  const [headerPanel, setHeaderPanel] = React.useState<MobileHeaderPanel>(null);
  const dashboard = viewportWidth >= 980;
  const mobileHeader = viewportWidth < 700;
  const places = useAsync(() => api.places(), []);
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
  // Food courts here whose stalls take orders ahead (docs/65). Known without
  // the places list, so the card and the layout under it do not wait for
  // /places, and an area without one asks for nothing more.
  const courts = React.useMemo(() => stallPlacesIn(area.key), [area.key]);
  // A fair on in this area (docs/66), offered at the top with the food court.
  const fair = React.useMemo(() => (onOpenFair ? fairsIn(area.key)[0] ?? null : null), [area.key, onOpenFair]);
  const passport = useAsync(() => api.passport(), []);
  const companions = useAsync(() => api.companions(), []);


  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#EDF6F9' }}
      showsVerticalScrollIndicator={false}
      stickyHeaderIndices={mobileHeader ? [0] : undefined}
      /*
        ANY MOVEMENT OF THE PAGE CLOSES AN OPEN HEADER PANEL.

        Both, because they do not cover the same ways of scrolling: the drag
        is a finger on a phone, and `onScroll` is everything else - a wheel, a
        trackpad, a keyboard. The listener is only attached while a panel is
        open, so the usual case costs nothing.
      */
      onScrollBeginDrag={() => setHeaderPanel(null)}
      onScroll={headerPanel === null ? undefined : () => setHeaderPanel(null)}
      scrollEventThrottle={16}
    >
      {mobileHeader ? (
        <MobileHomeHeader
          panel={headerPanel}
          onPanel={setHeaderPanel}
          area={area}
          onChangeArea={setArea}
          onOpenMap={onOpenMap}
          onOpenQuests={onOpenQuests}
          onOpenWallet={onOpenWallet}
          onOpenParty={onOpenParty}
          onOpenCommunity={onOpenCommunity}
          onOpenProfile={onOpenProfile}
        />
      ) : null}
      <Hero
        now={now}
        area={area}
        onChangeArea={setArea}
        onOpenConcierge={onOpenConcierge}
        onOpenProfile={onOpenProfile}
        compactChrome={mobileHeader}
        /*
          The hero's language menu shares `headerPanel` with the phone header's
          three. They are never on screen together - the phone header is under
          700px wide and this is at or above it - so one piece of state covers
          both, and the scroll that closes one closes the other.
        */
        languageOpen={headerPanel === 'language'}
        onLanguageOpen={(next) => setHeaderPanel(next ? 'language' : null)}
      />
      {/*
        Order ahead, first thing under the header, in an area with a food court
        that takes orders ahead (docs/65): at noon on a campus, food is what a
        student opened the app for. An area without one draws nothing here and
        asks for nothing, so the island's Home is unchanged.
      */}
      <TopCards courts={courts} fair={fair} onOpenFair={onOpenFair} onOpenCampus={campusServicesFor(area.key) ? onOpenCampus : undefined} />
      <View style={dashboard ? { flexDirection: 'row', alignItems: 'flex-start', gap: 18, paddingHorizontal: gutter, marginTop: -42 } : undefined}>
        <View style={dashboard ? { flex: 0.9, minWidth: 0 } : undefined}>
          <Conditions places={here} onOpenMap={onOpenMap} overHero={!dashboard && courts.length === 0 && fair === null} />
        </View>
        <View style={dashboard ? { flex: 1.1, minWidth: 0, paddingTop: 38 } : undefined}>
          <Doors
            onOpenMap={onOpenMap}
            onOpenQuests={onOpenQuests}
            onOpenWallet={onOpenWallet}
            onOpenConcierge={onOpenConcierge}
            onOpenImpact={onOpenImpact}
            onOpenSafety={onOpenSafety}
            onOpenParty={onOpenParty}
            onOpenStays={onOpenStays}
            onOpenSummon={onOpenSummon}
            onOpenCommunity={onOpenCommunity}
            onOpenMarket={onOpenMarket ?? onOpenWallet}
          />
          <View style={{ paddingHorizontal: gutter }}>
            <SeaAndSkyCard area={area.key} />
          </View>
        </View>
      </View>
      {/*
        The island's greeter, where the screen stops reporting and starts
        suggesting. Draws nothing in an area without one - see GreeterCard.
      */}
      <GreeterCard area={area.key} />
      <Places places={here} shops={shops} onOpenMap={onOpenMap} onOpenPlace={onOpenPlace ?? onOpenMap} onOpenShop={onOpenShop ?? onOpenMap} onOpenLocalPicks={onOpenLocalPicks} />
      <MarketPromoCard onOpenMarket={onOpenMarket ?? onOpenWallet} />
      {/*
        How to get here, above the board. Somebody who
        is not here yet needs it before anything about what to do once they
        are; somebody who IS here has already scrolled past it. It draws
        nothing at all in an area with no route, so the island is unchanged.
      */}
      <Bus areaKey={area.key} onToast={onToast} />
      <Board areaKey={area.key} onOpenPlace={onOpenPlace ?? onOpenMap} />
      {/*
        The companion sits with the rest of the game layer now, not between the
        places and what is happening around them. A full-width portrait at the
        top of the feed interrupted "around you" before it had started; down
        here it opens the keepsake band - the mascot, then Carrying's points,
        passport and companions - the one stretch of this screen that is about
        YOU rather than the island. The place-first order above it (transit,
        board, then today's missions) is unchanged.
      */}
        <View style={dashboard ? { width: '100%', maxWidth: 760, alignSelf: 'center' } : undefined}>
          <MascotHeroCard now={now} onOpen={onOpenMascots ?? onOpenPassport} />
          <Carrying
            wallet={wallet}
            passport={passport}
            companions={companions}
            onOpenWallet={onOpenWallet}
            onOpenPassport={onOpenPassport}
          />
        </View>
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

type Async<T> = { data: T | null; loading: boolean; error: string | null; reload: () => void };

// ---------------------------------------------------------------------------
// 0. The header: the island's name, your points, and a place to ask
// ---------------------------------------------------------------------------

type MobileHeaderPanel = 'menu' | 'area' | 'language' | null;

/**
 * The phone's persistent top bar.
 *
 * It is the first direct child of Home's ScrollView and is registered as its
 * sticky header. That keeps the actual controls mounted while content moves
 * underneath; duplicating a second visual header after a scroll would lose
 * open menus, focus and accessibility state.
 */
function MobileHomeHeader({
  panel, onPanel,
  area, onChangeArea, onOpenMap, onOpenQuests, onOpenWallet, onOpenParty, onOpenCommunity, onOpenProfile,
}: {
  panel: MobileHeaderPanel;
  onPanel: (next: MobileHeaderPanel) => void;
  area: Area;
  onChangeArea: (next: AreaKey) => void;
  onOpenMap: () => void;
  onOpenQuests: () => void;
  onOpenWallet: () => void;
  onOpenParty: () => void;
  onOpenCommunity?: () => void;
  onOpenProfile: () => void;
}) {
  const locale = useLocale();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const setPanel = (next: MobileHeaderPanel | ((current: MobileHeaderPanel) => MobileHeaderPanel)) =>
    onPanel(typeof next === 'function' ? next(panel) : next);
  const choose = (action: () => void) => {
    onPanel(null);
    action();
  };

  /*
    ESCAPE CLOSES IT, on the web build - which is what chivargo.com serves and
    what a judge opens. React Native has no key events to listen for, so this
    is guarded rather than shimmed; the tap and the scroll close it everywhere.
  */
  React.useEffect(() => {
    if (Platform.OS !== 'web' || panel === null) return undefined;
    const target = typeof document === 'undefined' ? null : document;
    if (!target) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onPanel(null); };
    target.addEventListener('keydown', onKey);
    return () => target.removeEventListener('keydown', onKey);
  }, [panel, onPanel]);
  const menuItems = [
    { key: 'map', label: t({ en: 'Map', th: 'แผนที่', zh: '地图' }), action: onOpenMap },
    { key: 'quests', label: t({ en: 'Game & Quest', th: 'เกมและเควส', zh: '游戏与任务' }), action: onOpenQuests },
    { key: 'wallet', label: t({ en: 'My Backpack', th: 'กระเป๋าของฉัน', zh: '我的背包' }), action: onOpenWallet },
    { key: 'party', label: t({ en: 'Party', th: 'ปาร์ตี้', zh: '队伍' }), action: onOpenParty },
    ...(onOpenCommunity ? [{ key: 'community', label: t({ en: 'Community', th: 'คอมมูนิตี้', zh: '社区' }), action: onOpenCommunity }] : []),
  ];

  return (
    <View
      collapsable={false}
      testID="mobile-sticky-header"
      style={{
        height: 66,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        backgroundColor: 'rgba(255,255,255,0.98)',
        borderBottomWidth: 1,
        borderBottomColor: '#D8E8EF',
        zIndex: 1000,
        elevation: 18,
        ...platformShadow('0 4px 14px rgba(8, 46, 83, 0.13)', { shadowColor: '#082E53', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.13, shadowRadius: 14 }),
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t({ en: 'Open main menu', th: 'เปิดเมนูหลัก', zh: '打开主菜单' })}
        accessibilityState={{ expanded: panel === 'menu' }}
        onPress={() => setPanel((current) => current === 'menu' ? null : 'menu')}
        style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? '#E8F5FA' : '#FFFFFF' })}
      >
        <View style={{ width: 21, gap: 4 }}>
          {[0, 1, 2].map((line) => <View key={line} style={{ height: 2, borderRadius: 1, backgroundColor: '#123B64' }} />)}
        </View>
      </Pressable>

      <Image source={chivagoLogo} resizeMode="contain" accessibilityLabel="ChivarGo" style={{ width: 58, height: 44 }} />
      <View style={{ width: 1, height: 28, backgroundColor: '#D8E8EF' }} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t({ en: `Area: ${t(area.name)}`, th: `พื้นที่: ${t(area.name)}`, zh: `区域：${t(area.name)}` })}
        accessibilityState={{ expanded: panel === 'area' }}
        onPress={() => setPanel((current) => current === 'area' ? null : 'area')}
        style={({ pressed }) => ({ flex: 1, minWidth: 0, height: 42, borderRadius: 21, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: pressed ? '#E8F5FA' : 'transparent' })}
      >
        <MapPin size={17} color="#123B64" />
        <Text numberOfLines={1} style={{ flex: 1, color: '#123B64', fontSize: 13, fontWeight: '700' }}>{t(area.name)}</Text>
        <ChevronDown size={14} color="#123B64" style={{ transform: [{ rotate: panel === 'area' ? '180deg' : '0deg' }] }} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t({ en: `Language: ${LOCALE_NAMES[locale]}`, th: `ภาษา: ${LOCALE_NAMES[locale]}`, zh: `语言：${LOCALE_NAMES[locale]}` })}
        accessibilityState={{ expanded: panel === 'language' }}
        onPress={() => setPanel((current) => current === 'language' ? null : 'language')}
        style={({ pressed }) => ({ height: 42, paddingHorizontal: 7, borderRadius: 21, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: pressed ? '#E8F5FA' : '#FFFFFF', borderWidth: 1, borderColor: '#D8E8EF' })}
      >
        <AppLanguageFlag locale={locale} width={24} />
        <ChevronDown size={13} color="#123B64" />
      </Pressable>
      <ProfileButton onPress={onOpenProfile} tone="light" />

      {/*
        THE TAP THAT CLOSES IT.

        Reaching for the button a second time is not what anybody does with an
        open menu; they tap the page. Sized from the window and hung below the
        header so the header's own buttons still answer, and under the panels
        (z 1001 against their 1002) so their rows still do.

        It overshoots sideways because an absolutely positioned child is laid
        out against the header's padding box, and this has to reach the screen
        edges whatever that padding is.
      */}
      {panel !== null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t({ en: 'Close menu', th: '\u0e1b\u0e34\u0e14\u0e40\u0e21\u0e19\u0e39', zh: '\u5173\u95ed\u83dc\u5355' })}
          onPress={() => onPanel(null)}
          style={{
            position: 'absolute',
            top: 66,
            left: -windowWidth,
            width: windowWidth * 3,
            height: windowHeight,
            zIndex: 1001,
          }}
        />
      ) : null}

      {panel === 'menu' ? (
        <View style={[shadow.card, { position: 'absolute', top: 58, left: 10, width: 218, padding: 7, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBE4EE', zIndex: 1002, elevation: 22 }]}>
          {menuItems.map((item) => (
            <Pressable key={item.key} accessibilityRole="button" onPress={() => choose(item.action)} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 13, borderRadius: 12, justifyContent: 'center', backgroundColor: pressed ? '#E8F5FA' : 'transparent' })}>
              <Heading size={14} colour="#123B64">{item.label}</Heading>
            </Pressable>
          ))}
        </View>
      ) : null}

      {panel === 'area' ? (
        <View style={[shadow.card, { position: 'absolute', top: 58, left: 76, right: 60, padding: 7, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBE4EE', zIndex: 1002, elevation: 22 }]}>
          {AREAS.map((option) => {
            const selected = option.key === area.key;
            return (
              <Pressable key={option.key} accessibilityRole="button" accessibilityLabel={t(option.name)} accessibilityState={{ selected }} onPress={() => choose(() => onChangeArea(option.key))} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 11, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: selected ? '#DDF4FA' : pressed ? '#F2F7F9' : 'transparent' })}>
                <MapPin size={16} color={selected ? color.brand : '#678094'} />
                <Label size={11} colour={selected ? color.brand : color.text} style={{ flex: 1 }}>{t(option.name)}</Label>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {panel === 'language' ? (
        <View style={[shadow.card, { position: 'absolute', top: 58, right: 54, width: 176, padding: 7, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBE4EE', zIndex: 1002, elevation: 22 }]}>
          {LOCALES.map((option) => {
            const selected = option === locale;
            return (
              <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => choose(() => { void setLocale(option); })} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: selected ? '#DDF4FA' : pressed ? '#F2F7F9' : 'transparent' })}>
                <AppLanguageFlag locale={option} width={28} />
                <Label size={11} colour={selected ? color.brand : color.text} style={{ flex: 1 }}>{LOCALE_NAMES[option]}</Label>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** Native SVG keeps the ocean gradient and waves identical on web and phones. */
function OceanBackdrop({ subtle = false }: { subtle?: boolean }) {
  return (
    <View accessible={false} style={[StyleSheet.absoluteFillObject, { pointerEvents: 'none' }]}>
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

function Hero({
  now, area, onChangeArea, onOpenConcierge, onOpenProfile, compactChrome = false,
  languageOpen = false, onLanguageOpen,
}: {
  now: Date; area: Area; onChangeArea: (next: AreaKey) => void;
  onOpenConcierge: () => void; onOpenProfile: () => void;
  compactChrome?: boolean;
  languageOpen?: boolean;
  onLanguageOpen?: (next: boolean) => void;
}) {
  return (
    <View style={{ position: 'relative', backgroundColor: '#028090', minHeight: compactChrome ? 260 : 330, paddingHorizontal: gutter, paddingTop: compactChrome ? 26 : 58, paddingBottom: 82, overflow: 'hidden' }}>
      <TravelHeroBackdrop focalPoint="right" />
      {compactChrome ? null : <LanguageFlagMenu open={languageOpen} onOpen={onLanguageOpen} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#D5F6FF', fontSize: 12, fontWeight: '500', letterSpacing: 1.8, textTransform: 'uppercase' }}>{t(greetingFor(now))}</Text>
          <Heading size={28} colour="#FFFFFF" style={{ marginTop: 5 }}>{t(area.name)}</Heading>
        </View>
        {compactChrome ? null : <Image
          source={chivagoLogo}
          resizeMode="contain"
          accessibilityLabel="ChivarGo"
          style={{ width: 68, height: 48, marginLeft: 8, marginRight: 12 }}
        />}
        {compactChrome ? null : <ProfileButton onPress={onOpenProfile} />}
      </View>
      {compactChrome ? null : <AreaSwitch area={area.key} onChange={onChangeArea} tone="inverted" />}
      {/*
        The greeter stands beside the promise, not over it. A row rather than
        anything absolutely positioned: the headline keeps whatever width is
        left, the mark never covers a word of it at any screen size, and an
        area without a greeter draws nothing and leaves the row as it was.
      */}
      <View style={{ marginTop: 18, maxWidth: 720, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Heading size={34} tracking={-0.7} colour="#FFFFFF" style={{ maxWidth: 560 }}>
            {t({ en: 'Discover. Travel. Remember.', th: 'ค้นหา เดินทาง และจดจำ', zh: '探索、旅行、铭记。' })}
          </Heading>
          <Body size={13} colour="#E8FBFF" style={{ marginTop: 6, maxWidth: 520 }}>
            {t(areaWords(area).homeTagline)}
          </Body>
        </View>
        <GreeterMark area={area.key} />
      </View>
      <Pressable onPress={onOpenConcierge} accessibilityRole="button" accessibilityLabel={t({ en: 'Ask where to go', th: 'ถามว่าไปไหนดี', zh: '问问去哪儿好' })}
        style={{ marginTop: 20, minHeight: 58, maxWidth: 720, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 29, ...platformShadow('0 8px 20px rgba(0, 59, 82, 0.22)', { shadowColor: '#003B52', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 20, elevation: 7 }), borderWidth: 1, borderColor: 'rgba(255,255,255,0.72)' }}>
        <Search size={21} color="#78909C" />
        <Body colour="#78909C" style={{ flex: 1 }}>{t({ en: 'Where to go today?', th: 'วันนี้ไปไหนดี?', zh: '今天去哪儿好？' })}</Body>
        <ScanLine size={21} color="#0077B6" />
        <Mic size={21} color="#0077B6" />
      </Pressable>
    </View>
  );
}

function AppLanguageFlag({ locale, width = 28 }: { locale: Locale; width?: number }) {
  const height = Math.round(width * 2 / 3);
  return (
    <View style={{ width, height, borderRadius: Math.max(2, width * 0.12), overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(15,50,70,0.18)' }}>
      <Svg width={width} height={height} viewBox="0 0 36 24" preserveAspectRatio="none">
        {locale === 'th' ? (
          <>
            <Rect width="36" height="24" fill="#A51931" />
            <Rect y="4" width="36" height="16" fill="#F4F5F8" />
            <Rect y="8" width="36" height="8" fill="#2D2A75" />
          </>
        ) : locale === 'zh' ? (
          <>
            <Rect width="36" height="24" fill="#DE2910" />
            <Path d="M7 2.5 L8.2 6 L11.8 6 L8.9 8.1 L10 11.6 L7 9.5 L4 11.6 L5.1 8.1 L2.2 6 L5.8 6 Z" fill="#FFDE00" />
            <Path d="M14 3 L14.6 4.5 L16.2 4.6 L15 5.6 L15.4 7.1 L14 6.2 L12.7 7.1 L13.1 5.6 L11.9 4.6 L13.5 4.5 Z" fill="#FFDE00" />
            <Path d="M17 7 L17.6 8.5 L19.2 8.6 L18 9.6 L18.4 11.1 L17 10.2 L15.7 11.1 L16.1 9.6 L14.9 8.6 L16.5 8.5 Z" fill="#FFDE00" />
          </>
        ) : (
          <>
            <Rect width="36" height="24" fill="#012169" />
            <Path d="M0 0 L36 24 M36 0 L0 24" stroke="#FFFFFF" strokeWidth="6" />
            <Path d="M0 0 L36 24 M36 0 L0 24" stroke="#C8102E" strokeWidth="2.5" />
            <Rect x="14" width="8" height="24" fill="#FFFFFF" />
            <Rect y="8" width="36" height="8" fill="#FFFFFF" />
            <Rect x="16" width="4" height="24" fill="#C8102E" />
            <Rect y="10" width="36" height="4" fill="#C8102E" />
          </>
        )}
      </Svg>
    </View>
  );
}

/** A quick language switch at the first place every visitor sees. */
/**
 * The language flag on the wide hero, and the list it opens.
 *
 * SHUTS THE WAY THE PHONE HEADER'S PANELS DO. It had the same single exit
 * they did - press the flag again - so a reader who clicked the page or
 * scrolled was left with the list sitting over the hero. `open` is the
 * screen's state for the same reason it is there: only the ScrollView knows
 * the page moved.
 *
 * The sheet that takes the click is clipped to the hero, which has
 * `overflow: 'hidden'`. That is the band the menu sits in and the band a
 * reader clicks to dismiss it; a click further down the page is caught by the
 * scroll instead.
 */
function LanguageFlagMenu({ open, onOpen }: { open: boolean; onOpen?: (next: boolean) => void }) {
  const locale = useLocale();
  const setOpen = (next: boolean) => onOpen?.(next);

  React.useEffect(() => {
    if (Platform.OS !== 'web' || !open) return undefined;
    const target = typeof document === 'undefined' ? null : document;
    if (!target) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onOpen?.(false); };
    target.addEventListener('keydown', onKey);
    return () => target.removeEventListener('keydown', onKey);
  }, [open, onOpen]);

  return (
    <View style={{ position: 'absolute', top: 12, left: gutter, zIndex: 30, elevation: 30 }}>
      {open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t({ en: 'Close the language list', th: '\u0e1b\u0e34\u0e14\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e20\u0e32\u0e29\u0e32', zh: '\u5173\u95ed\u8bed\u8a00\u5217\u8868' })}
          onPress={() => setOpen(false)}
          style={{ position: 'absolute', top: -400, left: -1000, width: 3000, height: 1400 }}
        />
      ) : null}
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityLabel={t({ en: `Language: ${LOCALE_NAMES[locale]}`, th: `ภาษา: ${LOCALE_NAMES[locale]}`, zh: `语言：${LOCALE_NAMES[locale]}` })}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => ({
          minWidth: 64, height: 38, paddingHorizontal: 10, borderRadius: 19,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
          backgroundColor: pressed ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.95)',
          borderWidth: 1, borderColor: 'rgba(255,255,255,0.92)',
          ...platformShadow('0 3px 8px rgba(0, 59, 82, 0.18)', { shadowColor: '#003B52', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 8 }),
        })}
      >
        <AppLanguageFlag locale={locale} width={28} />
        <ChevronDown size={15} color="#164D73" strokeWidth={2.2} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </Pressable>
      {open ? (
        <View style={[shadow.card, {
          width: 178, marginTop: 7, padding: 6, borderRadius: 16,
          backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBE4EE', gap: 2,
        }]}>
          {LOCALES.map((option) => {
            const selected = option === locale;
            return (
              <Pressable
                key={option}
                onPress={() => { void setLocale(option); setOpen(false); }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={LOCALE_NAMES[option]}
                style={({ pressed }) => ({
                  minHeight: 44, paddingHorizontal: 10, borderRadius: 12,
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: selected ? '#DDF4FA' : pressed ? '#F2F7F9' : 'transparent',
                })}
              >
                <AppLanguageFlag locale={option} width={30} />
                <Label size={11} colour={selected ? color.brand : color.text} style={{ flex: 1 }}>{LOCALE_NAMES[option]}</Label>
                {selected ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.brand }} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
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
        ...platformShadow('0 3px 10px rgba(0, 119, 182, 0.06)', { shadowColor: '#0077B6', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 }),
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
  onOpenStays, onOpenMarket, onOpenSummon, onOpenCommunity,
}: {
  onOpenMap: () => void; onOpenQuests: () => void; onOpenWallet: () => void; onOpenConcierge: () => void;
  onOpenImpact: () => void; onOpenSafety: () => void; onOpenParty: () => void; onOpenStays?: () => void;
  onOpenMarket: () => void; onOpenSummon?: () => void; onOpenCommunity?: () => void;
}) {
  type Door = {
    art?: ImageSourcePropType;
    icon?: LucideIcon;
    name: Localised;
    accessibilityName?: Localised;
    onPress: () => void;
  };
  const doors: Door[] = [
    { art: menuMapArt, name: strings.tabs.map, onPress: onOpenMap },
    { art: menuStaysArt, name: strings.ask.context, onPress: onOpenStays ?? onOpenConcierge },
    { art: menuQuestsArt, name: strings.tabs.quests, onPress: onOpenQuests },
    { art: menuWalletArt, name: strings.tabs.wallet, onPress: onOpenWallet },
    { art: menuDealsArt, name: { en: 'Deals', th: 'สิทธิพิเศษ', zh: '优惠' }, onPress: onOpenMarket },
    {
      art: menuPartyArt,
      name: { en: 'Party', th: 'ปาร์ตี้', zh: '队伍' },
      accessibilityName: { en: 'Party', th: 'ปาร์ตี้', zh: '队伍' },
      onPress: onOpenParty,
    },
    /*
      The summoning (docs/68), on Home.

      It was three taps inside the game tab, which is exactly how the Stays
      door was lost - docs/61 records the owner not finding that screen - and
      this is the same fix: a door on the surface somebody actually opens.

      LILAC FROM THE TOKEN SET, not a hex typed in here. The illustrated doors
      predate `tint` and carry their own hand-mixed pairs; another one adding
      to that pile is another place to fix later. Lilac also keeps it off
      gold, which on this screen belongs to points - and the summoning takes
      no points and pays none out.

      A SHELL, not dice, a gift or a four-leaf clover. lucide has all three,
      and each one would be the interface calling this a gamble or a prize -
      the two words docs/68 spent a legal argument refusing, and the two the
      server still scans its own result payloads for. A shell is something
      picked up by being on the island, which is where the charm came from.

      Rendered only when the door has somewhere to go. A screen test that
      predates this prop shows five doors rather than a sixth that does
      nothing, which is the rule the place cards above already follow.
    */
    /*
      THE DOOR'S NAME CHANGED WITH WHAT IS BEHIND IT. It read "Summon" while
      the box held invented spirits alone and cost a charm. It now holds the
      fashion as well and costs Trip Points, so it is named for the box
      rather than for the act.

      THE SHELL STAYS, and the paragraph above it still applies: lucide has
      dice, a gift and a four-leaf clover, and each one would be the
      interface calling this a gamble or a prize - the two words docs/68
      spent a legal argument refusing and the two the server still scans its
      own result payloads for. Lilac keeps it off gold, which on this screen
      belongs to points.
    */
    ...(onOpenSummon
      ? [{
        art: menuTravelBoxArt,
        /*
          Keep the product name identical in every locale. "Gashapon" is
          short enough for the crowded door row and matches the machine art,
          while the destination screen can still explain how the draw works.
        */
        name: { en: 'Gashapon', th: 'Gashapon', zh: 'Gashapon' },
        onPress: onOpenSummon,
      }]
      : []),
    ...(onOpenCommunity
      ? [{
        art: menuCommunityArt,
        name: { en: 'Community', th: 'คอมมูนิตี้', zh: '社区' },
        onPress: onOpenCommunity,
      }]
      : []),
  ];
  /*
    ONE ROW WHEN THEY FIT, TWO WHEN THEY DO NOT.

    The full set in one row on a 375px phone makes every cell too narrow.
    "Community" alone is 62px at this size, while Thai labels often have no
    spaces to break at. Shrinking the type until it fitted meant 10px for
    every label, which is too small to read.

    So below `DOOR_MIN` per door the row WRAPS, with every door still on
    screen. Not a sideways scroll: a door you have to swipe to find is the
    exact failure docs/61 records - the owner not finding a screen that was
    one gesture away. The last row is centred so a short row reads as the end
    of the set rather than as a gap.
  */
  //
  // DECIDED BEFORE THE FIRST FRAME, refined after it. Below the width where
  // the rail appears, the row spans the window, so the window says how wide
  // it is without waiting for a layout pass - waiting drew one frame of
  // overlapped labels first, and in a backgrounded tab the measurement can
  // be held back entirely. Above that width the content is beside the rail
  // and always roomy enough for one row. `onLayout` then corrects either
  // guess with the real width.
  const { width: viewport } = useWindowDimensions();
  const pad = Math.max(8, gutter - 8);
  // A measurement counts only at the window width it was taken at. Without
  // that, a row measured on a phone stayed wrapped after the window grew to
  // a desktop - four doors to a 1,400px row - until a fresh layout pass
  // happened to arrive.
  const [measured, setMeasured] = React.useState<{ width: number; at: number } | null>(null);
  const setRow = (width: number) => setMeasured({ width, at: viewport });
  const row = measured && measured.at === viewport && measured.width > 0
    ? measured.width
    : (viewport < WIDE_TABS_AT ? viewport - 2 * pad : Number.POSITIVE_INFINITY);
  const perRow = row / doors.length < DOOR_MIN
    ? Math.max(1, Math.min(doors.length, Math.floor(row / DOOR_MIN)))
    : doors.length;
  const wrapped = perRow < doors.length;
  return (
    <View
      onLayout={(e) => setRow(e.nativeEvent.layout.width - 2 * Math.max(8, gutter - 8))}
      style={{
        flexDirection: 'row',
        flexWrap: wrapped ? 'wrap' : 'nowrap',
        justifyContent: wrapped ? 'center' : 'flex-start',
        rowGap: wrapped ? 6 : 0,
        paddingHorizontal: Math.max(8, gutter - 8),
        paddingTop: 22,
      }}
    >
      {doors.map(({ art, icon: PlaceholderIcon, name, accessibilityName, onPress }) => (
        <Pressable key={name.en} onPress={onPress} accessibilityRole="button" accessibilityLabel={t(accessibilityName ?? name)}
          style={wrapped
            ? { width: `${100 / perRow}%`, alignItems: 'center', gap: 8, minHeight: 96 }
            : { flex: 1, alignItems: 'center', gap: 8, minHeight: 96 }}>
          {/*
            NO DISC BEHIND THE DRAWING. The tinted circle was there to give a
            one-weight line icon something to sit on; these drawings carry
            their own colour and shadow, and the circle only boxed them in.

            The 52px square stays, empty. It is what the row measures itself
            against - `DOOR_MIN` and the wrap arithmetic are in these units -
            and it keeps the labels on one baseline whether a drawing is tall
            or wide. Taking it out would reflow the row for no visible gain.
          */}
          <View style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
            {/*
              46 now, against 34 inside the circle and the old glyph's 25:
              without a disc to sit on, a drawing has to hold the space by
              itself. `contain` because the normalising step squares the
              canvas but not the drawing - the wallet is square, the gashapon
              is wide - and stretching them to fill would undo that work.
            */}
            {art
              ? <Image source={art} style={{ width: 46, height: 46 }} resizeMode="contain" />
              : PlaceholderIcon
                ? <PlaceholderIcon size={34} color="#607D8B" strokeWidth={1.8} />
                : null}
          </View>
          <Text style={{ fontSize: 12, color: '#2B2D42', textAlign: 'center', paddingHorizontal: 2 }}>{t(name)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * The narrowest a door may be before the row wraps.
 *
 * Long labels may use an intentional line break. 72px still leaves enough
 * room for each tap target while the row wraps instead of becoming a carousel.
 */
export const DOOR_MIN = 72;

/**
 * The travel marketplace, as a card under the places.
 *
 * Its icon is on a flat tint, not green: a deal is something to spend points
 * on, not something a host verified.
 */
function MarketPromoCard({ onOpenMarket }: { onOpenMarket: () => void }) {
  const area = useArea();
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
            {t(areaWords(area).perksBody)}
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
  places, shops, onOpenMap, onOpenPlace, onOpenShop, onOpenLocalPicks,
}: { places: Async<ScoredPlace[]>; shops: Async<Shop[]>; onOpenMap: () => void; onOpenPlace: (id: string) => void; onOpenShop: (id: string) => void; onOpenLocalPicks?: () => void }) {
  const { width } = useWindowDimensions();
  // This is a rail, never a grid. Fixed, readable cards keep every result on
  // one horizontal line and let touch and trackpad users keep
  // moving right through the complete list without a second row appearing.
  const cardWidth = width < 420 ? Math.min(280, width - gutter * 2 - 24) : width < 900 ? 280 : 300;
  const categories = [...new Set([...SHOP_CATEGORIES, 'กีฬาและนันทนาการ', ...(shops.data ?? []).map(shop => shop.category)])];
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
  return (
    <View style={{ paddingTop: 26 }}>
      <SectionHead
        en="Places in this area"
        th="สถานที่ในพื้นที่นี้"
        zh="这一带的地点"
        note={noteForOrder(pinned, here !== null)}
        /*
          Services has a screen of its own now; places still belong to the
          map. One head, two destinations, because "see all" over a list of
          shops that lands on a map answers a different question.
        */
        onSeeAll={kind === 'shops' && onOpenLocalPicks ? onOpenLocalPicks : onOpenMap}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: gutter, gap: 8, paddingBottom: 4 }}>
        {([['all', { en: 'All', th: 'ทั้งหมด', zh: '全部' }], ['places', { en: 'Places', th: 'สถานที่', zh: '地点' }], ['shops', { en: 'Services', th: 'สถานบริการ', zh: '服务' }]] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: kind === value }} onPress={() => setKind(value)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: kind === value ? '#0077B6' : '#E1F2F7' }}><Text style={{ color: kind === value ? '#fff' : '#123B64', fontSize: 12, fontWeight: '700' }}>{t(label)}</Text></Pressable>)}
      </ScrollView>
      {kind === 'shops' ? <View style={{ paddingTop: 10 }}>
        <Label size={11} colour="#123B64" style={{ paddingHorizontal: gutter, paddingBottom: 6 }}>{t({ en: 'Service category', th: 'ประเภทบริการ', zh: '服务类别' })}</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: gutter, gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: !shopCategory }} onPress={() => setShopCategory('')} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: !shopCategory ? '#0077B6' : '#E1F2F7' }}><Text style={{ color: !shopCategory ? '#fff' : '#123B64', fontSize: 12, fontWeight: '700' }}>{t({ en: 'All', th: 'ทั้งหมด', zh: '全部' })}</Text></Pressable>
          {categories.map((category) => <Pressable key={category} accessibilityRole="button" accessibilityState={{ selected: shopCategory === category }} onPress={() => setShopCategory(category)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: shopCategory === category ? '#0077B6' : '#E1F2F7' }}><Text style={{ color: shopCategory === category ? '#fff' : '#123B64', fontSize: 12, fontWeight: '700' }}>{shopCategoryLabel(category)}</Text></Pressable>)}
        </ScrollView>
      </View> : null}
      {places.error && kind !== 'shops' ? <Pressable onPress={places.reload} style={{ paddingHorizontal: gutter, paddingTop: 8 }}><Body size={13} colour="#B91C1C">{t({ en: 'Could not load places. Try again.', th: 'โหลดสถานที่ไม่สำเร็จ · ลองใหม่', zh: '地点加载失败 · 请重试' })}</Body></Pressable> : null}
      {shops.error && kind !== 'places' ? <Pressable onPress={shops.reload} style={{ paddingHorizontal: gutter, paddingTop: 8 }}><Body size={13} colour="#B91C1C">{t({ en: 'Could not load services. Try again.', th: 'โหลดบริการไม่สำเร็จ · ลองใหม่', zh: '服务加载失败 · 请重试' })}</Body></Pressable> : null}
      {loading ? <Body size={13} style={{ paddingHorizontal: gutter, paddingTop: 8 }}>{t({ en: 'Loading this area…', th: 'กำลังโหลดข้อมูลในพื้นที่...', zh: '正在加载这一带的信息…' })}</Body> : null}
      {shownPlaces.length || shownShops.length ? (
      <ScrollView
        testID="places-horizontal-list"
        horizontal
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: gutter, gap: 16, paddingVertical: 16, alignItems: 'stretch' }}
      >
        {shownPlaces.map((p) => (
          <PlaceCard key={p.id} width={cardWidth} place={p} here={here} onPress={() => onOpenPlace(p.id)} />
        ))}
        {shownShops.map((shop) => <ShopCard key={shop.id} width={cardWidth} shop={shop} onPress={() => onOpenShop(shop.id)} />)}
      </ScrollView>
      ) : !loading && !places.error && !shops.error ? <Body style={{ padding: 24, marginHorizontal: gutter, marginTop: 16, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#DCECF3', textAlign: 'center' }} colour={color.neutral700}>{kind === 'shops' ? (shopCategory ? t({ en: `No ${shopCategoryLabel(shopCategory)} services in this area yet.`, th: `ยังไม่มีบริการประเภท${shopCategoryLabel(shopCategory)}ในพื้นที่นี้`, zh: `这一带还没有${shopCategoryLabel(shopCategory)}服务。` }) : t({ en: 'No services in this area yet.', th: 'ยังไม่มีสถานบริการในพื้นที่นี้', zh: '这一带还没有服务。' })) : kind === 'places' ? t({ en: 'No places in this area yet.', th: 'ยังไม่มีสถานที่ในพื้นที่นี้', zh: '这一带还没有地点。' }) : t({ en: 'No places or services in this area yet.', th: 'ยังไม่มีสถานที่หรือบริการในพื้นที่นี้', zh: '这一带还没有地点或服务。' })}</Body> : null}
    </View>
  );
}

function ShopCard({ shop, onPress, width }: { shop: Shop; onPress: () => void; width: number }) {
  const [failedPhoto, setFailedPhoto] = React.useState<string | null>(null);
  const [focused, setFocused] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const guide = shop.serviceType === 'guide';
  const category = guide ? 'ไกด์นำเที่ยว' : shop.category;
  const { icon: Icon, accent, pale } = serviceAppearance[category] ?? { icon: Grid2X2, accent: '#6261AF', pale: '#EFEEFF' };
  const photo = guide ? shop.guideProfilePhotoUrl || shop.coverUrl : shop.coverUrl;
  const rated = shop.rating !== null && shop.reviewCount > 0;
  return <Pressable onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}
    accessibilityRole="button" accessibilityLabel={`${shopCategoryLabel(category)}: ${shop.name}`}
    style={({ pressed }) => [shadow.card, { width, minWidth: 0, borderRadius: 22, backgroundColor: '#fff', overflow: 'hidden', borderWidth: 2, borderColor: focused ? '#0077B6' : hovered ? '#9AD6EA' : '#E0EEF5', opacity: pressed ? 0.8 : 1, transform: [{ translateY: hovered ? -2 : 0 }] }]}>
    <View style={{ aspectRatio: 1.55, backgroundColor: pale, alignItems: 'center', justifyContent: 'center' }}>
      {photo && failedPhoto !== photo ? <Image source={{ uri: shopImageUri(photo) }} resizeMode="cover" onError={() => setFailedPhoto(photo)} style={{ width: '100%', height: '100%' }} /> : <Icon size={48} color={accent} strokeWidth={1.3} />}
    </View>
    <View style={{ paddingHorizontal: 16, paddingBottom: 16, flex: 1 }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 5, borderColor: '#fff', backgroundColor: accent, alignItems: 'center', justifyContent: 'center', marginTop: -26, marginBottom: 10 }}><Icon size={23} color="#fff" /></View>
      <Text style={{ color: accent, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '700', marginBottom: 6 }}>{shopCategoryLabel(category)}</Text>
      <Text numberOfLines={2} style={{ fontSize: 17, lineHeight: 24, fontWeight: '700', color: '#102F55', minHeight: 48 }}>{shop.name}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginVertical: 8 }}>
        <Star size={14} color={rated ? '#B67918' : '#8298A8'} />
        <Text style={{ fontSize: 12, color: '#60778C', flexShrink: 1 }}>{rated ? `${shop.rating!.toFixed(1)} (${shop.reviewCount})` : t({ en: 'No reviews yet', th: 'ยังไม่มีรีวิว', zh: '还没有评价' })}</Text>
      </View>
      {shop.description ? <Text numberOfLines={2} style={{ color: '#60778C', fontSize: 13, lineHeight: 20, marginBottom: 12 }}>{shop.description}</Text> : null}
      {guide && shop.guideLanguages.length > 0 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>{shop.guideLanguages.slice(0, 3).map(language => <View key={language} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 5, borderRadius: 8, backgroundColor: pale }}><GuideLanguageFlag language={language} size={17} /><Text style={{ fontSize: 11, color: '#123B64' }}>{guideLanguageLabel(language)}</Text></View>)}</View> : null}
      <View style={{ marginTop: 'auto', paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <Text style={{ color: accent, fontSize: 13, flexShrink: 1, fontWeight: '600' }}>{t({ en: 'View details', th: 'ดูรายละเอียด', zh: '查看详情' })}</Text>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: pale, alignItems: 'center', justifyContent: 'center' }}><ArrowRight size={17} color={accent} /></View>
      </View>
    </View>
  </Pressable>;
}

const PLACE_CATEGORY: Record<string, { label: Localised; Icon: LucideIcon; accent: string; pale: string }> = {
  Beach: { label: { en: 'Beach', th: 'ชายหาด', zh: '海滩' }, Icon: Waves, accent: '#087EA4', pale: '#DFF5FB' },
  Hospital: { label: { en: 'Hospital', th: 'โรงพยาบาล', zh: '医院' }, Icon: HeartPulse, accent: '#B23A48', pale: '#FCE8EB' },
  Museum: { label: { en: 'Museum', th: 'พิพิธภัณฑ์', zh: '博物馆' }, Icon: Sparkles, accent: '#7653A6', pale: '#F0EAF8' },
  'Palace grounds': { label: { en: 'Historic place', th: 'สถานที่ประวัติศาสตร์', zh: '历史景点' }, Icon: Sparkles, accent: '#9A6515', pale: '#FFF3D8' },
  'Ferry pier': { label: { en: 'Ferry pier', th: 'ท่าเรือเฟอร์รี', zh: '渡轮码头' }, Icon: MapPin, accent: '#087EA4', pale: '#DFF5FB' },
  'Shops and food': { label: { en: 'Shops & food', th: 'ร้านค้าและอาหาร', zh: '商店与餐饮' }, Icon: Utensils, accent: '#A45B18', pale: '#FFF0DC' },
  Accommodation: { label: { en: 'Accommodation', th: 'ที่พัก', zh: '住宿' }, Icon: Grid2X2, accent: '#087EA4', pale: '#DFF5FB' },
  Park: { label: { en: 'Park', th: 'สวนสาธารณะ', zh: '公园' }, Icon: Trees, accent: '#267A50', pale: '#E3F5E9' },
  'Green space': { label: { en: 'Green space', th: 'พื้นที่สีเขียว', zh: '绿地' }, Icon: Trees, accent: '#267A50', pale: '#E3F5E9' },
  'Healthy food': { label: { en: 'Healthy food', th: 'อาหารเพื่อสุขภาพ', zh: '健康餐饮' }, Icon: Utensils, accent: '#A45B18', pale: '#FFF0DC' },
  'Food court': { label: { en: 'Food court', th: 'ศูนย์อาหาร', zh: '美食广场' }, Icon: Utensils, accent: '#A45B18', pale: '#FFF0DC' },
  Wellness: { label: { en: 'Wellness', th: 'สุขภาวะ', zh: '康养' }, Icon: HeartPulse, accent: '#B23A48', pale: '#FCE8EB' },
  Landmark: { label: { en: 'Landmark', th: 'แลนด์มาร์ก', zh: '地标' }, Icon: MapPin, accent: '#7653A6', pale: '#F0EAF8' },
  Library: { label: { en: 'Library', th: 'ห้องสมุด', zh: '图书馆' }, Icon: Grid2X2, accent: '#315F91', pale: '#E7F0FA' },
};

function placeAppearance(place: ScoredPlace): { label: string; Icon: LucideIcon; accent: string; pale: string } {
  const raw = place.meta.split(' · ')[0]?.trim() || 'Place';
  const known = PLACE_CATEGORY[raw];
  if (known) return { ...known, label: t(known.label) };
  return { label: t({ en: raw, th: 'สถานที่', zh: '地点' }), Icon: MapPin, accent: '#087EA4', pale: '#DFF5FB' };
}

function PlaceCard({ place, here, onPress, width = 204 }: { place: ScoredPlace; here: Here | null; onPress: () => void; width?: number }) {
  const high = isHighScore(place.healthyScore);
  const way = here ? wayThere(here, place) : null;
  const far = way ? (way.arrived ? t(strings.place.arrivedShort) : t(way.distance)) : null;
  const { label: category, Icon, accent, pale } = placeAppearance(place);
  const rated = place.reviews.average !== null && place.reviews.count > 0;

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
          width,
          backgroundColor: '#ffffff',
          borderRadius: 24,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: '#E2EFF3',
          ...platformShadow('0 4px 10px rgba(0, 119, 182, 0.10)', { shadowColor: '#0077B6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 10, elevation: 3 }),
        },
      ]}
    >
      {/* A fitted logo sits on its own field colour, so the frame is the venue's panel, not a failed load. */}
      <View style={{ aspectRatio: 1.55, backgroundColor: photoBackdrop(place.photo), position: 'relative' }}>
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

        <View style={{ pointerEvents: 'none', position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 }}>
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
            ...platformShadow('0 1px 3px rgba(0, 0, 0, 0.12)', { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3 }),
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
              ...platformShadow('0 1px 3px rgba(0, 0, 0, 0.12)', { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3 }),
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
              ...platformShadow('0 1px 3px rgba(0, 0, 0, 0.12)', { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3 }),
            }}
          >
            <Label size={10} tracking={0.06} colour={color.neutral800}>{t(strings.place.featuredBadge)}</Label>
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 16, flex: 1 }}>
        <View testID={`place-category-icon-${place.id}`} style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 5, borderColor: '#fff', backgroundColor: accent, alignItems: 'center', justifyContent: 'center', marginTop: -26, marginBottom: 10 }}>
          <Icon size={23} color="#fff" />
        </View>
        <Text style={{ color: accent, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '700', marginBottom: 6 }}>{category}</Text>
        <Text numberOfLines={2} style={{ fontSize: 17, lineHeight: 24, fontWeight: '700', color: '#102F55', minHeight: 48 }}>{t(place.name)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginVertical: 8 }}>
          <Star size={14} color={rated ? '#B67918' : '#8298A8'} />
          <Text style={{ fontSize: 12, color: '#60778C', flexShrink: 1 }}>
            {rated ? `${place.reviews.average!.toFixed(1)} (${place.reviews.count})` : t({ en: 'No reviews yet', th: 'ยังไม่มีรีวิว', zh: '还没有评价' })}
          </Text>
        </View>
        <Text numberOfLines={3} style={{ color: '#60778C', fontSize: 13, lineHeight: 20, marginBottom: 12 }}>{t(place.blurb)}</Text>
        <Text numberOfLines={2} style={{ color: '#7890A3', fontSize: 11, lineHeight: 17, marginBottom: 8 }}>{place.meta}</Text>
        <View style={{ marginTop: 'auto', paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <Text style={{ color: accent, fontSize: 13, flexShrink: 1, fontWeight: '600' }}>{t({ en: 'View details', th: 'ดูรายละเอียด', zh: '查看详情' })}</Text>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: pale, alignItems: 'center', justifyContent: 'center' }}><ArrowRight size={17} color={accent} /></View>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Meet your Island Companions hero card:
 * the companions on the beach, and the way into the 77-province field guide.
 *
 * NO ISLAND IN THE TITLE. The Thai line read "เกาะสมุย" while the English
 * beside it named no island at all, so the card disagreed with itself in two
 * languages and named the wrong island in every area but the first pilot. The
 * guide behind the card holds all 77 provinces; that is what the card can
 * honestly promise, and it needs no island to say it.
 */
function MascotHeroCard({
  now, onOpen,
}: {
  now: Date;
  onOpen: () => void;
}) {
  return (
    <View style={{ paddingTop: 20, paddingHorizontal: gutter }}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${t({ en: 'Meet your Island Companions', th: 'แก๊งเพื่อนร่วมทาง', zh: '认识你的岛屿伙伴' })}. ${t({ en: 'Open Field Guide', th: 'เปิดสมุดบันทึกมาสคอต', zh: '打开伙伴图鉴' })}`}
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
          {/* The time-of-day chip went with the second illustration (docs in
              api/photos.ts). One picture has no hour to announce. */}
        </View>

        <View style={{ padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Label size={9} tracking={0.12} colour={color.brand}>
                {t({ en: 'ISLAND COMPANIONS', th: 'แก๊งเพื่อนร่วมทาง', zh: '岛屿伙伴' })}
              </Label>
              <Heading size={15} tracking={-0.3} style={{ marginTop: 2 }}>
                {t({ en: 'Meet your Island Companions', th: 'แก๊งเพื่อนร่วมทาง', zh: '认识你的岛屿伙伴' })}
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
// 3. What you are carrying
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
        <Figure value={green === null ? '—' : formatInteger(green)} unit="G" en="Green · verified" th="ตรวจแล้ว" zh="绿色 · 已验证" tone={color.accent700} onPress={onOpenWallet} />
        <Figure value={trip === null ? '—' : formatInteger(trip)} unit="T" en="Trip · self" th="บันทึกเอง" zh="旅行 · 自行记录" tone={color.goldDeep} onPress={onOpenWallet} />
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
          ...platformShadow('0 2px 6px rgba(2, 132, 199, 0.06)', { shadowColor: '#0284c7', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 }),
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
function TopCards({ courts, fair, onOpenFair, onOpenCampus }: {
  courts: ReturnType<typeof stallPlacesIn>;
  fair: Fair | null;
  onOpenFair?: () => void;
  onOpenCampus?: () => void;
}) {
  if (courts.length === 0 && !fair && !onOpenCampus) return null;
  return (
    <View style={{ marginTop: -42, paddingHorizontal: gutter }}>
      {onOpenCampus ? <CampusCard onOpen={onOpenCampus} /> : null}
      {fair && onOpenFair ? <FairCard fair={fair} onOpen={onOpenFair} /> : null}
      {courts.map((c) => <StallsCard key={c.placeId} placeId={c.placeId} placeName={t(c.source.name)} />)}
    </View>
  );
}

/** A university's own booking and services, one tap away. */
function CampusCard({ onOpen }: { onOpen: () => void }) {
  const title = t({ en: 'Booking and services', th: 'จองและบริการ', zh: '预订与服务' });
  const about = t({ en: 'Rooms, buses, clinic, library', th: 'ห้อง รถ ห้องพยาบาล หอสมุด', zh: '教室、班车、医务室、图书馆' });
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${about}`}
      style={[shadow.card, {
        marginTop: 12, padding: 16, gap: 12, flexDirection: 'row', alignItems: 'center',
        backgroundColor: color.text, borderRadius: radius.md,
      }]}
    >
      <View style={{ flex: 1 }}>
        <Heading size={18} tracking={-0.2} colour={onFill.text}>{title}</Heading>
        <Body size={14} colour={onFill.text} style={{ marginTop: 2 }}>{about}</Body>
      </View>
      <ChevronRight size={20} color={onFill.text} strokeWidth={2.2} />
    </Pressable>
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

/** What runs to this area, fetched here so Home owns one request for it. */
function Bus({ areaKey, onToast }: { areaKey: AreaKey; onToast?: (m: string) => void }) {
  const transit = useAsync(() => api.transit(areaKey), [areaKey]);
  return (
    <BusStrip
      areaKey={areaKey}
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
