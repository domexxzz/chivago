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
