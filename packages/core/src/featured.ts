/**
 * Places pinned to the front of their area's row on Home.
 *
 * Home's places row is otherwise ordered nearest-first, and its header SAYS
 * so - "เรียงจากใกล้ที่สุด" - because an order that changes when somebody
 * walks two streets is a claim, and every other number on that screen names
 * itself. A pinned place breaks that order, so the header has to stop saying
 * it and the card has to say why it is there. Both are driven from here: the
 * pin and its label travel together, and a place cannot be quietly moved to
 * the front without the screen admitting it.
 *
 * This is placement, not merit. Nothing here touches a place's score, and the
 * score chip on the card still says whatever the place actually scored.
 */

/**
 * The pinned places, in the order they are pinned.
 *
 * แบดมินตัน@สินธานี is here because it is the one venue whose live court
 * availability ChivarGo can show (courts.ts), which is worth seeing before you
 * set off - not because it ranks above anything.
 */
export const FEATURED_PLACES: readonly string[] = ['sinthani-badminton'];

/** Whether a place is pinned - and so must be labelled as pinned wherever it is shown. */
export const isFeatured = (placeId: string): boolean => FEATURED_PLACES.includes(placeId);

/**
 * The pinned places first, in the order `FEATURED_PLACES` lists them, then
 * everything else exactly as it arrived.
 *
 * The rest keep their incoming order, so this composes with `nearestFirst`
 * rather than replacing it: the unpinned places are still nearest-first, and
 * the header can say precisely that.
 */
export function featuredFirst<T extends { id: string }>(places: readonly T[]): T[] {
  const pinned: T[] = [];
  const rest: T[] = [];
  for (const place of places) {
    if (isFeatured(place.id)) pinned.push(place);
    else rest.push(place);
  }
  pinned.sort((a, b) => FEATURED_PLACES.indexOf(a.id) - FEATURED_PLACES.indexOf(b.id));
  return [...pinned, ...rest];
}

/** Whether any place in a list is pinned, so a header knows whether it must say so. */
export const hasFeatured = (places: readonly { id: string }[]): boolean => places.some((p) => isFeatured(p.id));
