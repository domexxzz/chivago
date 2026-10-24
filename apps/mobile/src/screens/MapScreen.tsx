/**
 * Smart Map - the hero screen.
 *
 * Healthy Score pins over Koh Samui, the layer filter, and the quests-near-you
 * card. Scores arrive already computed and personalised from the API; the
 * client never calculates one, so the number here and the number in the ESG
 * report come from the same code path.
 */

import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { BedDouble, Bell, ChevronRight, LayoutGrid, List, MapPin, MessageCircle, UserRound } from 'lucide-react-native';
import {
  greetingFor, strings,
  type Balances, type ExploredPlace, type Quest, type QuestProgress, type RouteMode, type ScoredPlace,
} from '@chivago/core';
import { api } from '../api/client.ts';
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
import { DepartmentSeal, WaveSymbolBadge } from '../components/MarineEmblem.tsx';
import { MarineSatelliteMapCard } from '../components/MarineSatelliteMap.tsx';
import { WeatherCategoriesBar, type WeatherCategoryKey } from '../components/WeatherCategoriesBar.tsx';
import { StoryViewer } from '../components/Stories.tsx';
import { pickStoryMedia, postStory } from '../state/tell-story.ts';
import type { Story } from '../api/client.ts';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';

// Stable empties, so the map's marker effect is not re-run by a fresh `[]`
// on every render while the quests are still loading.
const NO_QUESTS: Quest[] = [];
const NO_PROGRESS: Record<string, QuestProgress> = {};
const NO_EXPLORED: ExploredPlace[] = [];

export function MapScreen({
  layers, onToggleLayer, onPlanDay, onOpenPlace, onOpenQuest, onSeeAllQuests, balances,
  onAskConcierge, onOpenStays, onToast,
  onOpenWallet, wayTo = null, onClearWay, fairFocus = null, onClearFair, onOpenFair, onBackToFair,
}: {
  layers: Record<LayerKey, boolean>;
  onToggleLayer: (key: LayerKey) => void;
  onPlanDay: () => void;
  onOpenPlace: (id: string) => void;
  onOpenQuest: (id: string) => void;
  onSeeAllQuests: () => void;
  onAskConcierge: () => void;
  /** Stays & tours: asking a local operator (docs/61). */
  onOpenStays?: () => void;
  /** Said out loud when a clip is posted from the bar, or refused. */
  onToast: (msg: string) => void;
  balances: Balances;
  onOpenWallet: () => void;
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
  const quests = useAsync(() => api.quests('today'), []);
  // Where they have been. A failure here is a map with its mist down
  // everywhere, which is the truthful default, so it is not surfaced.
  const explored = useAsync(() => api.explored(), []);
  const [mode, setMode] = React.useState<MapMode>('map');
  const [weatherCategory, setWeatherCategory] = React.useState<WeatherCategoryKey>('waves');
  // WATCHED, unlike every other screen's one-shot: this is the one place
  // that draws the traveller, and a dot that does not move while somebody
  // walks is worse than no dot, because a dot is read as current.
  const here = useHere({ watch: true });
  const area = useArea();
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
    if (!momentAt || posting) return;
    const media = await pickStoryMedia(onToast);
    if (!media) return;
    setPosting(true);
    const ok = await postStory(momentAt.id, media, '', onToast);
    setPosting(false);
    if (ok) { onToast(t(strings.place.storyPosted)); areaStories.reload(); }
  }, [momentAt, posting, onToast, areaStories]);

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
        mode={mode}
        onToggleMode={() => setMode(mode === 'map' ? 'feed' : 'map')}
      />

      {places.data ? null : fairPanel}
      {places.loading ? <LoadingState /> : null}
      {places.error ? <ErrorState message={places.error} onRetry={places.reload} /> : null}

      {places.data ? (
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

          <WeatherCategoriesBar
            selected={weatherCategory}
            onSelect={setWeatherCategory}
          />

          {mode === 'map' && area.key === 'samui' ? (
            <View style={{ marginHorizontal: gutter, marginBottom: 12 }}>
              <MarineSatelliteMapCard
                onOpenQuest={onOpenQuest}
                onSelectStation={(stationName) => {
                  const found = visible.find((p) => p.name.en.toLowerCase().includes(stationName.toLowerCase()) || p.name.th.includes(stationName));
                  if (found) onOpenPlace(found.id);
                }}
              />
            </View>
          ) : null}

          <View style={{ paddingBottom: 8 }}>
            <LayerChips layers={layers} onToggle={(k) => onToggleLayer(k as LayerKey)} />
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
            />
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
            </View>
          )}
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

          {visible.length === 0 ? (
            <View style={{ padding: gutter }}>
              <Body colour={color.neutral700}>
                {areaPlaces.length === 0
                  ? t({ en: 'No places in this area yet.', th: 'ยังไม่มีสถานที่ในพื้นที่นี้' })
                  : t({ en: 'No places match the active layers.', th: 'ไม่มีสถานที่ตรงกับตัวกรองที่เลือก' })}
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
          <Heading size={14}>{t({ en: 'Ask where to go', th: 'ถามว่าไปไหนดี' })}</Heading>
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
    </ScrollView>
  );
}

export function MapHeader({
  balances, mode, onToggleMode, onOpenWallet,
}: {
  balances: Balances; mode: MapMode;
  onToggleMode: () => void; onOpenWallet: () => void;
}) {
  const area = useArea();
  return (
    <View
      style={{
        backgroundColor: '#097097',
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        paddingHorizontal: gutter,
        paddingTop: 16,
        paddingBottom: 18,
        shadowColor: '#00263E',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
        elevation: 4,
        overflow: 'hidden',
      }}
    >
      <OceanBackdrop compact />

      {/* Row 1: Marine Meteorological Emblem + Controls */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <DepartmentSeal size={36} />
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.2 }}>
              ศูนย์ข้อมูลอุตุนิยมทางทะเล
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '500', color: '#D4EEF8' }}>
              กรมอุตุนิยมวิทยา
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="การแจ้งเตือน"
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(255, 255, 255, 0.16)',
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.3)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Bell size={17} color="#FFFFFF" strokeWidth={2} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="โปรไฟล์"
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(255, 255, 255, 0.16)',
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.3)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <UserRound size={17} color="#FFFFFF" strokeWidth={2} />
          </Pressable>

          <IconButton
            inverted
            onPress={onToggleMode}
            accessibilityLabel={mode === 'map'
              ? t({ en: 'Switch to list view', th: 'สลับไปมุมมองรายการ' })
              : t({ en: 'Switch to map view', th: 'สลับไปมุมมองแผนที่' })}
          >
            {mode === 'map'
              ? <List size={16} color="#FFFFFF" strokeWidth={2} />
              : <LayoutGrid size={16} color="#FFFFFF" strokeWidth={2} />}
          </IconButton>
        </View>
      </View>

      {/* Row 2: Greeting & Location */}
      <View style={{ marginTop: 14 }}>
        <Label size={11} tracking={0.16} colour="#D5F6FF">{t(greetingFor(new Date()))}</Label>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
          <Heading size={26} tracking={-0.48} colour="#FFFFFF" style={{ fontWeight: '800' }}>{t(area.name)}</Heading>
          <MapPin size={22} color="#FFFFFF" strokeWidth={2.4} />
        </View>
        <Text style={{ fontSize: 12, fontWeight: '500', color: '#D4EEF8', marginTop: 2 }}>
          {area.key === 'samui' ? 'อ.เกาะสมุย  จ.สุราษฎร์ธานี' : t(area.name)}
        </Text>
      </View>

      {/* Row 3: Floating Card "คลื่นลมวันนี้" */}
      <Pressable
        onPress={onOpenWallet}
        accessibilityRole="button"
        accessibilityLabel={
          `${balances.green.toLocaleString('en-US')} ${t(strings.common.greenPoints)}, `
          + `${t(strings.common.greenPointsNote)}. `
          + `${balances.trip.toLocaleString('en-US')} ${t(strings.common.tripPoints)}, `
          + `${t(strings.common.tripPointsNote)}. ${t({ en: 'Open wallet.', th: 'เปิดกระเป๋าแต้ม' })}`
        }
        style={{
          marginTop: 14,
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
              คลื่นลมวันนี้
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
                  (1,240 ม.)
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
                  (320 กม/ชม)
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
