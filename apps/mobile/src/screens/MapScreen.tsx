/**
 * Smart Map - the hero screen.
 *
 * Healthy Score pins over Koh Samui, the layer filter, and the quests-near-you
 * card. Scores arrive already computed and personalised from the API; the
 * client never calculates one, so the number here and the number in the ESG
 * report come from the same code path.
 */

import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ChevronRight, LayoutGrid, List, MessageCircle } from 'lucide-react-native';
import {
  greetingFor, strings,
  type Balances, type ExploredPlace, type Quest, type QuestProgress, type RouteMode, type ScoredPlace,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { areaOfProvince, inArea, nearestFirst } from '@chivago/core';
import { setArea, useArea } from '../state/area.ts';
import { useHere } from '../state/here.ts';
import { useRoute } from '../state/route.ts';
import { WayBanner } from '../components/WayBanner.tsx';
import { AreaSwitch } from '../components/AreaSwitch.tsx';
import { useAsync, type LayerKey } from '../state/store.tsx';
import { color, currencyTone, gutter, layout, onFill, radius } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { Button, IconButton } from '../components/Button.tsx';
import { LayerChips, PlaceFeedRow, SamuiMap, type MapMode } from '../components/SamuiMap.tsx';
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
  onAskConcierge, onToast,
  onOpenWallet, wayTo = null, onClearWay,
}: {
  layers: Record<LayerKey, boolean>;
  onToggleLayer: (key: LayerKey) => void;
  onPlanDay: () => void;
  onOpenPlace: (id: string) => void;
  onOpenQuest: (id: string) => void;
  onSeeAllQuests: () => void;
  onAskConcierge: () => void;
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
}) {
  const places = useAsync(() => api.places(), []);
  const quests = useAsync(() => api.quests('today'), []);
  // Where they have been. A failure here is a map with its mist down
  // everywhere, which is the truthful default, so it is not surfaced.
  const explored = useAsync(() => api.explored(), []);
  const [mode, setMode] = React.useState<MapMode>('map');
  // WATCHED, unlike every other screen's one-shot: this is the one place
  // that draws the traveller, and a dot that does not move while somebody
  // walks is worse than no dot, because a dot is read as current.
  const here = useHere({ watch: true });
  const area = useArea();
  // Which pins wear a story. One request for the whole area, public.
  const areaStories = useAsync(() => api.areaStories(area.key), [area.key]);
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
    () => (places.data ?? []).filter((p) => areaOfProvince(p.province) === area.key),
    [places.data, area.key],
  );
  const visible = React.useMemo(() => areaPlaces.filter((p) => layers[p.layer]), [areaPlaces, layers]);
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

  return (
    <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>
      <MapHeader
        balances={balances}
        onOpenWallet={onOpenWallet}
        mode={mode}
        onToggleMode={() => setMode(mode === 'map' ? 'feed' : 'map')}
      />

      {places.loading ? <LoadingState /> : null}
      {places.error ? <ErrorState message={places.error} onRetry={places.reload} /> : null}

      {places.data ? (
        <>
          <View style={{ paddingHorizontal: gutter, paddingTop: 10 }}>
            <AreaSwitch area={area.key} onChange={setArea} />
          </View>
          <LayerChips layers={layers} onToggle={(k) => onToggleLayer(k as LayerKey)} />
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
              here={here}
              way={way}
              wayIsRoute={route !== null}
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
                    {t(strings.map.liveNear(visible.length))}
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
        accessibilityLabel="Plan my day"
        style={{
          marginTop: 16,
          marginHorizontal: gutter,
          padding: 16,
          borderWidth: layout.ruleStrong,
          // The one control on this screen that starts something.
          borderColor: color.ctaDeep,
          borderRadius: radius.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
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
        accessibilityLabel="Ask the concierge. Ask in Thai or English."
        style={{
          marginTop: 10,
          marginHorizontal: gutter,
          minHeight: 44,
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderWidth: 1,
          borderColor: color.neutral400,
          borderRadius: radius.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <MessageCircle size={18} color={color.neutral700} strokeWidth={2} />
        <View style={{ flex: 1 }}>
          <Heading size={14}>{t({ en: 'Ask where to go', th: 'ถามว่าไปไหนดี' })}</Heading>
        </View>
        <ChevronRight size={18} color={color.neutral600} strokeWidth={2} />
      </Pressable>

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
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        paddingHorizontal: gutter,
        paddingTop: 16,
        paddingBottom: 12,
        backgroundColor: color.bg,
      }}
    >
      <View style={{ flex: 1 }}>
        {/*
          Island time, like Home. This read "Good morning, John" at every hour
          of the day for an app that collects no names - a prototype string
          that outlived the prototype by fifty commits.
        */}
        <Label size={10} tracking={0.16}>{t(greetingFor(new Date()))}</Label>
        <Heading size={24} tracking={-0.48} style={{ marginTop: 4 }}>{t(area.name)}</Heading>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {/* Handoff open question 1: the feed is a peer treatment, not a hidden
            debug switch, so the toggle ships. */}
        <IconButton
          onPress={onToggleMode}
          accessibilityLabel={mode === 'map' ? 'Switch to list view' : 'Switch to map view'}
        >
          {mode === 'map'
            ? <List size={16} color={color.text} strokeWidth={2} />
            : <LayoutGrid size={16} color={color.text} strokeWidth={2} />}
        </IconButton>

        {/*
          Both currencies, each NAMED.
          
          This read "1,850 G · 640 T". The difference between the two - one
          vouched for by a host, one seen only by the phone - is the whole
          product, and it was compressed into two letters nobody can decode on
          first sight. A word costs a few pixels; an unreadable balance costs
          the pitch.

          It is a button now, too. The full explanation lives in the Wallet and
          a balance you cannot tap is a dead end - the reader's obvious next
          question has no answer anywhere near the thing that raised it.
        */}
        <Pressable
          onPress={onOpenWallet}
          accessibilityRole="button"
          accessibilityLabel={
            `${balances.green.toLocaleString('en-US')} ${t(strings.common.greenPoints)}, `
            + `${t(strings.common.greenPointsNote)}. `
            + `${balances.trip.toLocaleString('en-US')} ${t(strings.common.tripPoints)}, `
            + `${t(strings.common.tripPointsNote)}. Open wallet.`
          }
          style={{
            borderLeftWidth: layout.ruleStrong,
            borderLeftColor: color.text,
            paddingLeft: 10,
            minHeight: 44,
            justifyContent: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
            <Heading size={21} colour={color.accent700}>
              {balances.green.toLocaleString('en-US')}
            </Heading>
            <Label size={10} tracking={0.1} colour={color.accent700}>{t(strings.wallet.green)}</Label>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 1 }}>
            <Heading size={14} colour={color.neutral700}>
              {balances.trip.toLocaleString('en-US')}
            </Heading>
            <Label size={9} tracking={0.1} colour={color.neutral700}>{t(strings.wallet.trip)}</Label>
          </View>
        </Pressable>
      </View>
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
    <View style={{ paddingHorizontal: gutter, paddingTop: 16, paddingBottom: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Label size={10} tracking={0.16}>{t(strings.map.questsNearYou)}</Label>
        <Button label={t(strings.common.seeAll)} onPress={onSeeAll} variant="ghost" />
      </View>

      {top ? (
        <View
          style={{
            borderWidth: layout.ruleHair,
            borderColor: color.neutral300,
            borderRadius: radius.md,
            padding: 14,
            marginTop: 10,
          }}
        >
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
            icon={<ChevronRight size={18} color={onFill.cta} strokeWidth={2} />}
          />
        </View>
      ) : null}

      {error ? <ErrorState message={error} onRetry={onRetry} /> : null}
    </View>
  );
}
