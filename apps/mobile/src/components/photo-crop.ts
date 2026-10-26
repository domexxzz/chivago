/**
 * The geometry behind the avatar cropper.
 *
 * Kept apart from `PhotoCropper.tsx` for the same reason `map-geometry.ts`
 * is kept apart from the map: it is the part that can be wrong without
 * looking wrong. An off-by-a-few crop still produces a plausible square,
 * just not the one the person framed, so it wants a test - and a test cannot
 * import a `.tsx` under the `src/**` test run.
 */

/** The side of the on-screen framing circle, in layout pixels. */
export const FRAME = 260;

/** The side of the JPEG written back, in image pixels. */
export const OUTPUT = 512;

export const MAX_ZOOM = 4;

/**
 * The square of the ORIGINAL image that the frame is showing, in that
 * image's own pixels.
 *
 * `zoom` is a multiple of the scale at which the image exactly covers the
 * frame, so zoom 1 uses the short side whole and lets the long side slide.
 * The result is clamped to stay inside the image: the frame must never show
 * emptiness, which is also the rule the drag clamp enforces on screen.
 */
export function cropRect(
  natural: { w: number; h: number },
  zoom: number,
  offset: { x: number; y: number },
): { sx: number; sy: number; sSize: number } {
  const effective = (FRAME / Math.min(natural.w, natural.h)) * zoom;
  // Never wider than the image. At zoom 1 the arithmetic should land exactly
  // on the short side and instead lands a floating-point hair past it, which
  // would ask the canvas to read a column of pixels that is not there.
  const sSize = Math.min(FRAME / effective, natural.w, natural.h);
  const sx = (natural.w * effective / 2 - FRAME / 2 - offset.x) / effective;
  const sy = (natural.h * effective / 2 - FRAME / 2 - offset.y) / effective;
  return {
    sx: Math.max(0, Math.min(natural.w - sSize, sx)),
    sy: Math.max(0, Math.min(natural.h - sSize, sy)),
    sSize,
  };
}

/** How far the image may slide before the frame would show an edge. */
export function panLimit(natural: { w: number; h: number }, zoom: number): { x: number; y: number } {
  const effective = (FRAME / Math.min(natural.w, natural.h)) * zoom;
  return {
    x: Math.max(0, (natural.w * effective - FRAME) / 2),
    y: Math.max(0, (natural.h * effective - FRAME) / 2),
  };
}

/** The offset, held inside `panLimit`. */
export function clampOffset(
  offset: { x: number; y: number },
  natural: { w: number; h: number } | null,
  zoom: number,
): { x: number; y: number } {
  if (!natural) return { x: 0, y: 0 };
  const max = panLimit(natural, zoom);
  return {
    x: Math.min(max.x, Math.max(-max.x, offset.x)),
    y: Math.min(max.y, Math.max(-max.y, offset.y)),
  };
}
