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
import { strings, type Bilingual, type PlacePhoto } from '@chivago/core';
import { color } from '../theme/index.ts';
import { API_BASE } from './client.ts';

export function photoUri(url: string, os: string = Platform.OS): string {
  if (!url.startsWith('/')) return url;
  if (os === 'web') return url;
  return `${API_BASE.replace(/\/$/, '')}${url}`;
}

/**
 * How to introduce the credit beside an image: "photographed by" for a
 * photograph, "logo of" for a venue's own mark.
 *
 * A logo was not photographed, and saying it was is a false statement about
 * a real business printed on its own image. One word, read off the picture
 * itself rather than remembered by each screen that shows one.
 */
export const creditWord = (photo: Pick<PlacePhoto, 'kind'>): Bilingual =>
  (photo.kind === 'logo' ? strings.common.logoOf : strings.common.photographedBy);

/** Whether an image is fitted whole rather than cropped to fill. Logos are. */
export const fitsWhole = (photo: Pick<PlacePhoto, 'kind'> | null | undefined): boolean => photo?.kind === 'logo';

/**
 * What to put behind an image. A fitted logo gets its own field colour so the
 * bars beside it are part of the mark; everything else keeps the neutral
 * placeholder the frame has always had.
 */
export const photoBackdrop = (photo: PlacePhoto | null | undefined): string =>
  (fitsWhole(photo) && photo?.backdrop ? photo.backdrop : color.neutral200);

/**
 * The companions hero image.
 *
 * ONE PICTURE, ALL DAY, since 21 November 2026. This used to serve a second
 * illustration from 17:00 to 05:59, and that was worth having while both were
 * the same cast in different light. When the daytime card was redrawn the
 * evening one was not, so after five o'clock the card showed a different cast
 * in a different style - which reads as a bug rather than as dusk.
 *
 * `now` is still taken, and still ignored, so that bringing the hour back is
 * one line here and no change at either call site. A sunset illustration of
 * the current cast is what it is waiting for.
 */
export function mascotBeachUri(_now: Date = new Date(), os: string = Platform.OS): string {
  return photoUri('/media/illustrations/mascots-beach-day.jpg', os);
}

