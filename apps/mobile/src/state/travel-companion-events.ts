/**
 * A tiny in-memory bridge between reward acquisition and the Backpack.
 *
 * Summoning and the Backpack are separate screens, so the character card is
 * normally unmounted when a reward arrives. Keeping the latest event number
 * here lets the next Backpack mount celebrate it exactly once without adding
 * fake companion data or coupling either screen to navigation.
 */

let rewardEvent = 0;
let claimedRewardEvent = 0;
const listeners = new Set<() => void>();

export function announceTravelReward(): void {
  rewardEvent += 1;
  for (const listener of listeners) listener();
}

export function subscribeTravelReward(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function travelRewardSnapshot(): number {
  return rewardEvent;
}

/** Only one mounted character pair should perform a given celebration. */
export function claimTravelReward(event: number): boolean {
  if (event <= claimedRewardEvent) return false;
  claimedRewardEvent = event;
  return true;
}

