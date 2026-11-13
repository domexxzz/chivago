/**
 * The navigation map in a browser.
 *
 * The same MapLibre library and the same `chivagoStyle()` the hero map uses,
 * with the navigation layers added on top of that style - and crucially NOT
 * the hero map's camera. `TerrainMap.tsx` is a view of an island: its zoom
 * is capped at 15.5, its pan is locked to the area's bounding box, and it
 * runs a slow 45-second drift. Every one of those is right for a hero and
 * wrong for a navigator, which needs zoom 18, needs to leave the box when
 * the road does, and must not move the camera except to follow.
 *
 * Changing the hero to accommodate that would have cost the hero its frame;
 * so this is a second mounting of the SAME map engine and the SAME style,
 * which is what the island's palette and layers were factored out for in
 * the first place.
 *
 * It presents the identical `send(command)` interface the phone's WebView
 * does, so the screen above knows nothing about which one it is driving.
 */

import React from 'react';
import { View } from 'react-native';
import type maplibregl from 'maplibre-gl';
import { AttributionControl, Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { chivagoStyle } from './terrain-style.ts';
import { NAV, NAV_BEFORE, USER_ARROW_SVG, lineFeature, navigationLayers, navigationSources } from './navigation-layers.ts';
import { validateCommand, type MapCommand } from './navigation-bridge.ts';
import type { NavigationMapHandle, NavigationMapViewProps } from './NavigationMapView.tsx';
import { color } from '../theme/index.ts';

const EMPTY = { type: 'FeatureCollection' as const, features: [] };

export function NavigationMapWeb({
  hour = 12, centre, onReady, onUserMovedMap, onFailed, handleRef,
}: NavigationMapViewProps) {
  const holder = React.useRef<HTMLDivElement | null>(null);
  const map = React.useRef<MapLibreMap | null>(null);
  const me = React.useRef<Marker | null>(null);
  const ready = React.useRef(false);
  const queue = React.useRef<MapCommand[]>([]);
  // Read inside the mount effect without re-running it: a new centre must
  // never rebuild the map.
  const centreRef = React.useRef(centre);
  centreRef.current = centre;
  const callbacks = React.useRef({ onReady, onUserMovedMap, onFailed });
  callbacks.current = { onReady, onUserMovedMap, onFailed };

  const apply = React.useCallback((command: MapCommand) => {
    const m = map.current;
    if (!m) return;
    const source = (id: string) => m.getSource(id) as maplibregl.GeoJSONSource | undefined;

    switch (command.type) {
      case 'SET_ROUTE':
        source(NAV.routeSource)?.setData(lineFeature(command.remaining) as never);
        source(NAV.travelledSource)?.setData(lineFeature(command.travelled) as never);
        source(NAV.pointsSource)?.setData((command.points ?? EMPTY) as never);
        return;
      case 'UPDATE_POSITION': {
        if (!me.current) {
          const el = document.createElement('div');
          el.style.width = '40px';
          el.style.height = '40px';
          el.setAttribute('role', 'img');
          el.innerHTML = USER_ARROW_SVG;
          me.current = new Marker({ element: el, anchor: 'center', rotationAlignment: 'map' })
            .setLngLat([command.lng, command.lat])
            .addTo(m);
        }
        me.current.setLngLat([command.lng, command.lat]);
        me.current.setRotation(command.bearing);
        source(NAV.meSource)?.setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [command.lng, command.lat] } }],
        } as never);
        if (m.getLayer(NAV.accuracy)) {
          m.setPaintProperty(NAV.accuracy, 'circle-radius', (command.radius ?? 0) as never);
        }
        return;
      }
      case 'CAMERA':
        // One move at a time: `easeTo` replaces whatever is running, and two
        // overlapping eases on a following camera judder once per fix.
        m.easeTo({
          center: command.centre,
          bearing: command.bearing,
          zoom: command.zoom,
          pitch: command.pitch,
          padding: command.padding,
          duration: command.duration,
          essential: true,
        });
        return;
      case 'FIT':
        m.fitBounds(command.bounds, { padding: command.padding, bearing: 0, pitch: 0, duration: 600 });
        return;
      case 'CLEAR_ROUTE':
        source(NAV.routeSource)?.setData(lineFeature([]) as never);
        source(NAV.travelledSource)?.setData(lineFeature([]) as never);
        source(NAV.pointsSource)?.setData(EMPTY as never);
        source(NAV.meSource)?.setData(EMPTY as never);
        me.current?.remove();
        me.current = null;
    }
  }, []);

  /*
    CHECKED ON THE WAY OUT, not only on the way in.

    The same validator the WebView's page runs, applied here as well. On the
    web there is no process boundary to protect, so this is not a security
    check - it is the cheapest possible place to catch a NaN coordinate or a
    missing padding, which would otherwise reach MapLibre and surface as a
    camera that has quietly stopped moving with nothing in the console.
  */
  const send = React.useCallback((command: MapCommand) => {
    if (!validateCommand(command)) return;
    if (!ready.current) {
      if (queue.current.length < 64) queue.current.push(command);
      return;
    }
    apply(command);
  }, [apply]);

  React.useImperativeHandle(handleRef, () => ({ send }), [send]);

  React.useEffect(() => {
    if (!holder.current || map.current) return undefined;
    let m: MapLibreMap;
    try {
      m = new MapLibreMap({
        container: holder.current,
        style: chivagoStyle(hour),
        center: [centreRef.current.lng, centreRef.current.lat],
        zoom: 16,
        pitch: 0,
        bearing: 0,
        maxPitch: 70,
        attributionControl: false,
      });
    } catch (error) {
      callbacks.current.onFailed?.(error instanceof Error ? error.message : 'map-failed');
      return undefined;
    }
    map.current = m;
    m.addControl(new AttributionControl({ compact: true }), 'bottom-right');

    const onError = (event: { error?: { message?: string } }) => {
      callbacks.current.onFailed?.(String(event?.error?.message ?? 'map-error').slice(0, 200));
    };
    /*
      A real finger, not the camera's own ease. `originalEvent` is present
      only when a pointer, touch or wheel started the move; without that test
      the following camera would report a pan once per fix and let go of
      itself a second after starting.
    */
    const onMoveStart = (event: { originalEvent?: unknown }) => {
      if (event?.originalEvent) callbacks.current.onUserMovedMap?.();
    };
    const onLoad = () => {
      const sources = navigationSources();
      for (const [id, spec] of Object.entries(sources)) {
        if (!m.getSource(id)) m.addSource(id, spec as never);
      }
      const before = m.getLayer(NAV_BEFORE) ? NAV_BEFORE : undefined;
      for (const layer of navigationLayers()) {
        if (!m.getLayer(layer.id as string)) m.addLayer(layer as never, before);
      }
      ready.current = true;
      const pending = queue.current;
      queue.current = [];
      for (const command of pending) apply(command);
      callbacks.current.onReady?.();
    };

    m.on('error', onError);
    m.on('movestart', onMoveStart);
    m.on('load', onLoad);

    return () => {
      ready.current = false;
      queue.current = [];
      me.current = null;
      try {
        m.off('error', onError);
        m.off('movestart', onMoveStart);
        m.off('load', onLoad);
        m.remove();
      } catch {
        // The document is going; a half-removed map is not worth a crash.
      }
      map.current = null;
    };
    // The hour is the style, and the style is the document. Nothing else
    // here may rebuild the map - least of all the centre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hour, apply]);

  return (
    <View style={{ flex: 1, backgroundColor: color.brandSoft }}>
      {/*
        A plain div, because MapLibre wants a DOM node and react-native-web's
        View would give it one wrapped in a flexbox whose height it cannot
        read. The same trick `TerrainMap` uses.
      */}
      <div ref={holder} style={{ position: 'absolute', inset: 0, background: color.brandSoft }} />
    </View>
  );
}

export type { NavigationMapHandle };
