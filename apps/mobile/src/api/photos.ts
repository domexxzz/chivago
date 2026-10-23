/**
 * Where a place's photograph actually is.
 *
 * A photograph the team took lives in the repo (`apps/mobile/public/media/
 * places/`) and ships inside every web export, so its URL in the seed is a
 * path on the page's own origin - `/media/places/ku-library.jpg` - and the
 * same export serves it on Vercel and on Fly. A browser resolves that path
 * itself. A phone has no page origin, so it is given the API's, which is the
 * same server that serves the web. A licensed photograph from elsewhere keeps
 * its absolute URL and passes through untouched.
 *
 * WHY `/media/` AND NOT `/assets/`, WHICH IS WHERE THESE LIVED.
 *
 * `/assets/` is Metro's own URL namespace. In an export the photographs are
 * real files at that path and win, so this was invisible in production - but
 * under `expo start --web` Metro answers `/assets/*` from its bundler
 * registry and never falls through to `public/`, so EVERY place photograph
 * and EVERY illustration was a 404 for the whole of development. Measured,
 * not guessed: `/media/probe.jpg` and `/_probe.txt` both answered 200 from
 * the same `public/` directory while `/assets/places/ku-library.jpg` did
 * not. The fix is the prefix, and it has to stay off `/assets/`.
 */

import { Platform } from 'react-native';
import { API_BASE } from './client.ts';

export function photoUri(url: string, os: string = Platform.OS): string {
  if (!url.startsWith('/')) return url;
  if (os === 'web') return url;
  return `${API_BASE.replace(/\/$/, '')}${url}`;
}

/**
 * The dynamic companion beach hero image (daytime vs. sunset/evening).
 *
 * Switches smoothly based on local time:
 * - Daytime: 06:00 - 16:59 -> mascots-beach-day.jpg
 * - Sunset & Evening: 17:00 - 05:59 -> mascots-beach-sunset.jpg
 */
export function mascotBeachUri(now: Date = new Date(), os: string = Platform.OS): string {
  const hour = now.getHours();
  const isSunset = hour >= 17 || hour < 6;
  const path = isSunset
    ? '/media/illustrations/mascots-beach-sunset.jpg'
    : '/media/illustrations/mascots-beach-day.jpg';
  return photoUri(path, os);
}

