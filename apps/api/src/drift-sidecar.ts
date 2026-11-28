/**
 * Reading the published drift run from the API side.
 *
 * The run is a static file served by Workers Assets at
 * `/islands/koh-sichang.drift.json`, and the app fetches it from there. The
 * console needs the same bytes, and there are only bad ways to get them
 * otherwise: the ASSETS binding lives on the Worker env rather than inside the
 * routes, and copying the 43 segments into a module would give the island two
 * coastlines that could drift apart without anybody noticing.
 *
 * So: one HTTP fetch of a 12 KB file off our own origin, with the same
 * discipline `coastal-intelligence.ts` already uses for Open-Meteo - a
 * timeout, a capped body, a refused redirect and a TTL cache - because a
 * console page that hangs on a fetch is a console page nobody can use during
 * an incident.
 */

import { parseDriftRun, type DriftRun } from './coastal-calibration.ts';

const PATH = '/islands/koh-sichang.drift.json';
const TIMEOUT_MS = 4_000;
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Ten minutes.
 *
 * The run itself has a six-hour window, so this is not about freshness - it is
 * about not fetching the same unchanged file on every reload of a page
 * somebody is sorting and re-sorting.
 */
export const SIDECAR_TTL_MS = 10 * 60_000;

/** After a failure, wait before trying again rather than retrying per render. */
export const SIDECAR_RETRY_MS = 60_000;

interface Cached {
  run: DriftRun | null;
  at: number;
}

let cached: Cached | null = null;

/** For tests, which must not inherit another test's cache. */
export function __resetDriftSidecar(): void {
  cached = null;
}

export const driftSidecarUrl = (): string =>
  `${(process.env.CHIVAGO_PUBLIC_URL ?? 'http://localhost:8787').replace(/\/+$/, '')}${PATH}`;

async function readCapped(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error('drift sidecar too large');
    }
    text += decoder.decode(value, { stream: true });
  }
}

export interface SidecarOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: number;
}

/**
 * The published run, or null.
 *
 * Null is a real answer and the page must be able to render it: a deployment
 * with no sidecar, a file that failed to parse, a fetch that timed out. None
 * of those is an excuse to show a shoreline ranking, and
 * `coastalCalibration(db, null, ...)` still reports every weighed kilo as
 * unattributed rather than losing it.
 */
export async function publishedDriftRun(opts: SidecarOptions = {}): Promise<DriftRun | null> {
  const now = opts.now ?? Date.now();
  const fetchImpl = opts.fetchImpl ?? fetch;
  if (cached && now - cached.at < (cached.run ? SIDECAR_TTL_MS : SIDECAR_RETRY_MS)) {
    return cached.run;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  try {
    const response = await fetchImpl(driftSidecarUrl(), {
      signal: controller.signal,
      /*
        'manual', not 'error', for the reason coastal-intelligence.ts records
        at length: Workers refuses 'error' outright, so every call threw. A
        3xx comes back as a response whose `ok` is false, and the check below
        still refuses it.
      */
      redirect: 'manual',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`sidecar ${response.status}`);
    const run = parseDriftRun(JSON.parse(await readCapped(response)));
    cached = { run, at: now };
    return run;
  } catch {
    cached = { run: null, at: now };
    return null;
  } finally {
    clearTimeout(timer);
  }
}
