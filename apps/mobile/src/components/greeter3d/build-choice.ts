/**
 * Which of ChangChang's two builds a machine is sent - the decision, with no
 * browser in it, so a test can hold it.
 *
 * The small build carries colour on its vertices only. On a phone-sized room
 * that is invisible; on a tablet it is not - the printed coat breaks into
 * blotches and the fur goes soft (seen on an iPad, 15 November 2026). So the
 * detailed, textured build goes to anything with a mouse OR a tablet-sized
 * screen. A tablet has no mouse, which is why `(pointer: fine)` alone missed it.
 *
 * The SCREEN, not the window: a laptop's narrow window is still a laptop (the
 * mouse answers that), and a phone turned sideways keeps its short side, so it
 * is never mistaken for a tablet.
 */

/** An iPad mini's short side in CSS pixels; no phone reaches it. */
export const TABLET_SHORT_SIDE_PX = 744;

export interface Machine {
  pointerFine: boolean;
  saveData: boolean;
  screenShortSidePx: number;
}

export function wantsDetailedBuild(m: Machine): boolean {
  // Somebody who asked their browser to spend less has asked us too.
  if (m.saveData) return false;
  if (m.pointerFine) return true;
  return m.screenShortSidePx >= TABLET_SHORT_SIDE_PX;
}
