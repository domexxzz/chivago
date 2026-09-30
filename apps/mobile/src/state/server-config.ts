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
  /** Nothing is reviewed before it is public. Say so before somebody posts. */
  autoApprove: boolean;
  /** Proof photos may be shown to an AI for the host (docs/63). Say so before somebody sends them. */
  aiAssist: boolean;
}

/**
 * The careful reading, used until the server says otherwise and whenever it
 * cannot be reached. Every field defaults to the SAFER claim: a fence that is
 * being enforced, a queue that somebody is watching, and - the one that
 * reads the other way - photos that an AI MAY see. A failed request must
 * never talk a traveller into posting something on the belief that it will
 * be checked, nor into sending a photograph on the belief that no machine
 * will look at it. The notice says "may", so it stays true either way.
 */
export const FENCED: ServerConfig = { fenceOff: false, autoApprove: false, aiAssist: true };

let inFlight: Promise<ServerConfig> | null = null;

/** The shared fetch. Failure resolves to FENCED rather than rejecting. */
export function serverConfig(): Promise<ServerConfig> {
  inFlight ??= api.config().then(
    (res) => (res.ok
      ? {
          fenceOff: res.data.fenceOff === true,
          autoApprove: res.data.autoApprove === true,
          // Only an explicit false stands the notice down; an older server
          // that does not send the field gets the careful reading.
          aiAssist: res.data.aiAssist !== false,
        }
      : FENCED),
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
