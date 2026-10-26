/**
 * Smart Map - the hero screen.
 *
 * Healthy Score pins over Koh Samui, the layer filter, and the quests-near-you
 * card. Scores arrive already computed and personalised from the API; the
 * client never calculates one, so the number here and the number in the ESG
 * report come from the same code path.
 */

import React from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { ArrowLeft, BedDouble, ChevronRight, Expand, Layers3, LayoutGrid, List, Map as MapIcon, MessageCircle, Store } from 'lucide-react-native';
import chivagoLogo from '../../assets/chivago-logo.png';
import {
  greetingFor, strings,
  type Balances, type ExploredPlace, type Quest, type QuestProgress, type RouteMode, type ScoredPlace,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { SHOP_CATEGORIES, shopImageUri, shopOpenNow, type Shop } from '../api/shops.ts';
import { areaOfPlace, fairById, fairLots, fairsIn, inArea, nearestFirst } from '@chivago/core';
import { setArea, useArea } from '../state/area.ts';
import { useHere } from '../state/here.ts';
import { useRoute } from '../state/route.ts';
import { WayBanner } from '../components/WayBanner.tsx';
import { FairBanner } from '../components/FairBanner.tsx';
import { AreaSwitch } from '../components/AreaSwitch.tsx';
import { useAsync, type LayerKey } from '../state/store.tsx';
import { color, currencyTone, gutter, layout, onFill, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { Button, IconButton } from '../components/Button.tsx';
import { OceanBackdrop } from '../components/Shell.tsx';
import { LayerChips, PlaceFeedRow, SamuiMap, drawsFairLots, type MapMode } from '../components/SamuiMap.tsx';
import { WaveSymbolBadge } from '../components/MarineEmblem.tsx';
import { StoryViewer } from '../components/Stories.tsx';
import { pickStoryMedia, postStory } from '../state/tell-story.ts';
import type { Story } from '../api/client.ts';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';
import { useRequireAccount } from '../components/GuestActionGate.tsx';
import { ProfileButton } from '../components/ProfileButton.tsx';

// Stable empties, so the map's marker effect is not re-run by a fresh `[]`
// on every render while the quests are still loading.
const NO_QUESTS: Quest[] = [];
const NO_PROGRESS: Record<string, QuestProgress> = {};
const NO_EXPLORED: ExploredPlace[] = [];
const mapShopCategory = (category: string) => {
  const values: Record<string, { en: string; th: string; zh?: string }> = {
    'ที่พัก': { en: 'Accommodation', th: 'ที่พัก', zh: '住宿' }, 'ร้านอาหาร': { en: 'Restaurant', th: 'ร้านอาหาร', zh: '餐厅' },
    'ร้านขายของ': { en: 'Souvenirs & shopping', th: 'ของฝาก/ช้อปปิ้ง', zh: '纪念品与购物' }, 'เช่ารถ': { en: 'Car rental', th: 'เช่ารถ', zh: '租车' },
    'เสริมสวย': { en: 'Beauty', th: 'เสริมสวย', zh: '美容' }, 'ตัดผม': { en: 'Haircut', th: 'ตัดผม', zh: '理发' }, 'ไกด์นำเที่ยว': { en: 'Tour guide', th: 'ไกด์นำเที่ยว', zh: '导游' }, 'อื่นๆ': { en: 'Other', th: 'อื่นๆ', zh: '其他' },
  };
  return t(values[category] ?? { en: category, th: category });
};

export function MapScreen({
  layers, onToggleLayer, onPlanDay, onOpenPlace, onOpenQuest, onSeeAllQuests, balances,
  onAskConcierge, onOpenStays, onOpenShop, onToast,
  onOpenWallet, onOpenProfile, wayTo = null, onClearWay, fairFocus = null, onClearFair, onOpenFair, onBackToFair,
}: {
  layers: Record<LayerKey, boolean>;
  onToggleLayer: (key: LayerKey) => void;
  onPlanDay: () => void;
  onOpenPlace: (id: string) => void;
  onOpenShop?: (id: string) => void;
  onOpenQuest: (id: string) => void;
  onSeeAllQuests: () => void;
  onAskConcierge: () => void;
  /** Stays & tours: asking a local operator (docs/61). */
  onOpenStays?: () => void;
  /** Said out loud when a clip is posted from the bar, or refused. */
  onToast: (msg: string) => void;
  balances: Balances;
  onOpenWallet: () => void;
  onOpenProfile?: () => void;
  /**
   * The place the traveller asked to be shown the way to, chosen on the
   * place screen. Null is the ordinary map, with no route on it.
   */
  wayTo?: ScoredPlace | null;
  onClearWay?: () => void;
  /** A fair lot chosen on the fair screen (docs/66): the map flies to it and marks it among the others. */
  fairFocus?: { fairId: string; code: string } | null;
  onClearFair?: () => void;
  /** The fair's directory, offered on the map of an area that has a fair on. */
  onOpenFair?: () => void;
  /** Back from the lot to the list it was found in, as it was left. */
  onBackToFair?: () => void;
}) {
  const places = useAsync(() => api.places(), []);
  const requireAccount = useRequireAccount();
  const quests = useAsync(() => api.quests('today'), []);
  // Where they have been. A failure here is a map with its mist down
  // everywhere, which is the truthful default, so it is not surfaced.
  const explored = useAsync(() => api.explored(), []);
  const [mode, setMode] = React.useState<MapMode>('map');
  const [expandedMap, setExpandedMap] = React.useState(false);
  const [expandedLayers, setExpandedLayers] = React.useState(false);
  const fullMapHorizontal = React.useRef<ScrollView>(null);
  const fullMapVertical = React.useRef<ScrollView>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // WATCHED, unlike every other screen's one-shot: this is the one place
  // that draws the traveller, and a dot that does not move while somebody
  // walks is worse than no dot, because a dot is read as current.
  const here = useHere({ watch: true });
  const area = useArea();
  const shops = useAsync(() => api.shops({ area: area.key }), [area.key]);
  const reloadShops = React.useRef(shops.reload);
  reloadShops.current = shops.reload;
  React.useEffect(() => {
    const timer = setInterval(() => reloadShops.current(), 60_000);
    return () => clearInterval(timer);
  }, [area.key]);
  const [selectedShop, setSelectedShop] = React.useState<Shop | null>(null);
  React.useEffect(() => {
    if (shops.data) setSelectedShop((current) => current ? shops.data!.find((s) => s.id === current.id) ?? null : null);
  }, [shops.data]);
  const [shopSearch, setShopSearch] = React.useState('');
  const [shopCategory, setShopCategory] = React.useState('');
  const [shopMinRating, setShopMinRating] = React.useState(0);
  const [shopsOpenOnly, setShopsOpenOnly] = React.useState(false);
  const visibleShops = React.useMemo(() => (shops.data ?? []).filter((s) =>
    (!shopCategory || s.category === shopCategory) && (!shopSearch || `${s.name} ${s.category}`.toLowerCase().includes(shopSearch.toLowerCase()))
    && (s.rating ?? 0) >= shopMinRating && (!shopsOpenOnly || shopOpenNow(s.openingHours))),
  [shops.data, shopCategory, shopSearch, shopMinRating, shopsOpenOnly]);
  const shopCategories = React.useMemo(() => SHOP_CATEGORIES.filter((category) => (shops.data ?? []).some((shop) => shop.category === category)), [shops.data]);
  React.useEffect(() => { setSelectedShop(null); setShopCategory(''); setShopSearch(''); setShopMinRating(0); setShopsOpenOnly(false); }, [area.key]);
  React.useEffect(() => { setExpandedMap(false); setExpandedLayers(false); }, [area.key, mode]);
  // Which pins wear a story. One request for the whole area, public.
  const areaStories = useAsync(() => api.areaStories(area.key), [area.key]);
  /*
    The bus stops, for the map to stand them on.

    Its own request rather than a prop from Home: the Map tab is reachable
    without passing through Home, and a map missing its stops because of
    which tab somebody opened first would be a bug nobody could reproduce.
  */
  const transit = useAsync(() => api.transit(area.key), [area.key]);
  const busStops = React.useMemo(
    () => (transit.data?.routes ?? []).flatMap((r) => r.stops.map((s) => ({ ...s, route: r.ref ?? t(r.name) }))),
    [transit.data],
  );
  const storied = React.useMemo(
    () => new Set((areaStories.data?.stories ?? []).map((s) => s.placeId)),
    [areaStories.data],
  );

  /*
    The poster each pin wears, and the stories behind it.

    A gold ring said a place HAD a story and never showed one, which on a map
    is most of the point: the photograph somebody took at that beach is the
    thing worth looking at, and an outline is a footnote about it. The feed
    arrives newest first, so the first poster for a place is its latest.

    Memoised together with `storied` because the web map tears down and
    rebuilds every DOM marker whenever either changes identity.
  */
  const tales = React.useMemo(() => {
    const out = new Map<string, string>();
    for (const s of areaStories.data?.stories ?? []) if (!out.has(s.placeId)) out.set(s.placeId, s.poster);
    return out;
  }, [areaStories.data]);

  const storiesBy = React.useMemo(() => {
    const out = new Map<string, Story[]>();
    for (const s of areaStories.data?.stories ?? []) {
      const list = out.get(s.placeId);
      if (list) list.push(s);
      else out.set(s.placeId, [s]);
    }
    return out;
  }, [areaStories.data]);

  /** Which place's stories are open, and where in them. */
  const [telling, setTelling] = React.useState<{ placeId: string; index: number } | null>(null);
  const openStory = React.useCallback((placeId: string) => setTelling({ placeId, index: 0 }), []);

  // Memoised, and the handler with it: the web map rebuilds every DOM marker
  // when either changes identity, and a fresh array plus a fresh arrow on
  // every render - every toast, every SOS poll - was rebuilding five
  // markers a few times a minute for nothing.
  // Every place in the area, before the layers - kept apart so an empty map
  // can say which of the two it is: the layers hiding everything, or an area
  // the API has nothing in yet. One message blamed the layers for both.
  //
  // Named for the area rather than `here`, which it was: with a traveller's
  // own position on this screen, a list of places called "here" is two
  // different heres one line apart.
  const areaPlaces = React.useMemo(
    () => (places.data ?? []).filter((p) => areaOfPlace(p) === area.key),
    [places.data, area.key],
  );
  const visible = React.useMemo(() => areaPlaces.filter((p) => layers[p.layer]), [areaPlaces, layers]);
  // The fair lot asked for, with every lot of its fair - only on the map of the fair's own area.
  const fair = fairFocus ? fairById(fairFocus.fairId) : null;
  const lots = React.useMemo(() => (fair && fair.area === area.key ? fairLots(fair) : null), [fair, area.key]);
  // A fresh object per ask, so asking for the same lot again, after panning
  // away, flies back to it: the map follows the request, not just the code.
  const lotShown = React.useMemo(() => {
    const lot = lots?.find((l) => l.code === fairFocus?.code);
    return lot ? { ...lot } : null;
  }, [lots, fairFocus]);
  const fairHere = fairsIn(area.key)[0] ?? null;
  const questsHere = React.useMemo(
    () => (quests.data?.quests ?? NO_QUESTS).filter((q) => inArea(area, q)),
    [quests.data, area],
  );
  const onSelect = React.useCallback((p: ScoredPlace) => onOpenPlace(p.id), [onOpenPlace]);

  /*
    Posting from the map itself, without opening a place first.

    A clip has to land SOMEWHERE, and a bar that just said "add a moment"
    would ask somebody to guess which of the five pins it went to. It posts
    to the nearest place and says which one in the button, so the answer is
    on the control rather than in a toast afterwards.

    With no position there is no nearest, and the bar says to turn location
    on rather than guessing a place on somebody's behalf.
  */
  const [posting, setPosting] = React.useState(false);
  const momentAt = React.useMemo(
    () => (here ? nearestFirst(visible, here)[0] ?? null : null),
    [visible, here],
  );

  const addMoment = React.useCallback(async () => {
    if (requireAccount({ en: 'Please sign in or create an account to post a story.', th: 'กรุณาสมัครสมาชิกหรือเข้าสู่ระบบเพื่อโพสต์เรื่องราว', zh: '请先登录或注册账号，再发布故事。' })) return;
    if (!momentAt || posting) return;
    const media = await pickStoryMedia(onToast);
    if (!media) return;
    setPosting(true);
    const ok = await postStory(momentAt.id, media, '', onToast);
    setPosting(false);
    if (ok) { onToast(t(strings.place.storyPosted)); areaStories.reload(); }
  }, [momentAt, posting, onToast, areaStories, requireAccount]);

  /*
    The way there.

    Walking is the default because it is the mode this product pays Trip
    Points for; the toggle is there because most of this island is not a
    walk. The router is a free community server and is allowed to say
    nothing (`state/route.ts`), so `way` falls back to the straight line
    between the two points - drawn dashed, and labelled as a bearing.
  */
  // Named for the way, not just 'mode': this screen already has one, and it
  // means map-or-feed.
  const [wayMode, setWayMode] = React.useState<RouteMode>('walk');
  const { route, loading: routing, failed: routeFailed } = useRoute(here, wayTo, wayMode);
  const way = React.useMemo<[number, number][] | null>(() => {
    if (route) return route.line;
    if (!here || !wayTo) return null;
    return [[here.lng, here.lat], [wayTo.lng, wayTo.lat]];
  }, [route, here, wayTo]);

  const expandedMapContent = (height: number) => <SamuiMap
    key={`${area.key}-expanded-${height}`}
    area={area}
    storied={storied}
    tales={tales}
    onOpenStory={(placeId) => { setExpandedMap(false); openStory(placeId); }}
    places={visible}
    shops={visibleShops}
    onSelectShop={(shop) => { setExpandedMap(false); setSelectedShop(shop); }}
    onSelect={(place) => { setExpandedMap(false); onSelect(place); }}
    quests={questsHere}
    progress={quests.data?.progress ?? NO_PROGRESS}
    onOpenQuest={(id) => { setExpandedMap(false); onOpenQuest(id); }}
    explored={explored.data?.places ?? NO_EXPLORED}
    stops={busStops}
    here={here}
    way={way}
    wayIsRoute={route !== null}
    fairLots={lots}
    fairFocus={lotShown}
    interactive
    fullScreenControls
    height={height}
    compact={false}
  />;
  const fullMapControlTop = Platform.OS === 'web' ? 14 : 52;

  /*
    The fair's lot, or the way into its directory. Static data, so it does
    not wait on /places: with the places still loading or failed, a lot asked
    for is still named here, above the error, rather than lost behind it.
  */
  const fairPanel = lotShown ? (
    <FairBanner
      lot={lotShown}
      marked={mode === 'map' && drawsFairLots}
      onClose={() => onClearFair?.()}
      onList={onBackToFair ?? onOpenFair}
    />
  ) : fairHere && onOpenFair ? (
    <Pressable
      onPress={onOpenFair}
      accessibilityRole="button"
      style={{
        marginHorizontal: gutter, marginTop: 10, minHeight: 44, paddingHorizontal: 14, borderRadius: 22,
        flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
        backgroundColor: color.surface, borderWidth: 1, borderColor: color.neutral300,
      }}
    >
      <Text style={{ fontSize: 16 }}>🧺</Text>
      <Body size={14} style={{ fontWeight: '700' }}>{`${t(fairHere.name)} · ${t(strings.fair.open)}`}</Body>
    </Pressable>
  ) : null;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      stickyHeaderIndices={[0]}
      contentContainerStyle={{ backgroundColor: '#EEF7F8', paddingBottom: 24 }}
    >
      <MapHeader
        balances={balances}
        onOpenWallet={onOpenWallet}
        onOpenProfile={onOpenProfile}
        mode={mode}
        onToggleMode={() => setMode(mode === 'map' ? 'feed' : 'map')}
      />

      {places.data || shops.data ? null : fairPanel}
      {places.loading ? <LoadingState /> : null}
      {places.error ? <ErrorState message={places.error} onRetry={places.reload} /> : null}

      {places.data || shops.data ? (
        <>
          <View
            style={{
              marginHorizontal: gutter,
              marginTop: 12,
              marginBottom: 4,
              padding: 8,
              backgroundColor: '#FFFFFF',
              borderRadius: 20,
              borderWidth: 1,
              borderColor: '#DCECEF',
              shadowColor: '#174B57',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.05,
              shadowRadius: 8,
              elevation: 1,
            }}
          >
            <AreaSwitch area={area.key} onChange={setArea} />
          </View>

          <View style={{ paddingTop: 4, paddingBottom: 8 }}>
            <LayerChips layers={layers} onToggle={(k) => onToggleLayer(k as LayerKey)} />
          </View>
          <View style={{ marginHorizontal: gutter, marginBottom: 10, backgroundColor: '#fff', borderRadius: 18, padding: 10 }}>
            <TextInput value={shopSearch} onChangeText={setShopSearch} placeholder={t({ en: 'Search businesses or categories', th: 'ค้นหาร้านค้าหรือประเภท', zh: '搜索商家或类别' })} style={{ borderWidth: 1, borderColor: '#DCECEF', borderRadius: 12, padding: 9, color: '#123B64' }} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 8 }}>
              {['', ...shopCategories].map((category) => <Pressable key={category || 'all'} onPress={() => setShopCategory(category)} style={{ borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: shopCategory === category ? '#0077B6' : '#EAF7FB' }}><Text style={{ color: shopCategory === category ? '#fff' : '#123B64', fontSize: 12 }}>{category ? mapShopCategory(category) : t({ en: 'All businesses', th: 'ร้านค้าทั้งหมด', zh: '全部商家' })}</Text></Pressable>)}
              <Pressable onPress={() => setShopMinRating(shopMinRating ? 0 : 4)} style={{ padding: 6, backgroundColor: shopMinRating ? '#0077B6' : '#EAF7FB', borderRadius: 14 }}><Text style={{ color: shopMinRating ? '#fff' : '#123B64', fontSize: 12 }}>★ 4+</Text></Pressable>
              <Pressable onPress={() => setShopsOpenOnly(!shopsOpenOnly)} style={{ padding: 6, backgroundColor: shopsOpenOnly ? '#0077B6' : '#EAF7FB', borderRadius: 14 }}><Text style={{ color: shopsOpenOnly ? '#fff' : '#123B64', fontSize: 12 }}>{t({ en: 'Open now', th: 'เปิดอยู่', zh: '正在营业' })}</Text></Pressable>
            </ScrollView>
            {shops.loading && !shops.data ? <Body size={13}>{t({ en: 'Loading businesses…', th: 'กำลังโหลดร้านค้า...', zh: '正在加载商家…' })}</Body> : null}
            {shops.error ? <Pressable onPress={shops.reload}><Body size={13} colour="#B91C1C">{t({ en: 'Could not load businesses. Try again.', th: 'โหลดร้านค้าไม่สำเร็จ · ลองใหม่', zh: '商家加载失败 · 请重试' })}</Body></Pressable> : null}
          </View>
          {fairPanel}
          {wayTo ? (
            <WayBanner
              place={wayTo}
              route={route}
              loading={routing}
              failed={routeFailed}
              haveHere={here !== null}
              mode={wayMode}
              onMode={setWayMode}
              onClear={() => onClearWay?.()}
            />
          ) : null}
          {mode === 'map' ? (
            <View style={{ position: 'relative', marginHorizontal: gutter, overflow: 'hidden', borderRadius: 18 }}>
            <SamuiMap
              /*
                A different area is a different map. The web map builds its
                MapLibre instance once, on mount, with the area's box as the
                edge it cannot scroll past; keyed by area, the chip tears
                that map down and builds the other one, instead of moving
                the pins around inside a frame locked to the wrong place -
                which is what "KU Sriracha" over a map of Samui was.
              */
              key={area.key}
              area={area}
              storied={storied}
              tales={tales}
              onOpenStory={openStory}
              places={visible}
              shops={visibleShops}
              onSelectShop={setSelectedShop}
              onSelect={onSelect}
              quests={questsHere}
              progress={quests.data?.progress ?? NO_PROGRESS}
              onOpenQuest={onOpenQuest}
              explored={explored.data?.places ?? NO_EXPLORED}
              stops={busStops}
              here={here}
              way={way}
              wayIsRoute={route !== null}
              fairLots={lots}
              fairFocus={lotShown}
              interactive={false}
            />
            <Pressable
              onPress={() => setExpandedMap(true)}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'Expand map', th: 'ขยายแผนที่', zh: '展开地图' })}
              style={{ position: 'absolute', top: 12, right: 12, width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D1E8EE', elevation: 4, shadowColor: '#123B64', shadowOpacity: 0.16, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}
            ><Expand size={20} color="#0077B6" /></Pressable>
            </View>
          ) : (
            <View>
              <View style={{ paddingHorizontal: gutter, paddingVertical: 10 }}>
                <View
                  style={{
                    alignSelf: 'flex-start',
                    backgroundColor: color.text,
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    borderRadius: radius.sm,
                  }}
                >
                  <Label size={10} tracking={0.14} colour={onFill.text}>
                    {t(strings.map.placesInArea(visible.length))}
                  </Label>
                </View>
              </View>
              {[...visible]
                .sort((a, b) => b.healthyScore - a.healthyScore)
                .map((p) => (
                  <PlaceFeedRow key={p.id} place={p} onPress={() => onOpenPlace(p.id)} />
                ))}
              {visibleShops.map((shop) => <Pressable key={`shop-${shop.id}`} onPress={() => setSelectedShop(shop)} style={{ marginHorizontal: gutter, marginBottom: 8, borderRadius: 14, backgroundColor: '#fff', padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}><Store color="#F77F00" /><View><Heading size={15}>{shop.name}</Heading><Body size={13}>{mapShopCategory(shop.category)} · {shop.rating === null ? t({ en: 'No reviews yet', th: 'ยังไม่มีรีวิว', zh: '还没有评价' }) : `★ ${shop.rating}`}</Body></View></Pressable>)}
            </View>
          )}
          {selectedShop ? <View style={{ marginHorizontal: gutter, marginTop: 10, backgroundColor: '#fff', borderRadius: 18, padding: 12, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            {selectedShop.coverUrl ? <Image source={{ uri: shopImageUri(selectedShop.coverUrl) }} style={{ width: 68, height: 68, borderRadius: 12 }} /> : <Store color="#F77F00" size={36} />}
            <View style={{ flex: 1 }}><Heading size={16}>{selectedShop.name}</Heading><Body size={13}>{mapShopCategory(selectedShop.category)} · {selectedShop.rating === null ? t({ en: 'No reviews yet', th: 'ยังไม่มีรีวิว', zh: '还没有评价' }) : `★ ${selectedShop.rating} (${selectedShop.reviewCount})`}</Body><Pressable onPress={() => onOpenShop?.(selectedShop.id)}><Body size={13} colour="#0077B6">{t({ en: 'View business details →', th: 'ดูรายละเอียดร้าน →', zh: '查看商家详情 →' })}</Body></Pressable></View>
            <Pressable onPress={() => setSelectedShop(null)} accessibilityLabel={t({ en: 'Close business details', th: 'ปิดข้อมูลร้าน', zh: '关闭商家详情' })}><Text>✕</Text></Pressable>
          </View> : null}
          {/*
            The bar at the foot of the map, from the journey sketch: post
            without opening a place first. Only when there is somewhere for a
            clip to land - with no pins the honest message is the empty one
            below, not an offer to post into nothing.
          */}
          {visible.length > 0 ? (
            <View style={{ paddingHorizontal: gutter, marginTop: 12 }}>
              <Button
                label={
                  posting
                    ? t(strings.place.momentSending)
                    : momentAt
                      ? t(strings.place.moment(t(momentAt.name)))
                      : t(strings.place.momentNeedsFix)
                }
                onPress={addMoment}
                disabled={!momentAt || posting}
                variant={momentAt ? 'primary' : 'secondary'}
                icon={null}
              />
            </View>
          ) : null}

          {visible.length === 0 && visibleShops.length === 0 ? (
            <View style={{ padding: gutter }}>
              <Body colour={color.neutral700}>
                {areaPlaces.length === 0
                  ? t({ en: 'No places in this area yet.', th: 'ยังไม่มีสถานที่ในพื้นที่นี้', zh: '这一带还没有地点。' })
                  : t({ en: 'No places match the active layers.', th: 'ไม่มีสถานที่ตรงกับตัวกรองที่เลือก', zh: '没有地点符合当前选中的图层。' })}
              </Body>
            </View>
          ) : null}
        </>
      ) : null}

      {/*
        The planner's front door.
        It was reachable only by saving a place first, which meant the one
        feature that answers "what should I do today" could not be found by
        anyone asking that question.
      */}
      <Pressable
        onPress={onPlanDay}
        accessibilityRole="button"
        accessibilityLabel={t(strings.trip.planCta)}
        style={[
          shadow.card,
          {
            marginTop: 16,
            marginHorizontal: gutter,
            padding: 18,
            backgroundColor: color.surface,
            borderWidth: 1.5,
            // The one control on this screen that starts something.
            borderColor: color.ctaDeep,
            borderRadius: 22,
            overflow: 'hidden',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          },
        ]}
      >
        <OceanBackdrop subtle />
        <View style={{ flex: 1 }}>
          <Heading size={17} colour={color.ctaDeep}>{t(strings.trip.planCta)}</Heading>
          <Body size={13} colour={color.neutral600} style={{ marginTop: 6 }}>
            {t(strings.trip.planBlurb)}
          </Body>
        </View>
        <ChevronRight size={20} color={color.ctaDeep} strokeWidth={2} />
      </Pressable>

      {/*
        The concierge's front door, under the planner rather than beside it.
        The planner answers "what should I do today" in one shot; this answers
        the question somebody has when they cannot phrase that one yet. Quieter
        on purpose - two equally loud front doors is no front door at all.
      */}
      <Pressable
        onPress={onAskConcierge}
        accessibilityRole="button"
        accessibilityLabel={t({
          en: 'Ask the concierge. Ask in Thai or English.',
          th: 'ถามผู้ช่วยนำเที่ยว ถามเป็นไทยหรืออังกฤษก็ได้',
          zh: '向旅行助手提问。用泰语或英语提问都可以。',
        })}
        style={[
          shadow.card,
          {
            marginTop: 10,
            marginHorizontal: gutter,
            minHeight: 48,
            paddingVertical: 14,
            paddingHorizontal: 16,
            backgroundColor: color.surface,
            borderWidth: 1,
            borderColor: '#D7E9EC',
            borderRadius: 18,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          },
        ]}
      >
        <MessageCircle size={18} color={color.brand} strokeWidth={2} />
        <View style={{ flex: 1 }}>
          <Heading size={14}>{t({ en: 'Ask where to go', th: 'ถามว่าไปไหนดี', zh: '问问去哪儿好' })}</Heading>
        </View>
        <ChevronRight size={18} color={color.brand} strokeWidth={2} />
      </Pressable>

      {/*
        Stays, boats and tours, as quiet as the concierge and for the same
        reason: the planner is this screen's one loud door. It sits here
        because a traveller planning a day is the one about to ask where to
        sleep or which boat to take - and it used to be reachable only from
        the bottom of the planner, where the owner could not find it.
      */}
      {onOpenStays ? (
        <Pressable
          onPress={onOpenStays}
          accessibilityRole="button"
          accessibilityLabel={`${t(strings.ask.door)}. ${t(strings.ask.doorSub)}`}
          style={[
            shadow.card,
            {
              marginTop: 10,
              marginHorizontal: gutter,
              minHeight: 48,
              paddingVertical: 14,
              paddingHorizontal: 16,
              backgroundColor: color.surface,
              borderWidth: 1,
              borderColor: '#D7E9EC',
              borderRadius: 18,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            },
          ]}
        >
          <BedDouble size={18} color={color.brand} strokeWidth={2} />
          <View style={{ flex: 1 }}>
            <Heading size={14}>{t(strings.ask.door)}</Heading>
            <Body size={13} colour={color.neutral600} style={{ marginTop: 2 }}>{t(strings.ask.doorSub)}</Body>
          </View>
          <ChevronRight size={18} color={color.brand} strokeWidth={2} />
        </Pressable>
      ) : null}

      <QuestsNearYou
        quests={questsHere}
        error={quests.error}
        onRetry={quests.reload}
        onOpen={onOpenQuest}
        onSeeAll={onSeeAllQuests}
      />

      {/*
        The same viewer the place screen uses, opened from a pin's poster.
        One component for both, so a clip looks and behaves the same however
        somebody reached it.
      */}
      {telling && (storiesBy.get(telling.placeId) ?? []).length > 0 ? (
        <StoryViewer
          stories={storiesBy.get(telling.placeId)!}
          index={telling.index}
          onIndex={(index) => setTelling({ placeId: telling.placeId, index })}
          onClose={() => setTelling(null)}
        />
      ) : null}
      <Modal visible={expandedMap} animationType="fade" presentationStyle="overFullScreen" statusBarTranslucent onRequestClose={() => setExpandedMap(false)}>
      <View style={{ flex: 1, backgroundColor: '#EAF7FB' }}>
        {Platform.OS === 'web'
          ? <View style={{ height: windowHeight, width: windowWidth, backgroundColor: '#EAF7FB' }}>{expandedMapContent(windowHeight)}</View>
          : <ScrollView ref={fullMapHorizontal} horizontal showsHorizontalScrollIndicator={false} contentOffset={{ x: windowWidth / 2, y: 0 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
              <ScrollView ref={fullMapVertical} nestedScrollEnabled showsVerticalScrollIndicator={false} contentOffset={{ x: 0, y: windowHeight / 2 }}>
                <View style={{ width: windowWidth * 2, height: windowHeight * 2, backgroundColor: '#EAF7FB' }}>{expandedMapContent(windowHeight * 2)}</View>
              </ScrollView>
            </ScrollView>}
        <Pressable
          onPress={() => setExpandedMap(false)}
          accessibilityRole="button"
          accessibilityLabel={t({ en: 'Back to map', th: 'กลับไปหน้าแผนที่', zh: '返回地图' })}
          style={{ position: 'absolute', top: fullMapControlTop, left: 14, width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2EEF4', elevation: 5, shadowColor: '#123B64', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }}
        ><ArrowLeft size={26} color="#0077B6" strokeWidth={2.8} /></Pressable>
        {expandedLayers ? <View style={{ position: 'absolute', left: 82, bottom: Platform.OS === 'web' ? 100 : 118, width: Math.min(330, Math.max(200, windowWidth - 100)), backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden', elevation: 8, shadowColor: '#123B64', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
          <LayerChips layers={layers} onToggle={(key) => onToggleLayer(key as LayerKey)} />
        </View> : null}
        <View style={{ position: 'absolute', left: 16, bottom: Platform.OS === 'web' ? 24 : 42, gap: 12 }}>
          <Pressable
            onPress={() => setExpandedLayers((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel={t({ en: 'Map layers', th: 'ชั้นข้อมูลแผนที่', zh: '地图图层' })}
            style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2EEF4', elevation: 5, shadowColor: '#123B64', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }}
          ><Layers3 size={25} color="#12283D" strokeWidth={2.5} /></Pressable>
          <Pressable
            onPress={() => {
              setExpandedLayers(false);
              if (Platform.OS === 'web') window.dispatchEvent(new Event('chivago-map-reset'));
              else {
                fullMapHorizontal.current?.scrollTo({ x: windowWidth / 2, animated: true });
                fullMapVertical.current?.scrollTo({ y: windowHeight / 2, animated: true });
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={t({ en: 'Reset map view', th: 'จัดมุมมองแผนที่ใหม่', zh: '重置地图视图' })}
            style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(7, 36, 61, 0.78)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }}
          ><MapIcon size={26} color="#FFFFFF" strokeWidth={2.2} /></Pressable>
        </View>
      </View>
      </Modal>
    </ScrollView>
  );
}

export function MapHeader({
  balances, mode, onToggleMode, onOpenWallet, onOpenProfile,
}: {
  balances: Balances; mode: MapMode;
  onToggleMode: () => void; onOpenWallet: () => void;
  onOpenProfile?: () => void;
}) {
  const area = useArea();
  return (
    <View
      style={{
        backgroundColor: '#097097',
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        paddingHorizontal: gutter,
        paddingTop: 20,
        paddingBottom: 20,
        shadowColor: '#00263E',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
        elevation: 4,
        overflow: 'hidden',
      }}
    >
      <OceanBackdrop compact />

      {/* Row 1: Greeting & Area Name on Left, ChivaGo Logo + Profile on Right (matching Home screen) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#D5F6FF', fontSize: 12, fontWeight: '500', letterSpacing: 1.8, textTransform: 'uppercase' }}>
            {t(greetingFor(new Date()))}
          </Text>
          <Heading size={28} colour="#FFFFFF" style={{ marginTop: 4, fontWeight: '800' }}>
            {t(area.name)}
          </Heading>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Image
            source={chivagoLogo}
            resizeMode="contain"
            accessibilityLabel="ChivaGo"
            style={{ width: 68, height: 48 }}
          />

          <ProfileButton onPress={onOpenProfile} />

          <IconButton
            inverted
            onPress={onToggleMode}
            accessibilityLabel={mode === 'map'
              ? t({ en: 'Switch to list view', th: 'สลับไปมุมมองรายการ', zh: '切换到列表视图' })
              : t({ en: 'Switch to map view', th: 'สลับไปมุมมองแผนที่', zh: '切换到地图视图' })}
          >
            {mode === 'map'
              ? <List size={16} color="#FFFFFF" strokeWidth={2} />
              : <LayoutGrid size={16} color="#FFFFFF" strokeWidth={2} />}
          </IconButton>
        </View>
      </View>

      {/* Row 2: Floating Card "คลื่นลมวันนี้" */}
      <Pressable
        onPress={onOpenWallet}
        accessibilityRole="button"
        accessibilityLabel={
          `${balances.green.toLocaleString('en-US')} ${t(strings.common.greenPoints)}, `
          + `${t(strings.common.greenPointsNote)}. `
          + `${balances.trip.toLocaleString('en-US')} ${t(strings.common.tripPoints)}, `
          + `${t(strings.common.tripPointsNote)}. ${t({ en: 'Open wallet.', th: 'เปิดกระเป๋าแต้ม', zh: '打开钱包。' })}`
        }
        style={{
          marginTop: 16,
          backgroundColor: '#FFFFFF',
          borderRadius: 20,
          paddingVertical: 10,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderWidth: 1,
          borderColor: '#D8ECF5',
          shadowColor: '#002C45',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.12,
          shadowRadius: 6,
          elevation: 3,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <WaveSymbolBadge size={40} />
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#004B7E' }}>
              {t({ en: "Today's Waves & Wind", th: 'คลื่นลมวันนี้', zh: '今日浪与风' })}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                <Heading size={16} colour="#004B7E" style={{ fontWeight: '800' }}>
                  {balances.green.toLocaleString('en-US')}
                </Heading>
                <Label size={10} tracking={0.1} colour="#006EA8" style={{ fontWeight: '700' }}>
                  {t(strings.wallet.green)}
                </Label>
                <Text style={{ fontSize: 10, fontWeight: '500', color: '#52749D' }}>
                  {t({ en: '(1,240 m)', th: '(1,240 ม.)', zh: '(1,240 米)' })}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                <Heading size={13} colour="#396184" style={{ fontWeight: '700' }}>
                  {balances.trip.toLocaleString('en-US')}
                </Heading>
                <Label size={9} tracking={0.1} colour="#52749D" style={{ fontWeight: '600' }}>
                  {t(strings.wallet.trip)}
                </Label>
                <Text style={{ fontSize: 9, fontWeight: '500', color: '#718EA8' }}>
                  {t({ en: '(320 km/h)', th: '(320 กม/ชม)', zh: '(320 公里/小时)' })}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <ChevronRight size={18} color="#006EA8" strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

export function QuestsNearYou({
  quests, error = null, onRetry, onOpen, onSeeAll,
}: {
  quests: Quest[];
  /**
   * A failed quest fetch has to say so. Without this the strip renders its
   * heading over nothing, which reads as "there is nothing on today" - and a
   * traveller who believes that closes the app.
   */
  error?: string | null;
  onRetry?: () => void;
  onOpen: (id: string) => void;
  onSeeAll: () => void;
}) {
  const top = quests[0];
  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 18, paddingBottom: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Label size={10} tracking={0.16} colour={color.brand}>{t(strings.map.questsNearYou)}</Label>
        <Button label={t(strings.common.seeAll)} onPress={onSeeAll} variant="ghost" />
      </View>

      {top ? (
        <View
          style={[
            shadow.card,
            {
              backgroundColor: color.surface,
              borderWidth: 1,
              borderColor: '#DCEFF5',
              borderRadius: 22,
              overflow: 'hidden',
              padding: 16,
              marginTop: 10,
            },
          ]}
        >
          <OceanBackdrop subtle />
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Heading size={17}>{t(top.name)}</Heading>
            </View>
            <View style={{ backgroundColor: currencyTone(top.rewardCurrency).fill, paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.sm }}>
              <Heading size={13} colour={currencyTone(top.rewardCurrency).on}>
                {`+${top.rewardPoints} ${top.rewardCurrency === 'green' ? 'G' : 'T'}`}
              </Heading>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 14, marginTop: 12 }}>
            <Label size={11} tracking={0} style={{ textTransform: 'none' }}>{t(top.where)}</Label>
            <Label size={11} tracking={0} style={{ textTransform: 'none' }}>{t(top.duration)}</Label>
          </View>

          <Button
            label={t(strings.quest.ctaJoin)}
            onPress={() => onOpen(top.id)}
            height={44}
            style={{ marginTop: 12 }}
            icon={<ChevronRight size={18} color={onFill.brand} strokeWidth={2} />}
          />
        </View>
      ) : null}

      {error ? <ErrorState message={error} onRetry={onRetry} /> : null}
    </View>
  );
}
