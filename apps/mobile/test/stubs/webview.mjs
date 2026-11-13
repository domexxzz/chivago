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
 *
 * WHAT IT ALSO RECORDS, and why.
 *
 * `sources` below keeps the `source` prop of every render, in order. One
 * property of the navigator cannot be checked any other way and is the
 * difference between a map and a slideshow: A POSITION UPDATE MUST NOT
 * RELOAD THE DOCUMENT. A reload throws away MapLibre, the tile cache and the
 * camera several times a minute, and it is invisible in a screenshot -
 * the map simply looks like it is stuttering.
 *
 * Holding the prop lets a test drive fixes through the screen and then
 * assert that the html handed to the WebView is the SAME STRING it was
 * before, which is exactly what React would have to re-render to reload it.
 */
import { createElement } from 'react';
import { View } from 'react-native';

/** Every `source` this stub has been given, oldest first. */
export const sources = [];

/** Forget what was recorded. Call it in a test's setup, like resetControl. */
export const resetWebView = () => { sources.length = 0; };

export const WebView = ({ accessibilityLabel, style, source }) => {
  sources.push(source);
  return createElement(View, { accessibilityLabel: accessibilityLabel ?? 'map', style });
};

export default WebView;
