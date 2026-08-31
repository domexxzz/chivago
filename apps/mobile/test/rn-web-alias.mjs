/**
 * Resolve `react-native` to `react-native-web` for tests.
 *
 * The real package ships Flow-typed source that node cannot parse, which is
 * why every screen in this app went untested: there was no way to render one
 * outside a bundler. `react-native-web` is already a dependency (Expo web uses
 * it), it renders through `react-dom/server` with no DOM at all, and the
 * component tree is the same tree the device runs.
 *
 * What this does NOT give you: gestures, native modules, layout, fonts. It
 * gives you what a screen SAYS, which is where every text bug in
 * docs/21-walking-the-app.md lived.
 */
export function resolve(specifier, context, next) {
  if (specifier === 'react-native') return next('react-native-web', context);
  return next(specifier, context);
}
