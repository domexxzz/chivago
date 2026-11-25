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
import { ArrowLeft, BedDouble, ChevronRight, Expand, Layers3, LayoutGrid, List, Map as MapIcon, MessageCircle, Minus, Navigation, Plus, Satellite, Store, Waves } from 'lucide-react-native';
import chivagoLogo from '../../assets/chivago-logo.png';
import {
  greetingFor, strings,
  type Balances, type ExploredPlace, type Quest, type QuestProgress, type RouteMode, type ScoredPlace,
} from '@chivago/core';
import { API_BASE, api } from '../api/client.ts';
import { photoUri } from '../api/photos.ts';
import { SHOP_CATEGORIES, shopImageUri, shopOpenNow, type Shop } from '../api/shops.ts';
import { areaOfPlace, fairById, fairLots, fairsIn, inArea, nearestFirst, type DropOffPoint } from '@chivago/core';
import { setArea, useArea } from '../state/area.ts';
import { useHere } from '../state/here.ts';
import { useOnline } from '../state/online.ts';
import { useRoute } from '../state/route.ts';
import { WayBanner } from '../components/WayBanner.tsx';
import { FairBanner } from '../components/FairBanner.tsx';
import { AreaSwitch } from '../components/AreaSwitch.tsx';
import { DropOffLayer } from '../components/DropOffLayer.tsx';
import { dropOffForPin, dropOffPins, dropOffPointsIn } from '../components/drop-off-pins.ts';
import { useAsync, type LayerKey } from '../state/store.tsx';
import { color, currencyTone, gutter, layout, onFill, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { Button, IconButton } from '../components/Button.tsx';
import { OceanBackdrop, TravelHeroBackdrop } from '../components/Shell.tsx';
import { LayerChips, PlaceFeedRow, SamuiMap, drawsFairLots, type MapMode } from '../components/SamuiMap.tsx';
import { NearYou } from '../components/map-parts.tsx';
import type { MapHandle } from '../components/WebTerrainMap.tsx';
import { WaveSymbolBadge } from '../components/MarineEmblem.tsx';
import { StoryViewer } from '../components/Stories.tsx';
import { pickStoryMedia, postStory } from '../state/tell-story.ts';
import type { Story } from '../api/client.ts';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';
import { formatDate, formatDateTime, formatInteger } from '../i18n/format.ts';
import { useRequireAccount } from '../components/GuestActionGate.tsx';
import { ProfileButton } from '../components/ProfileButton.tsx';
import { IslandDiorama, pageBase } from '../components/IslandDiorama.tsx';
import { coastalDriftPoints, loadCoastalDrift, type CoastalDriftFile, type CoastalDriftPoint, type CoastalSide } from '../components/coastal-drift.ts';
import { cachedPlaces, cachedShops, clearPublicCache, deleteAreaCache, inspectAreaCache, placesWithFallback, shopsWithFallback, storageInfo } from '../offline/public-cache.ts';
import { clearCachedImages } from '../offline/image-cache.ts';

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
  return t(values[category] ?? { en: category, th: category, zh: category });
};

export function MapScreen({
  layers, onToggleLayer, onPlanDay, onOpenPlace, onOpenQuest, onSeeAllQuests, balances,
  onAskConcierge, onOpenStays, onOpenShop, onNavigateShop, onNavigateDropOff, onToast,
  onOpenWallet, onOpenProfile, wayTo = null, onClearWay, onNavigate, recommendedPlaces = [], onClearRecommendations, fairFocus = null, onClearFair, onOpenFair, onBackToFair,
}: {
  layers: Record<LayerKey, boolean>;
  onToggleLayer: (key: LayerKey) => void;
  onPlanDay: () => void;
  onOpenPlace: (id: string) => void;
  onOpenShop?: (id: string) => void;
  /** Opens turn-by-turn for a business pin that carries a verified coordinate. */
  onNavigateShop?: (shop: Shop) => void;
  /** Turn-by-turn to a drop-off point. Absent where the app cannot route. */
  onNavigateDropOff?: (point: DropOffPoint) => void;
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
  /** Opens turn-by-turn for the place the way banner is about. */
  onNavigate?: (place: ScoredPlace) => void;
  /** All real ChivaGo records returned by the concierge for this result set. */
  recommendedPlaces?: ScoredPlace[];
  onClearRecommendations?: () => void;
  /** A fair lot chosen on the fair screen (docs/66): the map flies to it and marks it among the others. */
  fairFocus?: { fairId: string; code: string } | null;
  onClearFair?: () => void;
  /** The fair's directory, offered on the map of an area that has a fair on. */
  onOpenFair?: () => void;
  /** Back from the lot to the list it was found in, as it was left. */
  onBackToFair?: () => void;
}) {
  const area = useArea();
  const [offlineStamp, setOfflineStamp] = React.useState<string | null>(null);
  const [shopOfflineStamp, setShopOfflineStamp] = React.useState<string | null>(null);
  /*
    Two reasons to draw the island instead of the terrain, and they catch
    different failures.

    `offlineStamp` means the places request fell back to a snapshot - the API
    is unreachable. It cannot catch being offline with NOTHING cached (no
    snapshot, so no stamp, so MapLibre mounts and fails on every tile), nor
    signal lost after the map is already up (places are fetched once per
    area, so nothing re-runs). `useOnline` is an event and catches both.

    It can only force the drawn map, never keep the terrain one: see
    `state/online.ts` on why `navigator.onLine` is trusted in one direction.
  */
  const online = useOnline();
  /*
    OFFLINE NO LONGER MEANS "DRAW THE ISLAND INSTEAD".

    `offlineMap` was invented when the phone had no real map and the browser
    had no cached tiles, so losing the network meant falling back to the SVG
    decagon - a shape with no roads, no scale and no north, which is the
    least useful thing to hand somebody who cannot see where they are.

    Both halves of that have changed. The phone runs MapLibre in a WebView
    with its own tile cache, and the browser keeps its tiles in the HTTP
    cache it already had. So offline is now when the real map is worth MORE,
    not less, and neither platform is pushed off it. Each falls back on its
    own terms if the map genuinely cannot start: the WebView to the drawing,
    the browser to the message it has always shown.

    The flag is kept, because it is still what the BANNER reads to say the
    data came from a snapshot. It no longer decides which map is drawn.
  */
  const offlineMap = offlineStamp !== null || !online;
  const [cachePanel, setCachePanel] = React.useState(false);
  const [cacheRevision, setCacheRevision] = React.useState(0);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [storageSummary, setStorageSummary] = React.useState<Awaited<ReturnType<typeof storageInfo>> | null>(null);
  const places = useAsync(() => placesWithFallback(area.key, async () => {
    const result = await api.places();
    setOfflineStamp(result.ok ? null : (await cachedPlaces(area.key))?.downloadedAt ?? null);
    return result;
  }), [area.key]);
  const requireAccount = useRequireAccount();
  const quests = useAsync(() => api.quests('today'), []);
  // Where they have been. A failure here is a map with its mist down
  // everywhere, which is the truthful default, so it is not surfaced.
  const explored = useAsync(() => api.explored(), []);
  const [mode, setMode] = React.useState<MapMode>('map');
  const [expandedMap, setExpandedMap] = React.useState(false);
  /*
    The island, drawn rather than tiled. Only Ko Sichang has an asset built
    for it (docs/76).

    IT IS THE DEFAULT THERE NOW. It was opt-in at first, behind a chip, on
    the reasoning that the vector map is the one that navigates. What came
    back was "the Ko Sichang map is still the old one" - which is what a
    chip nobody presses amounts to. The island now carries what it owed a
    person on the ground (position, north, scale, the route), so it can be
    what opens; the vector map is one tap away and keeps everything it had.

    The state is three-valued on purpose: not-chosen, map, island. That is
    what lets the default differ by area while an explicit choice still
    wins, and it resets with the area - a choice about Ko Sichang says
    nothing about Samui.
  */
  const [mapChoice, setMapChoice] = React.useState<'map' | 'island' | 'drift' | null>(null);
  const hasDiorama = area.key === 'koh-sichang';
  const activeMapChoice = hasDiorama ? (mapChoice ?? 'island') : 'map';
  const diorama = hasDiorama && activeMapChoice === 'island';
  const driftMode = hasDiorama && activeMapChoice === 'drift';
  React.useEffect(() => { setMapChoice(null); }, [area.key]);
  const driftSnapshot = useAsync<CoastalDriftFile | null>(
    async () => ({
      ok: true,
      data: area.key === 'koh-sichang'
        ? await loadCoastalDrift(`${pageBase(Platform.OS, API_BASE)}/islands/koh-sichang.drift.json`)
        : null,
    }),
    [area.key],
  );
  const allDriftPoints = React.useMemo(() => coastalDriftPoints(driftSnapshot.data ?? null), [driftSnapshot.data]);
  const [driftSide, setDriftSide] = React.useState<'all' | CoastalSide>('all');
  const [selectedDriftPoint, setSelectedDriftPoint] = React.useState<CoastalDriftPoint | null>(null);
  const visibleDriftPoints = React.useMemo(
    () => allDriftPoints.filter((point) => driftSide === 'all' || point.side === driftSide),
    [allDriftPoints, driftSide],
  );
  React.useEffect(() => { setDriftSide('all'); setSelectedDriftPoint(null); }, [area.key]);
  /*
    The expanded map's zoom, driven from the screen rather than from inside
    the map.

    On a phone the expanded map is drawn at twice the screen and panned
    inside two scroll views, so a control living in the map's own document
    parks itself at a corner of a canvas nobody can see. These buttons are
    pinned to the SCREEN, beside the ones that were already pinned there -
    back, layers, recentre - and reach the map through this handle.

    Null on the web and on the drawn island: neither answers to it, and the
    buttons are not offered where they would do nothing.
  */
  const expandedZoom = React.useRef<MapHandle>(null);
  /*
    Whether the expanded map is showing satellite.

    Held here only to colour the button. The DOCUMENT owns the truth - this
    asks it to flip and follows along - and the expanded map is a separate
    WebView from the one on the page below (different `key`), so it always
    opens on the basemap and this starts false to match.
  */
  const [expandedSat, setExpandedSat] = React.useState(false);
  React.useEffect(() => { if (!expandedMap) setExpandedSat(false); }, [expandedMap]);
  const [expandedLayers, setExpandedLayers] = React.useState(false);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // WATCHED, unlike every other screen's one-shot: this is the one place
  // that draws the traveller, and a dot that does not move while somebody
  // walks is worse than no dot, because a dot is read as current.
  const here = useHere({ watch: true });
  const shops = useAsync(() => shopsWithFallback(area.key, async () => {
    const result = await api.shops({ area: area.key });
    setShopOfflineStamp(result.ok ? null : (await cachedShops(area.key))?.downloadedAt ?? null);
    return result;
  }), [area.key]);
  const reloadShops = React.useRef(shops.reload);
  reloadShops.current = shops.reload;
  const reloadPlaces = React.useRef(places.reload);
  reloadPlaces.current = places.reload;

  /*
    Coming back online does not undo itself.

    `offlineStamp` is set by a fetch that fell back to cache and is cleared
    only by a fetch that succeeds - and places are fetched once per area. So
    signal restored left the screen exactly as the outage had left it: the
    drawn 2D map, the "using cached data" banner, and the shops error, all
    sitting over a working connection until somebody thought to change area
    and come back. Reconnecting asks for the two lists again, which is what
    clears all three.

    The ref is `false` on mount, so arriving online fetches once, not twice.
    `reload` is a fresh arrow every render (see `useAsync`), hence the refs -
    the same reason `reloadShops` above already exists.
  */
  const wasOffline = React.useRef(false);
  React.useEffect(() => {
    if (!online) { wasOffline.current = true; return; }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    reloadPlaces.current();
    reloadShops.current();
  }, [online]);

  React.useEffect(() => {
    const timer = setInterval(() => reloadShops.current(), 60_000);
    return () => clearInterval(timer);
  }, [area.key]);
  const [selectedShop, setSelectedShop] = React.useState<Shop | null>(null);
  const [selectedPlace, setSelectedPlace] = React.useState<ScoredPlace | null>(null);
  const recommendedPlaceIds = React.useMemo(() => new Set(recommendedPlaces.map((place) => place.id)), [recommendedPlaces]);
  React.useEffect(() => {
    if (shops.data) setSelectedShop((current) => current ? shops.data!.find((s) => s.id === current.id) ?? null : null);
  }, [shops.data]);
  React.useEffect(() => {
    if (places.data) setSelectedPlace((current) => current ? places.data!.find((place) => place.id === current.id) ?? null : null);
  }, [places.data]);
  const [shopSearch, setShopSearch] = React.useState('');
  const [shopCategory, setShopCategory] = React.useState('');
  const [shopMinRating, setShopMinRating] = React.useState(0);
  const [shopsOpenOnly, setShopsOpenOnly] = React.useState(false);
  const visibleShops = React.useMemo(() => (shops.data ?? []).filter((s) =>
    (!shopCategory || s.category === shopCategory) && (!shopSearch || `${s.name} ${s.category}`.toLowerCase().includes(shopSearch.toLowerCase()))
    && (s.rating ?? 0) >= shopMinRating && (!shopsOpenOnly || (!shopOfflineStamp && shopOpenNow(s.openingHours)))),
  [shops.data, shopCategory, shopSearch, shopMinRating, shopsOpenOnly, shopOfflineStamp]);
  // The shops on the map, plus this area's drop-off points as bin pins.
  const mapShops = React.useMemo(
    () => [...visibleShops, ...dropOffPins(area.bbox, t)],
    [visibleShops, area.bbox],
  );
  const shopCategories = React.useMemo(() => SHOP_CATEGORIES.filter((category) => (shops.data ?? []).some((shop) => shop.category === category)), [shops.data]);
  React.useEffect(() => { setSelectedPlace(null); setSelectedShop(null); setShopCategory(''); setShopSearch(''); setShopMinRating(0); setShopsOpenOnly(false); }, [area.key]);
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
  const visible = React.useMemo(() => areaPlaces.filter((p) => layers[p.layer] && (!shopSearch || `${JSON.stringify(p.name)} ${JSON.stringify(p.blurb)} ${p.layer}`.toLocaleLowerCase().includes(shopSearch.trim().toLocaleLowerCase()))), [areaPlaces, layers, shopSearch]);
  const [cacheInfo, setCacheInfo] = React.useState<Awaited<ReturnType<typeof inspectAreaCache>> | null>(null);
  React.useEffect(() => { void inspectAreaCache(area.key).then(setCacheInfo).catch(() => setCacheInfo(null)); }, [area.key, cacheRevision, offlineStamp, shopOfflineStamp, cachePanel]);
  React.useEffect(() => { if (cachePanel) void storageInfo().then(setStorageSummary).catch(() => setStorageSummary(null)); }, [cachePanel, cacheRevision]);
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
  const onSelect = React.useCallback((place: ScoredPlace) => {
    setSelectedShop(null);
    setSelectedDriftPoint(null);
    setSelectedPlace(place);
  }, []);
  const onSelectShop = React.useCallback((shop: Shop) => {
    // A bin rides the shop pin channel (`drop-off-pins.ts`); it goes straight
    // to directions and never opens a shop card.
    const dropOff = dropOffForPin(shop.id);
    if (dropOff) {
      if (onNavigateDropOff) { setExpandedMap(false); onNavigateDropOff(dropOff); }
      return;
    }
    setSelectedPlace(null);
    setSelectedDriftPoint(null);
    setSelectedShop(shop);
  }, [onNavigateDropOff]);
  const onSelectDriftPoint = React.useCallback((point: CoastalDriftPoint) => {
    setSelectedPlace(null);
    setSelectedShop(null);
    setSelectedDriftPoint(point);
  }, []);

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
  const { route, loading: routing, failed: routeFailed, refusal: routeRefused } = useRoute(here, wayTo, wayMode);
  const way = React.useMemo<[number, number][] | null>(() => {
    if (route) return route.line;
    if (!here || !wayTo) return null;
    return [[here.lng, here.lat], [wayTo.lng, wayTo.lat]];
  }, [route, here, wayTo]);

  /*
    THE FULL-SCREEN MAP GETS THE SAME CHOICE.

    The chips were only on the inline map at first, and the one screenshot
    that came back was of the expanded view - where the island simply was not
    on offer. A view somebody opens to look at the island is the last place to
    hide the drawing of it.
  */
  /*
    WHICH NAMES ON THE ISLAND MAY BE TAPPED.

    The island is labelled from a sidecar of anchors built at render time;
    the app lists places from the API. They do not have to agree - the
    shrine, the mondop and the bridge are bootstrapped into the database at
    run time, while the pier and the beach come from the seed - and a name
    with no place behind it used to take a tap and do nothing at all.
    Measured on production: the tap reached the app ({"type":"place",
    "id":"sc-thamphang"}) and then fell off the end, because the inline
    branch drew no card and an unmatched id matched nothing.

    So the page is told what can be opened, and wears a chevron only there.
  */
  const dioramaOpenable = React.useMemo(
    () => (places.data ?? []).map((place) => place.id),
    [places.data],
  );

  const expandedMapContent = (height: number) => (hasDiorama && diorama
    ? <IslandDiorama
        height={height}
        here={here}
        route={way}
        openable={dioramaOpenable}
        onSelectPlace={onOpenPlace}
      />
    : <SamuiMap
    key={`${area.key}-expanded-${height}`}
    mapRef={expandedZoom}
    inlineSatellite={false}
        area={area}
    storied={storied}
    tales={tales}
    onOpenStory={(placeId) => { setExpandedMap(false); openStory(placeId); }}
    places={driftMode ? [] : visible}
    highlightedPlaceIds={recommendedPlaceIds}
    shops={driftMode ? [] : mapShops}
    onSelectShop={onSelectShop}
    onSelect={onSelect}
    quests={driftMode ? [] : questsHere}
    progress={quests.data?.progress ?? NO_PROGRESS}
    onOpenQuest={(id) => { setExpandedMap(false); onOpenQuest(id); }}
    explored={explored.data?.places ?? NO_EXPLORED}
    stops={busStops}
    here={here}
    way={way}
    wayIsRoute={route !== null}
    fairLots={lots}
    fairFocus={lotShown}
    driftPoints={driftMode ? visibleDriftPoints : []}
    onSelectDriftPoint={onSelectDriftPoint}
    interactive
    fullScreenControls
    height={height}
    compact={false}
  />);
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
      {(offlineStamp || shopOfflineStamp || !online) ? <View style={{ marginHorizontal: gutter, marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: '#FFF3D6' }}>
        <Pressable onPress={() => setCachePanel(!cachePanel)} accessibilityRole="button" accessibilityLabel={t({ en: 'Offline data settings', th: 'จัดการข้อมูลออฟไลน์', zh: '离线数据设置' })}>
          <Text style={{ color: '#123B64', fontWeight: '700' }}>{offlineStamp || shopOfflineStamp ? t({ en: 'Using cached data · information may have changed', th: 'กำลังใช้ข้อมูลที่บันทึกไว้ · ข้อมูลอาจเปลี่ยนแล้ว', zh: '正在使用缓存数据 · 信息可能已变化' }) : t({ en: 'No network · showing what was already loaded', th: 'ไม่มีสัญญาณ · แสดงข้อมูลที่โหลดไว้แล้ว', zh: '无网络 · 显示已加载的数据' })}  ▾</Text>
          {offlineMap ? <Text style={{ color: '#684B12', fontSize: 12, marginTop: 3 }}>{t({ en: 'Map from saved tiles · only areas you have opened', th: 'แผนที่จากข้อมูลที่บันทึกไว้ · เฉพาะบริเวณที่เคยเปิด', zh: '地图来自已保存的瓦片 · 仅限你打开过的区域' })}</Text> : null}
        </Pressable>
        {offlineStamp || shopOfflineStamp ? <Text style={{ color: '#684B12', fontSize: 12, marginTop: 3 }}>{t({ en: 'Last successful update: ', th: 'อัปเดตสำเร็จล่าสุด: ', zh: '上次成功更新：' })}{formatDateTime(offlineStamp ?? shopOfflineStamp!)} · {formatInteger(Math.max(0, Math.floor((Date.now() - Date.parse(offlineStamp ?? shopOfflineStamp!)) / 3600_000)))} {t({ en: 'hours old', th: 'ชั่วโมงที่ผ่านมา', zh: '小时前' })}</Text> : null}
        {cachePanel ? <View style={{ marginTop: 8, gap: 5 }}>
          {storageSummary ? <Text style={{ color: '#435E70', fontSize: 12 }}>{t({ en: 'Saved data', th: 'ข้อมูลที่บันทึก', zh: '已保存数据' })}: {storageSummary.records.length} · {storageSummary.areas.length} {t({ en: 'areas', th: 'พื้นที่', zh: '区域' })} · {(storageSummary.totalBytes / 1024).toFixed(1)} KB</Text> : null}
          {(['places', 'shops'] as const).map((kind) => <Text key={kind} style={{ color: '#435E70', fontSize: 12 }}>{kind === 'places' ? t({ en: 'Places', th: 'สถานที่', zh: '地点' }) : t({ en: 'Services', th: 'สถานบริการ', zh: '服务' })}: {cacheInfo?.[kind] ? `${formatInteger(cacheInfo[kind].data.length)} · ${t({ en: 'saved', th: 'บันทึก', zh: '保存' })} ${formatDateTime(cacheInfo[kind].downloadedAt)} · ${t({ en: 'expires', th: 'หมดอายุ', zh: '过期' })} ${formatDate(cacheInfo[kind].expiresAt)}` : t({ en: 'No saved data', th: 'ไม่มีข้อมูลที่บันทึก', zh: '无缓存数据' })}</Text>)}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 5 }}>
            <Pressable onPress={() => { places.reload(); shops.reload(); }} accessibilityRole="button"><Text style={{ color: '#0077B6' }}>{t({ en: 'Refresh area', th: 'อัปเดตพื้นที่นี้', zh: '刷新区域' })}</Text></Pressable>
            <Pressable onPress={() => { void deleteAreaCache(area.key).then(() => setCacheRevision((v) => v + 1)).catch(() => onToast(t({ en: 'Could not delete saved data', th: 'ลบข้อมูลที่บันทึกไม่สำเร็จ', zh: '无法删除缓存数据' }))); }} accessibilityRole="button"><Text style={{ color: '#B91C1C' }}>{t({ en: 'Delete area cache', th: 'ลบแคชพื้นที่นี้', zh: '删除区域缓存' })}</Text></Pressable>
            <Pressable onPress={() => { if (!confirmClear) { setConfirmClear(true); return; } void Promise.all([clearPublicCache(), clearCachedImages()]).then(() => { setConfirmClear(false); setCacheRevision((v) => v + 1); }).catch(() => onToast(t({ en: 'Could not delete saved data', th: 'ลบข้อมูลที่บันทึกไม่สำเร็จ', zh: '无法删除缓存数据' }))); }} accessibilityRole="button"><Text style={{ color: '#B91C1C' }}>{confirmClear ? t({ en: 'Confirm delete all', th: 'ยืนยันลบทั้งหมด', zh: '确认全部删除' }) : t({ en: 'Delete all saved data', th: 'ลบข้อมูลทั้งหมด', zh: '删除全部缓存' })}</Text></Pressable>
          </View>
        </View> : null}
      </View> : null}
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
            <TextInput value={shopSearch} onChangeText={setShopSearch} placeholder={t({ en: 'Search places, services or categories', th: 'ค้นหาสถานที่ บริการ หรือประเภท', zh: '搜索地点、服务或类别' })} style={{ borderWidth: 1, borderColor: '#DCECEF', borderRadius: 12, padding: 9, color: '#123B64' }} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 8 }}>
              {['', ...shopCategories].map((category) => <Pressable key={category || 'all'} onPress={() => setShopCategory(category)} style={{ borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: shopCategory === category ? '#0077B6' : '#EAF7FB' }}><Text style={{ color: shopCategory === category ? '#fff' : '#123B64', fontSize: 12 }}>{category ? mapShopCategory(category) : t({ en: 'All businesses', th: 'ร้านค้าทั้งหมด', zh: '全部商家' })}</Text></Pressable>)}
              <Pressable onPress={() => setShopMinRating(shopMinRating ? 0 : 4)} style={{ padding: 6, backgroundColor: shopMinRating ? '#0077B6' : '#EAF7FB', borderRadius: 14 }}><Text style={{ color: shopMinRating ? '#fff' : '#123B64', fontSize: 12 }}>★ 4+</Text></Pressable>
              <Pressable onPress={() => setShopsOpenOnly(!shopsOpenOnly)} style={{ padding: 6, backgroundColor: shopsOpenOnly ? '#0077B6' : '#EAF7FB', borderRadius: 14 }}><Text style={{ color: shopsOpenOnly ? '#fff' : '#123B64', fontSize: 12 }}>{t({ en: 'Open now', th: 'เปิดอยู่', zh: '正在营业' })}</Text></Pressable>
            </ScrollView>
            {shops.loading && !shops.data ? <Body size={13}>{t({ en: 'Loading businesses…', th: 'กำลังโหลดร้านค้า...', zh: '正在加载商家…' })}</Body> : null}
            {/*
              Offline, "Try again" is a button that cannot work.

              The shop list is only cached for an area somebody has opened
              WITH a connection, so arriving at a new area offline leaves the
              fallback with no snapshot to return. The screen then said
              "Could not load businesses. Try again." in red, under a banner
              already explaining that the rest of the page came from cache -
              one failure described two ways, and the only offered action was
              a retry guaranteed to fail. Offline it now says what is
              actually true and what would fix it, and stays a flat note
              rather than an error: nothing is broken, the area was simply
              never saved.
            */}
            {shops.error ? (!online
              ? <Body size={13} colour="#684B12">{t({ en: 'No saved businesses for this area. Open it once with a connection to keep them offline.', th: 'ยังไม่ได้บันทึกร้านค้าของพื้นที่นี้ เปิดพื้นที่นี้ตอนมีสัญญาณหนึ่งครั้งเพื่อเก็บไว้ใช้ออฟไลน์', zh: '尚未保存此区域的商家。请在有网络时打开一次以离线保存。' })}</Body>
              : <Pressable onPress={shops.reload}><Body size={13} colour="#B91C1C">{t({ en: 'Could not load businesses. Try again.', th: 'โหลดร้านค้าไม่สำเร็จ · ลองใหม่', zh: '商家加载失败 · 请重试' })}</Body></Pressable>
            ) : null}
          </View>
          {fairPanel}
          {recommendedPlaces.length ? (
            <View style={{ marginHorizontal: gutter, marginBottom: 10, padding: 12, borderRadius: 16, backgroundColor: '#EAF9F7', borderWidth: 1, borderColor: '#8FD8D3' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Heading size={14}>{t({ en: 'AI-recommended places', th: 'สถานที่ที่ AI แนะนำ', zh: 'AI 推荐地点' })}</Heading>
                  <Body size={13} colour={color.neutral600} style={{ marginTop: 3 }}>{recommendedPlaces.map((place) => t(place.name)).join(' · ')}</Body>
                </View>
                <Pressable onPress={onClearRecommendations} accessibilityRole="button" accessibilityLabel={t({ en: 'Clear recommended markers', th: 'ล้างหมุดแนะนำ', zh: '清除推荐标记' })} style={{ minHeight: 36, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }}>
                  <Body size={13} colour={color.brand}>{t({ en: 'Clear', th: 'ล้าง', zh: '清除' })}</Body>
                </Pressable>
              </View>
            </View>
          ) : null}
          {wayTo ? (
            <WayBanner
              place={wayTo}
              route={route}
              loading={routing}
              failed={routeFailed}
              refusal={routeRefused}
              haveHere={here !== null}
              mode={wayMode}
              onMode={setWayMode}
              onClear={() => onClearWay?.()}
              onNavigate={onNavigate ? () => onNavigate(wayTo) : undefined}
            />
          ) : null}
          {mode === 'map' ? (
            <>
            {hasDiorama ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: gutter, marginBottom: 8 }}>
                {([
                  ['map', t({ en: 'Map', th: 'แผนที่', zh: '地图' })],
                  ['island', t({ en: 'The island', th: 'มุมเกาะ', zh: '岛屿视角' })],
                  ['drift', t({ en: 'Floating debris forecast', th: 'พยากรณ์ขยะลอย', zh: '海漂垃圾预报' })],
                ] as const).map(([value, label]) => (
                  <Pressable
                    key={String(value)}
                    onPress={() => { setMapChoice(value); setSelectedDriftPoint(null); }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: activeMapChoice === value }}
                    accessibilityLabel={label}
                    style={{
                      minHeight: 38, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1,
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      borderColor: activeMapChoice === value ? '#0077B6' : '#D1E8EE',
                      backgroundColor: activeMapChoice === value ? '#0077B6' : '#FFFFFF',
                    }}
                  >
                    {value === 'drift' ? <Waves size={15} color={activeMapChoice === value ? '#FFFFFF' : '#0077B6'} /> : null}
                    <Body size={13} colour={activeMapChoice === value ? '#FFFFFF' : '#31485A'}>{label}</Body>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {driftMode ? (
              <View style={{ marginHorizontal: gutter, marginBottom: 10, padding: 14, borderRadius: 18, backgroundColor: '#073E59', borderWidth: 1, borderColor: '#1B7089' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F6177' }}><Waves size={22} color="#8DE8EA" /></View>
                  <View style={{ flex: 1 }}>
                    <Heading size={18} colour="#FFFFFF">{t({ en: 'Floating debris forecast · Ko Sichang', th: 'พยากรณ์ขยะลอย · เกาะสีชัง', zh: '锡昌岛海漂垃圾预报' })}</Heading>
                    <Body size={13} colour="#C9EEF2" style={{ marginTop: 3 }}>{t({ en: 'Tap a numbered point to see why that shoreline should be surveyed.', th: 'แตะจุดตัวเลขเพื่อดูว่าทำไมควรสำรวจชายฝั่งจุดนั้น', zh: '点击编号查看为何应该巡查该段海岸。' })}</Body>
                  </View>
                </View>
                <Body size={13} colour="#F9E5A9" style={{ marginTop: 10 }}>{t({ en: 'Planning model only · not a live litter report and not a litter count.', th: 'แบบจำลองเพื่อวางแผนเท่านั้น · ไม่ใช่รายงานพบขยะสด และไม่ใช่จำนวนชิ้นขยะ', zh: '仅供规划参考 · 不是实时垃圾报告，也不是垃圾数量。' })}</Body>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingTop: 10 }}>
                  {([
                    ['all', { en: 'Whole island', th: 'ทั้งเกาะ', zh: '全岛' }],
                    ['north', { en: 'North', th: 'เหนือ', zh: '北' }],
                    ['east', { en: 'East', th: 'ตะวันออก', zh: '东' }],
                    ['south', { en: 'South', th: 'ใต้', zh: '南' }],
                    ['west', { en: 'West', th: 'ตะวันตก', zh: '西' }],
                  ] as const).map(([side, label]) => <Pressable key={side} onPress={() => { setDriftSide(side); setSelectedDriftPoint(null); }} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: driftSide === side ? '#FFFFFF' : '#155D72', borderWidth: 1, borderColor: driftSide === side ? '#FFFFFF' : '#4A8798' }}><Body size={13} colour={driftSide === side ? '#073E59' : '#E5F8FA'}>{t(label)}</Body></Pressable>)}
                </ScrollView>
              </View>
            ) : null}
            {driftMode && driftSnapshot.loading ? <View style={{ marginHorizontal: gutter, marginBottom: 10 }}><Body size={13}>{t({ en: 'Loading shoreline forecast…', th: 'กำลังโหลดพยากรณ์ชายฝั่ง...', zh: '正在加载海岸预报…' })}</Body></View> : null}
            {driftMode && !driftSnapshot.loading && visibleDriftPoints.length === 0 ? <View style={{ marginHorizontal: gutter, marginBottom: 10, padding: 12, borderRadius: 14, backgroundColor: '#FFF3D6' }}><Body size={13} colour="#684B12">{t({ en: 'Forecast data is unavailable for this view. No debris location will be guessed.', th: 'ไม่มีข้อมูลพยากรณ์สำหรับมุมมองนี้ ระบบจะไม่คาดเดาตำแหน่งขยะ', zh: '当前视图无预报数据，系统不会猜测垃圾位置。' })}</Body></View> : null}
            {hasDiorama && diorama ? (
              <View style={{ marginHorizontal: gutter }}>
                <IslandDiorama
                  height={320}
                  here={here}
                  route={way}
                  openable={dioramaOpenable}
                  onSelectPlace={onOpenPlace}
                />
              </View>
            ) : (
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
              /*
                Keyed by AREA alone. It used to carry `offlineMap` as well,
                from when going offline swapped one map for another and the
                remount was the swap. Both are the same map now, so that
                part only threw MapLibre away and rebuilt it - losing the
                pan and zoom somebody was in the middle of - every time the
                signal flickered.
              */
              key={area.key}
                            area={area}
              storied={storied}
              tales={tales}
              onOpenStory={openStory}
              places={driftMode ? [] : visible}
              highlightedPlaceIds={recommendedPlaceIds}
              shops={driftMode ? [] : mapShops}
              onSelectShop={onSelectShop}
              onSelect={onSelect}
              quests={driftMode ? [] : questsHere}
              progress={quests.data?.progress ?? NO_PROGRESS}
              onOpenQuest={onOpenQuest}
              explored={explored.data?.places ?? NO_EXPLORED}
              stops={busStops}
              here={here}
              way={way}
              wayIsRoute={route !== null}
              fairLots={lots}
              fairFocus={lotShown}
              driftPoints={driftMode ? visibleDriftPoints : []}
              onSelectDriftPoint={onSelectDriftPoint}
              interactive={false}
            />
            <Pressable
              onPress={() => setExpandedMap(true)}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'Expand map', th: 'ขยายแผนที่', zh: '展开地图' })}
              style={{ position: 'absolute', top: 12, right: 12, width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D1E8EE', elevation: 4, shadowColor: '#123B64', shadowOpacity: 0.16, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}
            ><Expand size={20} color="#0077B6" /></Pressable>
            {selectedDriftPoint && driftMode ? (
              <View style={{ position: 'absolute', left: 12, right: 12, bottom: 12 }}>
                <CoastalDriftSelectionCard point={selectedDriftPoint} file={driftSnapshot.data ?? null} />
              </View>
            ) : selectedPlace || selectedShop ? (
              <View style={{ position: 'absolute', left: 12, right: 12, bottom: 12 }}>
                <MapSelectionCard
                  place={selectedPlace}
                  shop={selectedShop}
                  onOpen={() => selectedPlace ? onOpenPlace(selectedPlace.id) : selectedShop ? onOpenShop?.(selectedShop.id) : undefined}
                  onNavigate={selectedPlace && onNavigate
                    ? () => onNavigate(selectedPlace)
                    : selectedShop && selectedShop.lat !== null && selectedShop.lng !== null && onNavigateShop
                      ? () => onNavigateShop(selectedShop)
                      : undefined}
                />
              </View>
            ) : null}
            </View>
            )}
            {/*
              Under the map, not inside it: the drawn island has no roads and
              no scale, so the one thing it cannot say is which way to walk.
              The feed mode below already lists places, so this rides with the
              MAP, where somebody is looking at a shape and asking where they
              are.
            */}
            {!driftMode ? <NearYou places={visible} here={here} onSelect={(place) => onOpenPlace(place.id)} /> : null}
            </>
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
              {visibleShops.map((shop) => <Pressable key={`shop-${shop.id}`} onPress={() => onOpenShop?.(shop.id)} style={{ marginHorizontal: gutter, marginBottom: 8, borderRadius: 14, backgroundColor: '#fff', padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}><Store color="#F77F00" /><View><Heading size={15}>{shop.name}</Heading><Body size={13}>{mapShopCategory(shop.category)} · {shop.rating === null ? t({ en: 'No reviews yet', th: 'ยังไม่มีรีวิว', zh: '还没有评价' }) : `★ ${shop.rating}`}</Body></View></Pressable>)}
            </View>
          )}
          {/*
            The bar at the foot of the map, from the journey sketch: post
            without opening a place first. Only when there is somewhere for a
            clip to land - with no pins the honest message is the empty one
            below, not an offer to post into nothing.
          */}
          {!driftMode && visible.length > 0 ? (
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

          {!driftMode && visible.length === 0 && visibleShops.length === 0 ? (
            <View style={{ padding: gutter }}>
              <Body colour={color.neutral700}>
                {areaPlaces.length === 0
                  ? t({ en: 'No places in this area yet.', th: 'ยังไม่มีสถานที่ในพื้นที่นี้', zh: '这一带还没有地点。' })
                  : t({ en: 'No places match the active layers.', th: 'ไม่มีสถานที่ตรงกับตัวกรองที่เลือก', zh: '没有地点符合当前选中的图层。' })}
              </Body>
            </View>
          ) : null}

          {/*
            Where to hand in waste you have already sorted.

            It sits under the places rather than beside them because a
            drop-off point is not a place: it cannot be checked in at, it
            earns nothing for arriving, and it has no business in the
            passport. It is here on the map because the one fact somebody
            needs - which one is nearest, and how far - is a map fact.

            It renders its own empty state, which is the state today, and
            says why in words rather than hiding and leaving somebody to
            guess whether the island has none or the feature broke.
          */}
          {!driftMode ? (
            <View style={{ padding: gutter, paddingTop: 0 }}>
              <DropOffLayer here={here} points={dropOffPointsIn(area.bbox)} onRoute={onNavigateDropOff} />
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
            padding: 16,
            backgroundColor: '#F4FEFD',
            borderWidth: 1,
            borderColor: '#A9E5DF',
            borderRadius: 22,
          },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#D9F8F4', alignItems: 'center', justifyContent: 'center' }}>
            <MessageCircle size={20} color={color.brand} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Heading size={16}>{t({ en: 'Let AI help plan?', th: 'ให้ AI ช่วยวางแผนไหม?', zh: '让 AI 帮你规划？' })}</Heading>
            <Body size={13} colour={color.neutral600} style={{ marginTop: 3 }}>
              {t({ en: 'Suggestions based on your area and time', th: 'แนะนำจากพื้นที่และเวลาของคุณ', zh: '根据你所在区域和时间推荐' })}
            </Body>
          </View>
          <ChevronRight size={18} color={color.brand} strokeWidth={2} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {[t({ en: 'Half-day trip', th: 'ทริปครึ่งวัน', zh: '半日游' }), t({ en: 'Near me', th: 'ที่เที่ยวใกล้ฉัน', zh: '附近景点' })].map((label) => (
            <View key={label} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CDECE8' }}>
              <Label size={10} tracking={0} colour={color.brand} style={{ textTransform: 'none' }}>{label}</Label>
            </View>
          ))}
        </View>
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
        {/*
          THE MAP FILLS THE SCREEN AND MOVES ITSELF.

          This was two nested scroll views holding a canvas twice the size of
          the screen, and the map was dragged around inside them like a
          photograph. That was the right shape when the expanded map WAS a
          picture - the drawn SVG island, which has nothing to pan to beyond
          its own edges. It is the wrong shape for a real map: the pan hit a
          wall at the edge of that doubled canvas, a pinch did nothing
          because the scroll views ate the second finger, and the zoom was
          whatever the thing had been built at.

          Drawn at the screen's own size, every gesture reaches MapLibre:
          drag goes anywhere, pinch zooms, double-tap zooms in, and the
          recentre button flies back to the island instead of scrolling a
          frame back to the middle.
        */}
        <View style={{ height: windowHeight, width: windowWidth, backgroundColor: '#EAF7FB' }}>{expandedMapContent(windowHeight)}</View>
        {selectedPlace || selectedShop ? (
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: Platform.OS === 'web' ? 24 : 32 }}>
            <MapSelectionCard
              place={selectedPlace}
              shop={selectedShop}
              onOpen={() => {
                setExpandedMap(false);
                if (selectedPlace) onOpenPlace(selectedPlace.id);
                else if (selectedShop) onOpenShop?.(selectedShop.id);
              }}
              onNavigate={selectedPlace && onNavigate
                ? () => { setExpandedMap(false); onNavigate(selectedPlace); }
                : selectedShop && selectedShop.lat !== null && selectedShop.lng !== null && onNavigateShop
                  ? () => { setExpandedMap(false); onNavigateShop(selectedShop); }
                  : undefined}
            />
          </View>
        ) : null}
        <Pressable
          onPress={() => setExpandedMap(false)}
          accessibilityRole="button"
          accessibilityLabel={t({ en: 'Back to map', th: 'กลับไปหน้าแผนที่', zh: '返回地图' })}
          style={{ position: 'absolute', top: fullMapControlTop, left: 14, width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2EEF4', elevation: 5, shadowColor: '#123B64', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }}
        ><ArrowLeft size={26} color="#0077B6" strokeWidth={2.8} /></Pressable>
        {expandedLayers ? <View style={{ position: 'absolute', left: 82, bottom: Platform.OS === 'web' ? 100 : 118, width: Math.min(330, Math.max(200, windowWidth - 100)), backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden', elevation: 8, shadowColor: '#123B64', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
          <LayerChips layers={layers} onToggle={(key) => onToggleLayer(key as LayerKey)} />
        </View> : null}
        {/*
          Zoom, on the opposite edge from the layers so a thumb reaching for
          one cannot catch the other. Native only: the browser's map carries
          MapLibre's own controls and would end up with two sets.
        */}
        {Platform.OS !== 'web' ? (
          <View style={{ position: 'absolute', right: 16, bottom: selectedPlace || selectedShop ? 218 : 42, gap: 12 }}>
            <Pressable
              onPress={() => expandedZoom.current?.zoomIn()}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'Zoom in', th: 'ขยายแผนที่', zh: '放大' })}
              style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2EEF4', elevation: 5, shadowColor: '#123B64', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }}
            ><Plus size={26} color="#12283D" strokeWidth={2.8} /></Pressable>
            <Pressable
              onPress={() => expandedZoom.current?.zoomOut()}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'Zoom out', th: 'ย่อแผนที่', zh: '缩小' })}
              style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2EEF4', elevation: 5, shadowColor: '#123B64', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }}
            ><Minus size={26} color="#12283D" strokeWidth={2.8} /></Pressable>
            <Pressable
              onPress={() => { expandedZoom.current?.toggleSatellite(); setExpandedSat((on) => !on); }}
              accessibilityRole="button"
              accessibilityState={{ selected: expandedSat }}
              accessibilityLabel={t({ en: 'Satellite imagery', th: 'ภาพถ่ายดาวเทียม', zh: '卫星影像' })}
              style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: expandedSat ? '#0077B6' : '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: expandedSat ? '#0077B6' : '#E2EEF4', elevation: 5, shadowColor: '#123B64', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }}
            ><Satellite size={25} color={expandedSat ? '#FFFFFF' : '#12283D'} strokeWidth={2.5} /></Pressable>
          </View>
        ) : null}
        <View style={{ position: 'absolute', left: 16, bottom: selectedPlace || selectedShop ? 156 : Platform.OS === 'web' ? 24 : 42, gap: 12 }}>
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
              // Frames the whole area again. There is no scroll frame to put
              // back any more - the map itself is what moved.
              else expandedZoom.current?.recentre();
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

/**
 * The words a place may wear on the map card, in every language it needs.
 *
 * Keyed by the TAG in the seed. One entry today: the island gained a stay on
 * 15 November, and a guest house labelled "Place" beside a shop labelled
 * "ที่พัก" reads as the app knowing less about the thing it knows more about.
 *
 * The next kind joins it the day somebody writes its three words, which is
 * the whole admission price — a tag with no translation is not shown, because
 * a raw English tag would be a worse card for a Thai reader, not a better one.
 */
const PLACE_KIND: Record<string, { en: string; th: string; zh: string } | undefined> = {
  Accommodation: { en: 'Accommodation', th: 'ที่พัก', zh: '住宿' },
};

export function MapSelectionCard({
  place,
  shop,
  onOpen,
  onNavigate,
}: {
  place: ScoredPlace | null;
  shop: Shop | null;
  onOpen: () => void | undefined;
  onNavigate?: () => void;
}) {
  if (!place && !shop) return null;
  const title = place ? t(place.name) : shop!.name;
  const image = place?.photo ? photoUri(place.photo.url) : shop?.coverUrl ? shopImageUri(shop.coverUrl) : null;
  /*
    A PLACE SAYS WHAT KIND OF THING IT IS, when the app has the word.

    The line beside a shop has always been its category - ที่พัก, ร้านอาหาร -
    and a place said only "Place", because it had nothing better to say. It
    does now: Koniix Garden Cottage is tagged Accommodation, and a card that
    calls a guest house "Place" while the shop beside it says "ที่พัก" is the
    map being vaguer about the thing it knows more about.

    ONLY TAGS WITH A TRANSLATION. Tags are English content written in the
    seed; printing one raw would hand a Thai reader "Accommodation" where
    they used to read สถานที่, which is a worse card, not a better one. So a
    tag appears here only once somebody has written it in all three
    languages, and everything else keeps the old word.
  */
  const kind = place?.tags.map((tag) => PLACE_KIND[tag]).find(Boolean);
  const eyebrow = place
    ? t(kind ?? { en: 'Place', th: 'สถานที่', zh: '地点' })
    : mapShopCategory(shop!.category);
  const detail = place
    ? `${t({ en: 'Healthy score', th: 'คะแนนสุขภาวะ', zh: '健康评分' })} ${place.healthyScore}`
    : shop!.rating === null
      ? t({ en: 'No reviews yet', th: 'ยังไม่มีรีวิว', zh: '暂无评价' })
      : `★ ${shop!.rating.toFixed(1)} (${shop!.reviewCount})`;
  return (
    <View>
      {onNavigate ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t({ en: `Navigate to ${title}`, th: `นำทางไป ${title}`, zh: `导航至 ${title}` })}
          onPress={onNavigate}
          style={({ pressed }) => [shadow.md, {
            alignSelf: 'flex-end',
            marginBottom: 10,
            minHeight: 46,
            paddingHorizontal: 18,
            borderRadius: 23,
            backgroundColor: pressed ? '#006A94' : '#008FB5',
            borderWidth: 2,
            borderColor: '#FFFFFF',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }]}
        >
          <Navigation size={20} color="#FFFFFF" fill="rgba(255,255,255,0.18)" strokeWidth={2.6} />
          <Text style={{ color: '#FFFFFF', fontSize: 15, lineHeight: 20, fontWeight: '800' }}>
            {t({ en: 'Navigate', th: 'นำทาง', zh: '导航' })}
          </Text>
        </Pressable>
      ) : null}
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t({ en: `Open details for ${title}`, th: `เปิดรายละเอียด ${title}`, zh: `查看 ${title} 详情` })}
      onPress={onOpen}
      style={({ pressed }) => [shadow.md, {
        minHeight: 104,
        padding: 10,
        borderRadius: 22,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#D4E9EF',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        opacity: pressed ? 0.88 : 1,
      }]}
    >
      <View style={{ width: 88, height: 82, borderRadius: 16, overflow: 'hidden', backgroundColor: '#DDF4FA', alignItems: 'center', justifyContent: 'center' }}>
        {image ? <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : place ? <MapIcon size={32} color="#0077B6" /> : <Store size={32} color="#F77F00" />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Label size={9} tracking={0.12} colour={place ? color.accent700 : color.brand}>{eyebrow}</Label>
        <Text numberOfLines={1} style={{ marginTop: 3, color: color.text, fontSize: 18, lineHeight: 23, fontWeight: '800' }}>{title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: place && place.healthyScore >= 65 ? '#22A75A' : shop?.rating !== null && shop?.rating !== undefined ? '#F59E0B' : '#94A3B8' }} />
          <Body size={13} colour={color.neutral700}>{detail}</Body>
        </View>
      </View>
      <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: color.brandSoft }}>
        <ChevronRight size={22} color={color.brand} strokeWidth={2.5} />
      </View>
    </Pressable>
    </View>
  );
}

export function CoastalDriftSelectionCard({ point, file }: { point: CoastalDriftPoint; file: CoastalDriftFile | null }) {
  const fill = point.attention === 'higher' ? '#F47B20' : point.attention === 'watch' ? '#F2B84B' : '#8CA3A9';
  const arrival = point.firstHours === null
    ? t({ en: 'No first-contact time in this model run', th: 'ไม่มีเวลาแตะฝั่งครั้งแรกในผลจำลองชุดนี้', zh: '本次模型运行无首次触岸时间' })
    : t({ en: `First modelled contact around ${point.firstHours} hours`, th: `แบบจำลองเริ่มแตะฝั่งราว ${point.firstHours} ชม.`, zh: `模型约在 ${point.firstHours} 小时后首次触岸` });
  return (
    <View style={[shadow.md, { padding: 14, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CFE4EA' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: fill, borderWidth: 3, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' }}><Heading size={13} colour="#102A3A">{point.rank}</Heading></View>
        <View style={{ flex: 1 }}>
          <Label size={9} tracking={0.1} colour="#0B6D83">{t(point.attentionLabel).toUpperCase()}</Label>
          <Heading size={16}>{t(point.sideLabel)} · {t(point.locationLabel)}</Heading>
        </View>
      </View>
      <Body size={13} colour="#31485A" style={{ marginTop: 9 }}>{arrival}</Body>
      <Body size={13} colour="#5A6E79" style={{ marginTop: 5 }}>{t({
        en: `The ${file?.window ?? 6}-hour research run recorded ${formatInteger(point.count)} simulated shoreline contacts here. This number is not pieces of rubbish.`,
        th: `ผลจำลอง ${file?.window ?? 6} ชั่วโมงมีอนุภาคสมมติแตะชายฝั่งตรงนี้ ${formatInteger(point.count)} ครั้ง ตัวเลขนี้ไม่ใช่จำนวนชิ้นขยะ`,
        zh: `${file?.window ?? 6} 小时研究模型在此记录 ${formatInteger(point.count)} 次模拟触岸；该数字不是垃圾件数。`,
      })}</Body>
      <View style={{ marginTop: 9, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E2EEF2' }}>
        <Body size={13} colour="#6B7F89">{t({ en: 'Source', th: 'แหล่งข้อมูล', zh: '数据源' })}: {file?.source ?? '—'}</Body>
        <Body size={13} colour="#6B7F89" style={{ marginTop: 2 }}>{t({ en: 'Model issued', th: 'ออกผลจำลอง', zh: '模型发布' })}: {file?.issued ? formatDateTime(file.issued) : '—'} · {t({ en: 'Uncalibrated', th: 'ยังไม่ผ่านการสอบเทียบ', zh: '未校准' })}</Body>
      </View>
    </View>
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
      <TravelHeroBackdrop compact focalPoint="right" />

      {/* Row 1: Greeting & Area Name on Left, ChivarGo Logo + Profile on Right (matching Home screen) */}
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
            accessibilityLabel="ChivarGo"
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
          `${formatInteger(balances.green)} ${t(strings.common.greenPoints)}, `
          + `${t(strings.common.greenPointsNote)}. `
          + `${formatInteger(balances.trip)} ${t(strings.common.tripPoints)}, `
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
              {t({ en: 'Your points', th: 'แต้มของคุณ', zh: '你的积分' })}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                <Heading size={16} colour="#004B7E" style={{ fontWeight: '800' }}>
                  {formatInteger(balances.green)}
                </Heading>
                <Label size={10} tracking={0.1} colour="#006EA8" style={{ fontWeight: '700' }}>
                  {t(strings.wallet.green)}
                </Label>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                <Heading size={13} colour="#396184" style={{ fontWeight: '700' }}>
                  {formatInteger(balances.trip)}
                </Heading>
                <Label size={9} tracking={0.1} colour="#52749D" style={{ fontWeight: '600' }}>
                  {t(strings.wallet.trip)}
                </Label>
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
            <View style={{ backgroundColor: top.rewardExp != null ? '#FFD166' : currencyTone(top.rewardCurrency).fill, paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.sm }}>
              <Heading size={13} colour={top.rewardExp != null ? '#493300' : currencyTone(top.rewardCurrency).on}>
                {top.rewardExp != null ? `+${top.rewardExp} XP` : `+${top.rewardPoints} ${top.rewardCurrency === 'green' ? 'G' : 'T'}`}
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
