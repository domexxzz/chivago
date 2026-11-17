/**
 * The two conversions the island scripts share.
 *
 * They live here rather than in either script because the first arrangement -
 * `island-surface.mjs` importing them from `island-terrain.mjs` - made a cycle
 * the moment the terrain script needed the surface script's coastline. Both
 * files end in a top-level `await main()`, and an ES module cycle through a
 * top-level await does not throw: it hangs, and node says only "unsettled
 * top-level await" as the process exits.
 */

/** Metres per degree at a latitude. Good to centimetres over one island. */
export function metresPerDegree(lat) {
  const rad = (lat * Math.PI) / 180;
  return {
    lat: 111_132.92 - 559.82 * Math.cos(2 * rad) + 1.175 * Math.cos(4 * rad),
    lng: 111_412.84 * Math.cos(rad) - 93.5 * Math.cos(3 * rad),
  };
}

/** Fractional web-mercator tile coordinates. */
export function lngLatToTile(lng, lat, zoom) {
  const n = 2 ** zoom;
  const rad = (lat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  };
}
