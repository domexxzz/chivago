/**
 * Native VIEW libraries: react-native-svg and react-native-safe-area-context.
 *
 * Both reach `react-native` through deep CommonJS requires into Flow-typed
 * source, and both ship `.web.js` variants only a bundler selects. Neither
 * contributes text — the SVG island is a drawing, the safe-area wrappers are
 * padding — so each passes its children through and everything above and
 * inside them still renders.
 */
import { createElement } from 'react';
import { View } from 'react-native';

const Pass = ({ children }) => createElement(View, null, children);

export default Pass;
export const Svg = Pass;
export const Path = Pass;
export const G = Pass;
export const Circle = Pass;
export const Rect = Pass;
export const Line = Pass;
export const Polygon = Pass;
// Enumerated, and therefore incomplete the moment a drawing reaches for a
// shape nobody had needed yet - which is what the companion marks did. The
// failure is at least loud: an ES module namespace is built statically, so a
// missing export throws at import rather than rendering nothing.
export const Ellipse = Pass;
export const Polyline = Pass;
export const Text = Pass;
export const TSpan = Pass;
export const ClipPath = Pass;
export const LinearGradient = Pass;
export const RadialGradient = Pass;
export const Stop = Pass;
export const Mask = Pass;
export const Use = Pass;
export const Symbol = Pass;
export const Defs = Pass;
export const SafeAreaProvider = Pass;
export const SafeAreaView = Pass;
export const useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 });
