/**
 * One navigation map, two mountings of it.
 *
 * The same branch `SamuiMap.tsx` makes, for the same reason and with the
 * same test: whether there is a real `document` and `window`, not what
 * `Platform.OS` says. The node test harness aliases react-native to
 * react-native-web, so the platform string is 'web' there too - and MapLibre
 * needs a DOM and a WebGL context, neither of which node has. Asking whether
 * a document exists is the question that actually matters.
 *
 * The browser's map is loaded lazily so a phone never evaluates 800 KB of
 * MapLibre it will not run, and the WebView's map is imported eagerly
 * because on a phone it is the only one there is.
 *
 * Both present `send(command)`, so the screen above is written once.
 */

import React from 'react';
import { Platform, View } from 'react-native';

import { NavigationMapView, type NavigationMapHandle, type NavigationMapViewProps } from './NavigationMapView.tsx';
import { color } from '../theme/index.ts';

const inBrowser = Platform.OS === 'web'
  && typeof document !== 'undefined'
  && typeof window !== 'undefined';

const WebMap = inBrowser
  ? React.lazy(() => import('./NavigationMapWeb.tsx').then((m) => ({ default: m.NavigationMapWeb })))
  : null;

export type { NavigationMapHandle };

export function NavigationMap(props: NavigationMapViewProps) {
  if (WebMap) {
    return (
      <React.Suspense fallback={<View style={{ flex: 1, backgroundColor: color.brandSoft }} />}>
        <WebMap {...props} />
      </React.Suspense>
    );
  }
  return <NavigationMapView {...props} />;
}
