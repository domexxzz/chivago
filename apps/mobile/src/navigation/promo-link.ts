/** Only self-contained screens may be entered from the public website. */
export const PROMO_SCREENS = ['home', 'wallet', 'quests', 'map', 'adventure', 'concierge', 'safety', 'party', 'mascots', 'summon', 'passport', 'season', 'localPicks', 'stays', 'community', 'journal', 'game', 'impact', 'profile'] as const;
export function promoScreen(search: string): typeof PROMO_SCREENS[number] | null {
  const value = new URLSearchParams(search).get('screen');
  return PROMO_SCREENS.find((screen) => screen === value) ?? null;
}
