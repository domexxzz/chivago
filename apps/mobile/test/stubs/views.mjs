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
export const Defs = Pass;
export const SafeAreaProvider = Pass;
export const SafeAreaView = Pass;
export const useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 });
