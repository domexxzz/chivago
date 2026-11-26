/*
  `unstable_transformImportMeta` IS WHAT LETS MAPLIBRE 6 LOAD AT ALL.

  maplibre-gl 6 is ESM-only - it dropped the UMD build v5 had - and it finds
  its worker with `new URL('./maplibre-gl-worker.mjs', import.meta.url)`. Metro
  emits classic scripts, where `import.meta` is not merely undefined but a
  SYNTAX error, so the whole shared chunk containing MapLibre failed to parse
  and both map screens rendered nothing. Nothing in the console pointed at
  MapLibre; it read only `Uncaught SyntaxError: Cannot use 'import.meta'
  outside a module`.

  Expo's own transform rewrites `import.meta` to
  `globalThis.__ExpoImportMetaRegistry` (polyfilled by `expo/src/winter`,
  whose `url` is the bundle's own URL). It defaults to server environments
  only, so a client web build has to ask for it.

  `src/components/maplibre-worker.ts` then points MapLibre at the worker we
  copy into `public/`, because the URL the registry yields is the bundle's,
  and the worker is not served next to the bundle.
*/
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
  };
};
