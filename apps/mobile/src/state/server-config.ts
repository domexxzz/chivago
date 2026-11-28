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
  /**
   * Clips and photographs people post go public with nobody looking at them
   * first. Say so before somebody posts. Named for what it governs: quest
   * proof is never auto-approved, and the old name did not make that clear.
   */
  storiesAutoApprove: boolean;
  /** Proof photos may be shown to an AI for the host (docs/64). Say so before somebody sends them. */
  aiAssist: boolean;
  /** Who reads debris reports, or null: the report button exists only when somebody does. */
  debrisReader: string | null;
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
export const FENCED: ServerConfig = { fenceOff: false, storiesAutoApprove: false, aiAssist: true, debrisReader: null };

let inFlight: Promise<ServerConfig> | null = null;

/** The shared fetch. Failure resolves to FENCED rather than rejecting. */
export function serverConfig(): Promise<ServerConfig> {
  inFlight ??= api.config().then(
    (res) => (res.ok
      ? {
          fenceOff: res.data.fenceOff === true,
          // The new name wins; `autoApprove` is the deprecated alias a server
          // older than the rename still sends alone. `??` and not `||` so a
          // server saying `storiesAutoApprove: false` is believed rather than
          // falling through to the alias.
          storiesAutoApprove: (res.data.storiesAutoApprove ?? res.data.autoApprove) === true,
          // Only an explicit false stands the notice down; an older server
          // that does not send the field gets the careful reading.
          aiAssist: res.data.aiAssist !== false,
          // Only a name is a reader. Anything else - absent, empty, an older
          // server - is nobody, and the button stays away.
          debrisReader: typeof res.data.debrisReader === 'string' && res.data.debrisReader.trim()
            ? res.data.debrisReader.trim()
            : null,
        }
      : FENCED),
    () => FENCED,
  );
  return inFlight;
}

/** How long `locationOff` waits for the server's word before reading the GPS anyway. */
export const LOCATION_PATIENCE_MS = 1_500;

/**
 * True when the app must not read the GPS for quests, check-ins, adventure
 * stops or the map: the server has opened the fence (apps/api/src/fence.ts),
 * so a position would be measured against nothing, and asking for one would
 * only put a permission dialog in front of a tester who is not on the island.
 *
 * Awaits the shared fetch, so the answer is the server's and not the FENCED
 * default a component holds before the fetch lands - but only for
 * LOCATION_PATIENCE_MS. A failed fetch, or one still out after that, is
 * FENCED, which keeps reading the GPS: the side that cannot refuse an honest
 * visit, and the one that does not leave a phone on one bar of island signal
 * waiting eight seconds for a map dot it used to get at once. The root fetches
 * the config at launch, so in practice the answer is long settled by the time
 * anybody opens a map or presses a button.
 *
 * SOS and live party sharing do not ask this. Somebody in trouble is found by
 * their position whatever the fence says.
 */
export const locationOff = async (): Promise<boolean> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const patience = new Promise<ServerConfig>((resolve) => {
    timer = setTimeout(() => resolve(FENCED), LOCATION_PATIENCE_MS);
  });
  try {
    return (await Promise.race([serverConfig(), patience])).fenceOff;
  } finally {
    clearTimeout(timer);
  }
};

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
