/**
 * Turn-by-turn, full screen.
 *
 * Four screens in one, and the seam between them is the navigator's state
 * rather than a stack: PREVIEW before setting off, the FOLLOWING view while
 * moving, the same view with the camera handed over for OVERVIEW, and
 * ARRIVED. They share a map, which is the point - the map is built once and
 * never rebuilt, so starting navigation is a camera move rather than a new
 * document.
 *
 * WHAT THE PREVIEW REUSES. The distance and the time before setting off come
 * from `useRoute` - the hook the map's way banner has always used - rather
 * than from a second request of its own. A traveller looking at a place sees
 * the same two numbers whether they are on the map screen or here, because
 * they came from the same call.
 *
 * WHAT IS NOT HERE, deliberately, because each has been asked for before and
 * each is a different feature: no spoken directions, no mute control, no
 * SOS, no background tracking, no alternative routes. The screen has one
 * instruction, three numbers and four buttons.
 */

import React from 'react';
import { Linking, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { ArrowLeft, Crosshair, ExternalLink, Footprints, MapPin, Minus, Plus, Route as RouteIcon } from 'lucide-react-native';
import {
  arrivalAt, formatDistance, formatDuration, isOnKohSichang, mapsDirectionsUrl, maneuverPoint, remainingLine,
  strings, travelledLine,
  type Maneuver, type RouteMode, type RouteRefusal,
} from '@chivago/core';

import { useHere } from '../state/here.ts';
import { useServerConfig } from '../state/server-config.ts';
import { useRoute } from '../state/route.ts';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { useNavigator } from '../navigation/use-navigation.ts';
import { isCameraOwned } from '../navigation/machine.ts';
import type { NavDestination } from '../navigation/session.ts';
import { NavigationMap, type NavigationMapHandle } from '../components/NavigationMap.tsx';
import {
  ACCURACY_RING_FROM_M, accuracyRadius, navigationCamera, navigationPadding,
  pointsFeature, routeBounds,
} from '../components/navigation-layers.ts';
import { NavigationBanner } from '../components/NavigationBanner.tsx';
import { NavigationPanel } from '../components/NavigationPanel.tsx';
import { Button } from '../components/Button.tsx';
import { Body, Heading, Label } from '../components/Type.tsx';
import { color, gutter, onFill, radius, shadow } from '../theme/index.ts';
import { t } from '../i18n/locale.ts';
import { formatTime } from '../i18n/format.ts';

/** Room the banner and the panel take, for the camera's padding. */
const BANNER_H = 96;
const PANEL_H = 150;
// The preview card is taller than the active-navigation panel because it now
// includes both A/B endpoint rows. The preview map ends behind the opaque
// card instead of continuing beneath it, so both endpoint markers remain in
// the part of the map the traveller can actually see.
const PREVIEW_PANEL_H = 380;

/** The map fills the screen; everything else is drawn over it. */
const FILL = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };

export function NavigateScreen({
  destination, onBack, onOpenPlace,
}: {
  /**
   * Null only when this screen is reached without a destination - a deep
   * link, or a restored stack. It renders the one honest thing available in
   * that case rather than an empty navigator.
   */
  destination: NavDestination | null;
  onBack: () => void;
  /** Offered on arrival, when the destination is a place the app knows. */
  onOpenPlace?: (id: string) => void;
}) {
  const [mode, setMode] = React.useState<RouteMode>('walk');
  const { width, height } = useWindowDimensions();
  const map = React.useRef<NavigationMapHandle>(null);
  const [mapFailed, setMapFailed] = React.useState<string | null>(null);
  /*
    WHETHER THE MAP IS THERE TO BE TOLD ANYTHING.

    This is not belt-and-braces over the queue inside the map component; it
    is the thing the queue cannot do. On the web the map is behind a lazy
    import, so for the first few hundred milliseconds `map.current` is NULL -
    there is no component yet to queue into - and every send in that window
    is simply dropped. The effects below have no reason to run again
    afterwards, because their inputs have not changed, so the result was a
    map that drew the island and nothing else: no route, no arrow, and a
    camera still sitting where it opened.

    Making every send depend on this turns the map's arrival into a change
    the effects can see, which re-runs each of them exactly once.

    IT IS A COUNTER, NOT A FLAG, and that is not fussiness - a boolean was
    the first version and it was wrong twice over. A map can report ready
    more than once: the style is rebuilt when the island's hour changes, a
    WebView that crashed comes back, and in development every save
    re-creates it. The second map starts EMPTY, and with a flag already
    true nothing re-ran, so the screen sat over an island with no route,
    no arrow and a camera that had stopped following. Counting the readies
    makes each new map a change the effects can see.
  */
  const [mapGeneration, setMapGeneration] = React.useState(0);
  const onMapReady = React.useCallback(() => setMapGeneration((n) => n + 1), []);
  const [previewPanelHeight, setPreviewPanelHeight] = React.useState(PREVIEW_PANEL_H);
  const onPreviewPanelLayout = React.useCallback((event: { nativeEvent: { layout: { height: number } } }) => {
    const measured = Math.ceil(event.nativeEvent.layout.height);
    if (measured > 0) setPreviewPanelHeight((current) => current === measured ? current : measured);
  }, []);

  /*
    GPS IS THE DEFAULT START, not a hard-coded island centre. A traveller can
    plan ahead from any known Koh Sichang place or tap a coordinate on the
    island map. Mainland origins still belong in Google Maps because this
    navigator has deliberately been scoped to this one island.
  */
  const places = useAsync(() => api.places(), []);
  const originOptions = React.useMemo<NavDestination[]>(
    () => (places.data ?? [])
      .filter(isOnKohSichang)
      .map((place) => ({ id: place.id, name: place.name, lat: place.lat, lng: place.lng })),
    [places.data],
  );
  const [origin, setOrigin] = React.useState<NavDestination | null>(null);
  const [choosingOrigin, setChoosingOrigin] = React.useState(false);
  const [pickingOrigin, setPickingOrigin] = React.useState(false);
  const [pickOriginError, setPickOriginError] = React.useState(false);
  const destinationKey = destination ? `${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}` : '';
  React.useEffect(() => {
    setOrigin(null);
    setChoosingOrigin(false);
    setPickingOrigin(false);
    setPickOriginError(false);
  }, [destinationKey]);

  const chooseMapOrigin = React.useCallback((point: { lat: number; lng: number }) => {
    if (!pickingOrigin) return;
    if (!isOnKohSichang(point)) {
      setPickOriginError(true);
      return;
    }
    const coordinate = `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
    setOrigin({
      id: null,
      name: {
        en: `Map point · ${coordinate}`,
        th: `จุดบนแผนที่ · ${coordinate}`,
        zh: `地图点 · ${coordinate}`,
      },
      lat: point.lat,
      lng: point.lng,
    });
    setPickOriginError(false);
    setPickingOrigin(false);
  }, [pickingOrigin]);

  // The preview's origin: a single fix, not a watcher. Nothing is being
  // followed yet, and a watcher here would run the GPS while somebody reads.
  const here = useHere();
  // The fence is open, so a refused fix is the trial's switch and not the
  // phone's settings: the failure sheet must not send anybody to Settings.
  const { fenceOff } = useServerConfig();
  const previewOrigin = origin ?? here;
  const preview = useRoute(previewOrigin, destination, mode);
  const nav = useNavigator(destination, mode, origin);

  // The machine's own answer, not a list repeated here: a state added there
  // and forgotten here is a camera that silently stops following.
  const following = isCameraOwned(nav.status);
  const previewing = nav.status === 'idle' || nav.status === 'preview'
    || nav.status === 'acquiring-location' || nav.status === 'routing';
  const zoomMap = React.useCallback((delta: 1 | -1) => {
    if (following) nav.releaseCamera();
    map.current?.send({ type: 'ZOOM', delta });
  }, [following, nav.releaseCamera]);

  /*
    WHICH LINE IS ON THE MAP.

    Before setting off it is the preview's - the same line the map screen
    draws, straight when the router said nothing. Once following it is the
    navigator's own, split at the traveller's position so the road behind
    can be drawn differently from the road ahead.
  */
  const drawn = React.useMemo(() => {
    if (nav.route) {
      return {
        remaining: remainingLine(nav.route.line, nav.progress),
        travelled: travelledLine(nav.route.line, nav.progress),
        whole: nav.route.line,
      };
    }
    const line = preview.route?.line
      ?? (previewOrigin && destination
        ? [[previewOrigin.lng, previewOrigin.lat], [destination.lng, destination.lat]] as [number, number][]
        : []);
    return { remaining: line, travelled: [] as [number, number][], whole: line };
  }, [nav.route, nav.progress, preview.route, previewOrigin, destination]);

  const maneuverPoints = React.useMemo(() => {
    if (!nav.route) return [];
    return nav.route.maneuvers
      .map((_, index) => maneuverPoint(nav.route!, index))
      .filter((point): point is { lat: number; lng: number } => point !== null);
  }, [nav.route]);
  const routeStart = React.useMemo(
    () => (drawn.whole[0]
      ? { lng: drawn.whole[0][0], lat: drawn.whole[0][1] }
      : previewOrigin),
    [drawn.whole, previewOrigin],
  );

  // -- Driving the map ------------------------------------------------------

  // The route, sent when the route changes - NOT once per fix. The two lines
  // do change per fix (the split moves), which is why this is keyed on their
  // lengths and endpoints rather than on the route object alone.
  const routeKey = `${drawn.whole.length}:${drawn.travelled.length}:${drawn.remaining.length}`;
  React.useEffect(() => {
    map.current?.send({
      type: 'SET_ROUTE',
      remaining: drawn.remaining,
      travelled: drawn.travelled,
      points: pointsFeature(maneuverPoints, destination, routeStart),
    });
  }, [mapGeneration, routeKey, drawn.remaining, drawn.travelled, maneuverPoints, destination, routeStart]);

  // The arrow and its ring, once per fix. The one message that is allowed to
  // be frequent, and the one that must never touch the document.
  React.useEffect(() => {
    const fix = nav.fix;
    if (!fix) return;
    const ring = fix.accuracyM !== null && fix.accuracyM >= ACCURACY_RING_FROM_M
      ? accuracyRadius(fix.accuracyM, fix.lat)
      : 0;
    map.current?.send({
      type: 'UPDATE_POSITION',
      lng: fix.lng,
      lat: fix.lat,
      bearing: nav.progress?.bearingDeg ?? fix.headingDeg ?? 0,
      accuracyM: fix.accuracyM,
      radius: ring,
    });
  }, [mapGeneration, nav.fix, nav.progress]);

  const padding = React.useMemo(
    () => navigationPadding(width, height, BANNER_H, PANEL_H),
    [width, height],
  );

  // The following camera. Skipped entirely in `overview`, which is the
  // traveller's camera - the progress underneath it keeps running.
  const camera = following ? navigationCamera(nav.progress, nav.fix) : null;
  const firstFrame = React.useRef(true);
  // A new map opens wherever it was built, not where the traveller is. The
  // first frame onto it is a jump, as it was at the start of the trip.
  React.useEffect(() => { firstFrame.current = true; }, [mapGeneration]);
  React.useEffect(() => {
    if (!camera) return;
    map.current?.send({
      type: 'CAMERA',
      centre: camera.centre,
      bearing: camera.bearing,
      zoom: camera.zoom,
      pitch: camera.pitch,
      padding,
      // The first frame jumps; every frame after it eases over roughly the
      // gap between fixes, which is what makes the map glide rather than
      // step. A longer ease than the gap would still be running when the
      // next one replaced it.
      duration: firstFrame.current ? 0 : 900,
    });
    firstFrame.current = false;
  }, [mapGeneration, camera?.centre[0], camera?.centre[1], camera?.bearing, camera?.zoom, camera?.pitch, padding]);

  // The overview, and the preview, both frame the whole route.
  // Router geometry may stop at the nearest walkable road instead of the
  // exact place coordinate. Frame the endpoint markers as well as the road,
  // otherwise B can sit just beyond the fitted line and under the panel.
  const framedCoordinates = React.useMemo(() => [
    ...drawn.whole,
    ...(routeStart ? [[routeStart.lng, routeStart.lat] as [number, number]] : []),
    ...(destination ? [[destination.lng, destination.lat] as [number, number]] : []),
  ], [drawn.whole, routeStart, destination]);
  const bounds = React.useMemo(() => routeBounds(framedCoordinates), [framedCoordinates]);
  const framed = nav.status === 'overview' || previewing || nav.status === 'arrived';
  const boundsKey = bounds ? bounds.flat().join(',') : '';
  React.useEffect(() => {
    if (!framed || !bounds) return;
    firstFrame.current = true;
    map.current?.send({
      type: 'FIT',
      bounds,
      padding: {
        top: previewing ? 70 : BANNER_H,
        bottom: previewing ? 24 : PANEL_H,
        left: 40, right: 40,
      },
    });
  }, [mapGeneration, framed, boundsKey, previewing, previewPanelHeight]);

  // -- What the banner says -------------------------------------------------

  const maneuver: Maneuver | null = nav.route && nav.progress && nav.progress.nextManeuver >= 0
    ? nav.route.maneuvers[nav.progress.nextManeuver] ?? null
    : null;

  /*
    THE NOTE UNDER THE INSTRUCTION, in priority order.

    Only one is shown, and the order is the order a traveller needs to know
    them in: a route that may be stale outranks a weak signal, which
    outranks a reroute in progress. Each is a different thing being wrong
    and each has a different action, which is why none of them is folded
    into a single "something went wrong".
  */
  const note = (() => {
    if (nav.rerouteFailed) return t(strings.navigate.rerouteFailed);
    if (nav.status === 'gps-lost') return t(strings.navigate.gpsLost);
    if (nav.status === 'rerouting') return t(strings.navigate.rerouting);
    if (nav.fromCache && !nav.online) return t(strings.navigate.offlineRoute);
    if (nav.progress && !nav.progress.confident) return t(strings.navigate.weakGps);
    if (nav.progress?.offRoute && !nav.online) return t(strings.navigate.offRoute);
    return null;
  })();

  const remainingM = nav.progress?.remainingM ?? nav.route?.metres ?? preview.route?.metres ?? 0;
  const remainingSeconds = nav.progress?.remainingSeconds ?? nav.route?.seconds ?? preview.route?.seconds ?? 0;

  // -- The screen -----------------------------------------------------------

  /*
    NO DESTINATION, NO NAVIGATOR. Every hook above has already run - they all
    accept null and do nothing with it - so this is a render branch rather
    than an early return, and the rules of hooks are kept without a wrapper
    component.
  */
  if (!destination) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', padding: gutter }}>
        <MapPin size={28} color={color.neutral600} />
        <Body size={14} colour={color.neutral700} style={{ marginTop: 10, textAlign: 'center' }}>
          {t(strings.navigate.noRoute)}
        </Body>
        <View style={{ marginTop: 14 }}>
          <Button label={t(strings.common.back)} variant="secondary" onPress={onBack} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.brandSoft }}>
      <View style={[FILL, previewing && !pickingOrigin ? { bottom: previewPanelHeight } : null]}>
        {mapFailed === null ? (
          <NavigationMap
            handleRef={map}
            centre={{ lat: destination.lat, lng: destination.lng }}
            onReady={onMapReady}
            onUserMovedMap={nav.releaseCamera}
            onPressCoordinate={chooseMapOrigin}
            onFailed={setMapFailed}
          />
        ) : (
          /*
            The map could not start - MapLibre is fetched from a CDN, and a
            cold install with no signal has nothing to fetch it from. The
            route and its numbers are still true, so they stay; what is gone
            is the picture, and the screen says so instead of showing grey.
          */
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: gutter }}>
            <MapPin size={28} color={color.neutral600} />
            <Body size={13} colour={color.neutral700} style={{ marginTop: 8, textAlign: 'center' }}>
              {t(strings.map.wayStraight)}
            </Body>
          </View>
        )}
      </View>

      {/* Back, over the map, where every full-screen view in this app puts it. */}
      <View style={{ position: 'absolute', top: 10, left: gutter, zIndex: 3 }}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t(strings.common.back)}
          style={[shadow.card, {
            width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center',
            backgroundColor: color.surface,
          }]}
        >
          <ArrowLeft size={20} color={color.brand} strokeWidth={2.2} />
        </Pressable>
      </View>

      {mapFailed === null ? (
        <View style={{
          position: 'absolute', right: gutter, zIndex: 5, gap: 8,
          bottom: pickingOrigin ? 22
            : previewing ? previewPanelHeight + 16
              : (following || nav.status === 'overview') ? PANEL_H + 82 : PANEL_H + 16,
        }}>
          <Pressable
            onPress={() => zoomMap(1)}
            accessibilityRole="button"
            accessibilityLabel={t({ en: 'Zoom in', th: 'ซูมเข้า', zh: '放大' })}
            style={[shadow.card, {
              width: 48, height: 48, borderRadius: 24, backgroundColor: color.surface,
              alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.neutral300,
            }]}
          >
            <Plus size={24} color={color.brand} strokeWidth={2.8} />
          </Pressable>
          <Pressable
            onPress={() => zoomMap(-1)}
            accessibilityRole="button"
            accessibilityLabel={t({ en: 'Zoom out', th: 'ซูมออก', zh: '缩小' })}
            style={[shadow.card, {
              width: 48, height: 48, borderRadius: 24, backgroundColor: color.surface,
              alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.neutral300,
            }]}
          >
            <Minus size={24} color={color.brand} strokeWidth={2.8} />
          </Pressable>
        </View>
      ) : null}

      {following || nav.status === 'overview' ? (
        <>
          <View style={{ position: 'absolute', top: 64, left: 0, right: 0, zIndex: 2 }}>
            <NavigationBanner maneuver={maneuver} metres={nav.progress?.toNextM ?? 0} note={note} />
          </View>

          {/*
            Re-centre, offered only when the camera is not the app's. A
            button that does nothing the moment it is pressed teaches people
            the screen is broken.
          */}
          {nav.status === 'overview' ? (
            <View style={{ position: 'absolute', right: gutter, bottom: PANEL_H + 16, zIndex: 2 }}>
              <Pressable
                onPress={nav.recentre}
                accessibilityRole="button"
                accessibilityLabel={t(strings.navigate.recentre)}
                style={[shadow.card, {
                  minWidth: 56, minHeight: 56, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: color.surface, gap: 2,
                }]}
              >
                <Crosshair size={22} color={color.brand} strokeWidth={2.2} />
                <Label size={9} tracking={0.06} colour={color.brand}>{t(strings.navigate.recentre)}</Label>
              </Pressable>
            </View>
          ) : null}

          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2 }}>
            <NavigationPanel
              remainingM={remainingM}
              remainingSeconds={remainingSeconds}
              arriveAt={arrivalAt(Date.now(), remainingSeconds)}
              overviewActive={nav.status === 'overview'}
              onOverview={nav.status === 'overview' ? nav.recentre : nav.releaseCamera}
              onStop={() => { nav.stop(); onBack(); }}
            />
          </View>
        </>
      ) : null}

      {previewing && !pickingOrigin ? (
        <View
          onLayout={onPreviewPanelLayout}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2 }}
        >
          <PreviewCard
            destination={destination}
            mode={mode}
            onMode={setMode}
            metres={preview.route?.metres ?? null}
            seconds={preview.route?.seconds ?? null}
            loading={preview.loading || nav.status === 'routing'}
            straight={preview.failed}
            refusal={preview.refusal}
            haveHere={previewOrigin !== null}
            waiting={nav.status === 'acquiring-location'}
            originLabel={origin ? t(origin.name) : t({ en: 'My current location', th: 'ตำแหน่งปัจจุบันของฉัน', zh: '我的当前位置' })}
            onChooseOrigin={() => setChoosingOrigin(true)}
            onStart={() => { setChoosingOrigin(false); nav.start(); }}
            onExternal={() => {
              void Linking.openURL(mapsDirectionsUrl(destination, { walking: mode === 'walk' }));
            }}
          />
        </View>
      ) : null}

      {pickingOrigin ? (
        <View style={{ position: 'absolute', left: gutter, right: gutter, top: 64, zIndex: 4, alignItems: 'center' }}>
          <View style={[shadow.card, {
            width: '100%', maxWidth: 540, paddingHorizontal: 16, paddingVertical: 14,
            borderRadius: radius.md, backgroundColor: color.surface,
          }]}
          >
            <Heading size={17}>{t({ en: 'Tap your starting point', th: 'จิ้มจุดเริ่มต้นบนแผนที่', zh: '在地图上点击起点' })}</Heading>
            <Body size={13} colour={pickOriginError ? '#B42318' : color.neutral700} style={{ marginTop: 4 }}>
              {pickOriginError
                ? t({ en: 'Choose a point on Koh Sichang.', th: 'กรุณาเลือกจุดที่อยู่บนเกาะสีชัง', zh: '请选择锡昌岛上的位置。' })
                : t({ en: 'Tap anywhere on Koh Sichang. A blue A marker will show the start.', th: 'จิ้มตำแหน่งบนเกาะสีชัง หมุด A สีน้ำเงินคือจุดเริ่มต้น', zh: '点击锡昌岛上的位置，蓝色 A 标记表示起点。' })}
            </Body>
            <View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
              <Button
                label={t(strings.common.cancel)}
                variant="secondary"
                onPress={() => { setPickingOrigin(false); setPickOriginError(false); }}
              />
            </View>
          </View>
        </View>
      ) : null}

      {nav.status === 'failed' ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2 }}>
          <Sheet>
            {/*
              The heading names WHICH failure this is, and the body says what
              to do about it. A permission that was never granted and a road
              the router cannot find are two different problems with two
              different actions, and one heading over both makes the
              traveller read the small print to tell them apart.
            */}
            <Heading size={17}>
              {nav.failure === 'no-permission' ? t(strings.navigate.locationOff)
                : nav.failure === 'no-location' ? t(strings.navigate.noFixTitle)
                  : nav.failure === 'too-far' ? t(strings.navigate.tooFarTitle)
                    : nav.failure === 'no-path' ? t(strings.navigate.noPathTitle)
                      : t(strings.navigate.noRoute)}
            </Heading>
            <Body size={13} colour={color.neutral700} style={{ marginTop: 6 }}>
              {nav.failure === 'no-permission' ? t(fenceOff ? strings.navigate.locationPaused : strings.navigate.noPermission)
                : nav.failure === 'no-location' ? t(strings.navigate.noFixBody)
                  : nav.failure === 'too-far' ? t(strings.map.wayTooFar)
                    : nav.failure === 'no-path' ? t(strings.map.wayNoPath)
                      : !nav.online ? t(strings.navigate.offlineRoute)
                        : t(strings.map.wayStraight)}
            </Body>
            {/*
              Too far to walk is the one failure with an obvious next move,
              so the button IS that move rather than a Retry that would ask
              the same impossible question again.
            */}
            <View style={{ marginTop: 12 }}>
              {nav.failure === 'too-far' && mode === 'walk' ? (
                <Button label={t(strings.map.wayRide)} onPress={() => { setMode('ride'); nav.start(); }} />
              ) : (
                <Button label={t(strings.common.retry)} onPress={nav.start} />
              )}
            </View>
          </Sheet>
        </View>
      ) : null}

      {nav.status === 'arrived' ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2 }}>
          <Sheet>
            <Heading size={19}>{t(strings.navigate.arrivedAt(t(destination.name)))}</Heading>
            <Body size={13} colour={color.neutral700} style={{ marginTop: 4 }}>
              {formatTime(new Date())}
            </Body>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              {destination.id && onOpenPlace ? (
                <View style={{ flex: 1 }}>
                  <Button label={t(strings.navigate.seePlace)} onPress={() => onOpenPlace(destination.id!)} />
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <Button
                  label={t(strings.navigate.done)}
                  variant="secondary"
                  onPress={() => { nav.stop(); onBack(); }}
                />
              </View>
            </View>
          </Sheet>
        </View>
      ) : null}

      {choosingOrigin ? (
        <View style={[FILL, { zIndex: 10, justifyContent: 'flex-end', alignItems: 'center' }]}>
          <Pressable
            onPress={() => setChoosingOrigin(false)}
            accessibilityRole="button"
            accessibilityLabel={t(strings.common.close)}
            style={[FILL, { backgroundColor: 'rgba(8, 35, 55, 0.45)' }]}
          />
          <View style={[
            shadow.card,
            {
              width: '100%', maxWidth: 540, maxHeight: Math.min(height * 0.7, 560),
              backgroundColor: color.surface, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md,
              paddingHorizontal: gutter, paddingTop: 18, paddingBottom: 14,
            },
          ]}>
            <Heading size={18}>{t({ en: 'Choose starting point', th: 'เลือกจุดเริ่มต้น', zh: '选择起点' })}</Heading>
            <Body size={13} colour={color.neutral700} style={{ marginTop: 4, marginBottom: 10 }}>
              {t({
                en: 'Use your live location or plan from a place on Koh Sichang.',
                th: 'ใช้ตำแหน่งจริงของคุณ หรือวางแผนจากสถานที่บนเกาะสีชัง',
                zh: '使用实时位置，或从锡昌岛上的地点规划路线。',
              })}
            </Body>
            <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
              <OriginOption
                label={t({ en: 'My current location', th: 'ตำแหน่งปัจจุบันของฉัน', zh: '我的当前位置' })}
                selected={origin === null}
                onPress={() => { setOrigin(null); setChoosingOrigin(false); setPickOriginError(false); }}
              />
              <OriginOption
                label={t({ en: 'Pick a point on the map', th: 'จิ้มพิกัดบนแผนที่', zh: '在地图上选点' })}
                selected={origin?.id === null}
                onPress={() => {
                  setChoosingOrigin(false);
                  setPickOriginError(false);
                  setPickingOrigin(true);
                }}
              />
              <Label size={9} tracking={0.1} colour={color.neutral600} style={{ marginTop: 8, marginBottom: 2 }}>
                {t({ en: 'PLACES ON KOH SICHANG', th: 'สถานที่บนเกาะสีชัง', zh: '锡昌岛上的地点' })}
              </Label>
              {originOptions.map((option) => (
                <OriginOption
                  key={option.id ?? `${option.lat},${option.lng}`}
                  label={t(option.name)}
                  selected={origin?.id === option.id}
                  onPress={() => { setOrigin(option); setChoosingOrigin(false); }}
                />
              ))}
              {places.loading ? (
                <Body size={13} colour={color.neutral600} style={{ paddingVertical: 10 }}>
                  {t(strings.common.loading)}
                </Body>
              ) : null}
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ paddingHorizontal: gutter, paddingBottom: 12 }}>
      <View style={[shadow.card, { backgroundColor: color.surface, borderRadius: radius.md, padding: 16 }]}>
        {children}
      </View>
    </View>
  );
}

/**
 * Before setting off.
 *
 * It says the three things that decide whether to walk - how far, how long,
 * and what time that lands at - plus the one honest caveat: when the router
 * did not answer, the line on the map is a BEARING and the card says so,
 * because a straight line across a bay drawn without that sentence is how
 * somebody walks into the sea.
 */
function PreviewCard({
  destination, mode, onMode, metres, seconds, loading, straight, refusal, haveHere, waiting,
  originLabel, onChooseOrigin, onStart, onExternal,
}: {
  destination: NavDestination;
  mode: RouteMode;
  onMode: (mode: RouteMode) => void;
  metres: number | null;
  seconds: number | null;
  loading: boolean;
  straight: boolean;
  /** The router's own reason, when it refused. */
  refusal: RouteRefusal | null;
  /** Without a position there is no line to draw and nothing to route from. */
  haveHere: boolean;
  waiting: boolean;
  originLabel: string;
  onChooseOrigin: () => void;
  onStart: () => void;
  onExternal: () => void;
}) {
  return (
    <Sheet>
      <Heading size={18}>{t(strings.map.wayTo(t(destination.name)))}</Heading>
      <Body size={13} colour={straight ? color.neutral700 : color.neutral800} style={{ marginTop: 4 }}>
        {/*
          The three honest answers, and the third is the one a live run
          found missing. With NO POSITION there is no dashed line on the map
          either, so saying "the dashed line is the direction" described
          something that was not on screen. The same sentence the way banner
          uses is the true one here.
        */}
        {metres !== null && seconds !== null
          ? t(strings.map.waySummary(t(formatDistance(metres)), t(formatDuration(seconds))))
          : loading
            ? t(strings.map.wayLoading)
            : refusal === 'too-far'
              ? t(strings.map.wayTooFar)
              : refusal === 'no-path' || refusal === 'unreachable'
                ? t(strings.map.wayNoPath)
                : haveHere
                  ? t(strings.map.wayStraight)
                  : t(strings.place.distanceUnknown)}
      </Body>
      {metres !== null && seconds !== null ? (
        <Label size={10} tracking={0.08} colour={color.neutral600} style={{ marginTop: 4 }}>
          {`${t(strings.navigate.arrival)} · ${formatTime(arrivalAt(Date.now(), seconds))}`}
        </Label>
      ) : null}

      <Pressable
        onPress={onChooseOrigin}
        accessibilityRole="button"
        accessibilityLabel={t({ en: 'Choose starting point', th: 'เลือกจุดเริ่มต้น', zh: '选择起点' })}
        style={{
          marginTop: 12, minHeight: 48, borderRadius: radius.sm, borderWidth: 1, borderColor: color.neutral300,
          backgroundColor: color.brandSoft, paddingHorizontal: 12, paddingVertical: 8,
          flexDirection: 'row', alignItems: 'center', gap: 10,
        }}
      >
        <View style={{
          width: 28, height: 28, borderRadius: 14, backgroundColor: '#1565C0',
          borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }}>A</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Label size={9} tracking={0.08} colour={color.neutral600}>
            {t({ en: 'STARTING POINT', th: 'จุดเริ่มต้น', zh: '起点' })}
          </Label>
          <Label size={11} tracking={0} colour={color.neutral900} numberOfLines={1}>{originLabel}</Label>
        </View>
        <Label size={10} tracking={0.06} colour={color.brand}>
          {t({ en: 'Choose', th: 'เลือก', zh: '选择' })}
        </Label>
      </Pressable>

      <View style={{
        marginTop: 8, minHeight: 48, borderRadius: radius.sm, borderWidth: 1, borderColor: '#E5C466',
        backgroundColor: '#FFF7DA', paddingHorizontal: 12, paddingVertical: 8,
        flexDirection: 'row', alignItems: 'center', gap: 10,
      }}>
        <View style={{
          width: 28, height: 28, borderRadius: 14, backgroundColor: '#E0A42B',
          borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ color: '#4A3210', fontSize: 13, fontWeight: '900' }}>B</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Label size={9} tracking={0.08} colour={color.neutral600}>
            {t({ en: 'DESTINATION', th: 'จุดปลายทาง', zh: '终点' })}
          </Label>
          <Label size={11} tracking={0} colour={color.neutral900} numberOfLines={1}>{t(destination.name)}</Label>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <ModeChip label={t(strings.map.wayWalk)} icon={Footprints} active={mode === 'walk'} onPress={() => onMode('walk')} />
        <ModeChip label={t(strings.map.wayRide)} icon={RouteIcon} active={mode === 'ride'} onPress={() => onMode('ride')} />
      </View>

      <View style={{ marginTop: 14 }}>
        <Button
          label={waiting ? t(strings.navigate.waitingForGps) : t(strings.navigate.start)}
          onPress={onStart}
          disabled={waiting}
        />
      </View>

      {/*
        The handoff this app has always offered, kept exactly where it was in
        the product: the island's own router is a free community server and
        is allowed to say nothing, and somebody who needs the road NOW should
        not have to go back three screens to find the map that has it.
      */}
      <Pressable
        onPress={onExternal}
        accessibilityRole="link"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'flex-start', minHeight: 40 }}
      >
        <ExternalLink size={14} color={color.brand} strokeWidth={2} />
        <Label size={10} tracking={0.08} colour={color.brand}>Google Maps</Label>
      </Pressable>
    </Sheet>
  );
}

function OriginOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={{
        minHeight: 50, borderRadius: radius.sm, borderWidth: 1,
        borderColor: selected ? color.brand : color.neutral300,
        backgroundColor: selected ? color.brandSoft : color.surface,
        paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10,
      }}
    >
      <MapPin size={18} color={selected ? color.brand : color.neutral600} strokeWidth={2} />
      <Body size={13} colour={selected ? color.brand : color.neutral800} style={{ flex: 1 }}>{label}</Body>
      <View style={{
        width: 16, height: 16, borderRadius: 8, borderWidth: 2,
        borderColor: selected ? color.brand : color.neutral400,
        backgroundColor: selected ? color.brand : 'transparent',
      }} />
    </Pressable>
  );
}

function ModeChip({ label, icon: Icon, active, onPress }: {
  label: string; icon: typeof Footprints; active: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        minHeight: 40, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.lg,
        backgroundColor: active ? color.brand : color.surface,
        borderWidth: 1, borderColor: active ? color.brand : color.neutral300,
      }}
    >
      <Icon size={14} color={active ? onFill.brand : color.neutral700} strokeWidth={2} />
      <Label size={10} tracking={0.08} colour={active ? onFill.brand : color.neutral700}>{label}</Label>
    </Pressable>
  );
}
