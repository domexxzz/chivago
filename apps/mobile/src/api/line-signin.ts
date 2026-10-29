/**
 * Signing in with LINE, on the web build.
 *
 * Two halves of one round trip. `startLineSignIn` sends the browser to the
 * API, which sends it on to LINE. `finishLineSignIn` runs on the way back and
 * reads what the API left in the URL FRAGMENT - never a query string, which
 * would put a usable code in server logs and `Referer` headers.
 *
 * What comes back is an ordinary link code, the same single-use ten-minute
 * code the "move to a second phone" flow already uses, so this adds no new way
 * of handing out a device key. It is claimed through the endpoint that already
 * does that, and the fragment is cleared immediately either way.
 *
 * NATIVE IS NOT WIRED. A redirect flow needs an in-app browser and a deep link
 * back, which is its own piece of work. On native the button keeps showing the
 * notice it showed before, which is the honest answer rather than a button
 * that does nothing.
 */

import { Platform } from 'react-native';
import { API_BASE } from './client.ts';
import { api } from './client.ts';
import { adoptKey } from './account.ts';

/** Only the web build can run a redirect sign-in today. */
export const lineSignInAvailable = (): boolean =>
  Platform.OS === 'web' && typeof window !== 'undefined';

/** Send the browser to LINE, by way of our own API. */
export function startLineSignIn(): void {
  if (!lineSignInAvailable()) return;
  const next = window.location.pathname || '/';
  window.location.assign(`${API_BASE.replace(/\/$/, '')}/auth/line?next=${encodeURIComponent(next)}`);
}

export type LineReturn =
  | { kind: 'none' }
  | { kind: 'signed-in'; outcome: string }
  | { kind: 'cancelled' }
  | { kind: 'clash' }
  | { kind: 'failed' };

/** Read the fragment the callback left, and clear it so a reload cannot replay it. */
function takeFragment(): string | null {
  if (typeof window === 'undefined') return null;
  const m = /^#line=(.+)$/.exec(window.location.hash);
  if (!m) return null;
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch { /* a browser that refuses is not a reason to drop the sign-in */ }
  return decodeURIComponent(m[1]!);
}

/**
 * Finish a sign-in that is coming back from LINE, if one is.
 *
 * Returns what happened so the screen can say it. 'none' means this was an
 * ordinary page load and nothing should be shown.
 */
export async function finishLineSignIn(): Promise<LineReturn> {
  const value = takeFragment();
  if (value === null) return { kind: 'none' };
  if (value === 'cancelled') return { kind: 'cancelled' };
  if (value === 'clash') return { kind: 'clash' };
  if (!value.startsWith('ok.')) return { kind: 'failed' };

  // `ok.<code>.<outcome>` - the code is single-use, so a failure here is final.
  const [, code, outcome] = value.split('.');
  if (!code) return { kind: 'failed' };
  try {
    const res = await api.claimLink(code, 'LINE');
    if (!res.ok) return { kind: 'failed' };
    await adoptKey(res.data.deviceKey);
    return { kind: 'signed-in', outcome: outcome ?? 'signed-in' };
  } catch {
    return { kind: 'failed' };
  }
}
