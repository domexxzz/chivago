/**
 * `react-native-webview`, which the harness cannot load and must not need.
 *
 * The real package re-exports from `lib/WebView`, a path that only exists
 * once a bundler has picked a platform variant, so importing it under node
 * throws before any screen renders. It is also the one component in this app
 * whose contents are a BROWSER - a document with MapLibre in it - and node
 * has no browser to put inside it.
 *
 * So it renders as an empty View carrying its accessibility label. Nothing
 * inside the map is testable here, which is honest: the map's own behaviour
 * is checked in a browser and on a device, not in this harness. What a test
 * CAN still see is everything around it - the rows under the map, the
 * banners, the chips - which is what the screen tests are for.
 */
import { createElement } from 'react';
import { View } from 'react-native';

export const WebView = ({ accessibilityLabel, style }) =>
  createElement(View, { accessibilityLabel: accessibilityLabel ?? 'map', style });

export default WebView;
