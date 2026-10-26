/**
 * Loading an image the server will only hand to the person who owns it.
 *
 * WHY THIS EXISTS
 *
 * `/shops/guide-photos/:id` is gated: a guide nobody has approved is not
 * public, and the route identifies the owner from the `x-chivago-device-key`
 * header. Every API call sends that header, so the gate works - except for
 * the one case that matters most to the owner, which is looking at their own
 * face on the edit screen.
 *
 * An `<Image source={{ uri }}>` is an `<img src>` on the web, and an `<img>`
 * sends no custom headers. So the owner's own pending photograph came back
 * 404 and the avatar rendered as an empty circle, which reads as "the upload
 * failed" rather than "you are not allowed to see this".
 *
 * The fix is on this side of the wire on purpose. Signing the URL, or adding
 * a token query parameter, would put a credential in something that gets
 * logged and shared, and would widen the surface the gate was written to
 * close. Fetching the bytes with the header we already send does not.
 *
 * Native `<Image>` CAN carry headers, so there it is just a prop. The web
 * needs the bytes pulled through `fetch` and handed over as an object URL.
 */

import React from 'react';
import { Platform } from 'react-native';
import { loadDeviceKey } from './account.ts';
import { API_BASE } from './client.ts';
import { shopImageUri } from './shops.ts';

export interface AuthedSource {
  uri: string;
  headers?: Record<string, string>;
}

/**
 * A source for `<Image>` that carries the device key, or null while it loads.
 *
 * Returns null rather than a bare URL on the web until the bytes are in hand,
 * because rendering the unauthenticated URL first would show a broken image
 * for a moment and cache the 404 in some browsers.
 */
export function useAuthedImage(path: string | null | undefined): AuthedSource | null {
  const [source, setSource] = React.useState<AuthedSource | null>(null);

  React.useEffect(() => {
    if (!path) { setSource(null); return; }
    let cancelled = false;
    let objectUrl: string | null = null;

    void (async () => {
      const key = await loadDeviceKey();
      if (cancelled) return;
      const uri = shopImageUri(path);

      if (Platform.OS !== 'web') {
        setSource({ uri, headers: key ? { 'x-chivago-device-key': key } : undefined });
        return;
      }

      try {
        const res = await fetch(uri, { headers: key ? { 'x-chivago-device-key': key } : undefined });
        // A 404 here is the gate answering, not a network failure: show the
        // placeholder rather than a broken image.
        if (!res.ok) { if (!cancelled) setSource(null); return; }
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSource({ uri: objectUrl });
      } catch {
        if (!cancelled) setSource(null);
      }
    })();

    return () => {
      cancelled = true;
      // The object URL holds the blob in memory until it is revoked, and this
      // screen can swap photographs several times in a sitting.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return source;
}

/** The absolute URL for a stored image, for the places that do not need the gate. */
export { shopImageUri, API_BASE };
