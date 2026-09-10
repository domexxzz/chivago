/**
 * Where a place's photograph actually is.
 *
 * A photograph the team took lives in the repo (`apps/mobile/public/assets/
 * places/`) and ships inside every web export, so its URL in the seed is a
 * path on the page's own origin - `/assets/places/ku-library.jpg` - and the
 * same export serves it on Vercel and on Fly. A browser resolves that path
 * itself. A phone has no page origin, so it is given the API's, which is the
 * same server that serves the web. A licensed photograph from elsewhere keeps
 * its absolute URL and passes through untouched.
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
    ? '/assets/illustrations/mascots-beach-sunset.jpg'
    : '/assets/illustrations/mascots-beach-day.jpg';
  return photoUri(path, os);
}

