/**
 * What the server says about itself, fetched once per launch.
 *
 * There is one field and it is not a feature flag: `fenceOff` says the server
 * has stopped checking where anybody is. The app is REQUIRED to draw that -
 * see apps/api/src/fence.ts - so this cannot sit behind a screen that happens
 * to fetch it. It is fetched at the root, before sign-in, and shared.
 *
 * One in-flight request for the whole app: the band at the top and the line
 * under a place's visitor count both need the answer, and two components
 * asking the same question must not become two requests, nor two answers.
 */

import React from 'react';
import { api } from '../api/client.ts';

export interface ServerConfig {
  /** The server is not checking positions. Say so, loudly. */
  fenceOff: boolean;
}

/** Fenced until told otherwise: an unreachable server must never read as open. */
export const FENCED: ServerConfig = { fenceOff: false };

let inFlight: Promise<ServerConfig> | null = null;

/** The shared fetch. Failure resolves to FENCED rather than rejecting. */
export function serverConfig(): Promise<ServerConfig> {
  inFlight ??= api.config().then(
    (res) => (res.ok ? { fenceOff: res.data.fenceOff === true } : FENCED),
    () => FENCED,
  );
  return inFlight;
}

/** Test seam: forget the cached answer. */
export const __resetServerConfig = (): void => { inFlight = null; };

/** The answer, once it arrives. FENCED until then. */
export function useServerConfig(): ServerConfig {
  const [config, setConfig] = React.useState<ServerConfig>(FENCED);
  React.useEffect(() => {
    let alive = true;
    void serverConfig().then((c) => { if (alive) setConfig(c); });
    return () => { alive = false; };
  }, []);
  return config;
}
