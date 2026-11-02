/**
 * How to talk to Air4Thai, which is harder than it should be.
 *
 * Air4Thai is Thailand's official monitoring network and the CROSS-CHECK
 * behind every air reading this product publishes: if the modelled value and
 * the nearest ground station diverge badly, the reading is downgraded to
 * `estimated` so the Healthy Score weights it lower rather than trusting it.
 * Losing the cross-check does not break anything visibly - it quietly removes
 * the only thing standing between a model's guess and a number presented as
 * real. That is why this file exists rather than a line of `fetch`.
 *
 * THE SERVER FORGETS ITS OWN CHAIN. Its certificate is a Let's Encrypt leaf
 * signed by the YR1 intermediate, but the server sends Sectigo's intermediates
 * under it, so a client that does not go and fetch the right ones for itself
 * cannot build the chain. Browsers do that (AIA fetching). The two missing
 * links are bundled in `apps/api/certs/`; trust still ends at ISRG Root X1.
 *
 * NEITHER RUNTIME CAN DO THIS THE SAME WAY, and that is measured:
 *
 *   node, system roots only  ->  UNABLE_TO_VERIFY_LEAF_SIGNATURE
 *   node, with the chain     ->  200
 *   workerd `fetch`          ->  TLS peer's certificate is not trusted;
 *                                unable to get local issuer certificate
 *
 * So Cloudflare's TLS stack does not do AIA fetching either, and offers no way
 * to hand it a chain - there is no `ca` option on `fetch`. On Workers this
 * request cannot be made at all, by any arrangement of the code in this
 * repository.
 *
 * THE WAY ROUND IT is the container that already exists. ffmpeg cannot run on
 * Workers either, so the deployment already has one box running Node
 * (`Dockerfile.transcode`); it can make this request and hand back the JSON.
 * One container, two jobs that both need Node, rather than a second container
 * for one HTTP call.
 */

import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { rootCertificates } from 'node:tls';

export const AIR4THAI_URL = 'https://air4thai.pcd.go.th/services/getNewAQI_JSON.php';

/**
 * The two missing links, read on FIRST USE.
 *
 * Not at module scope: `new URL('../certs/...', import.meta.url)` throws
 * "Invalid URL string" on Workers, and as a module-scope read it took the
 * whole Worker down at startup, before any route answered. Lazily, a runtime
 * that cannot do this fails where it tries, not where it loads.
 *
 * When Air4Thai renews under a different intermediate this breaks again, out
 * loud - the warning in `air.ts` names the directory.
 */
const CHAIN_FILES = ['lets-encrypt-yr1.pem', 'isrg-root-yr-by-x1.pem'];
let chain: string[] | null = null;
const air4thaiCa = (): string[] => {
  chain ??= CHAIN_FILES.map((f) => readFileSync(new URL(`../certs/${f}`, import.meta.url), 'utf8'));
  return chain;
};

/**
 * The request, over Node's TLS, carrying the chain the server omits.
 *
 * Exported so the sidecar can make it: that service is the only place this
 * works when the API is on Workers.
 */
export function fetchOverNodeTls(timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      AIR4THAI_URL,
      { ca: [...rootCertificates, ...air4thaiCa()], timeout: timeoutMs },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`upstream ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (e) {
            reject(e as Error);
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('air4thai: timed out')));
    req.on('error', reject);
    req.end();
  });
}

/** Where the Node sidecar is, if this deployment has one. */
const sidecarUrl = (): string | undefined =>
  process.env.CHIVAGO_TRANSCODE_URL?.replace(/\/+$/, '') || undefined;

/**
 * The same reading, asked for through the sidecar.
 *
 * Plain `fetch`, because the hop to the container is an ordinary HTTPS (or
 * HTTP, inside a private network) request to a server that sends its own chain
 * properly. The awkward TLS is entirely on the far side.
 */
async function fetchViaSidecar(base: string, timeoutMs: number): Promise<unknown> {
  const token = process.env.CHIVAGO_TRANSCODE_TOKEN ?? '';
  const res = await fetch(`${base}/air4thai`, {
    headers: token ? { 'x-transcode-token': token } : {},
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`sidecar answered ${res.status}: ${(await res.text()).slice(0, 120)}`);
  }
  return res.json();
}

/**
 * Ask whichever way this runtime can.
 *
 * With a sidecar configured, through it; otherwise directly, which is the
 * single-machine deployment and unchanged. A Worker with no sidecar reaches
 * the direct path and fails there - deliberately, and with the message below,
 * because silently having no cross-check is the outcome this file exists to
 * prevent.
 */
export function fetchAir4Thai(timeoutMs: number): Promise<unknown> {
  const base = sidecarUrl();
  if (base) return fetchViaSidecar(base, timeoutMs);
  if (!canDoNodeTls()) {
    return Promise.reject(new Error(
      'this runtime cannot supply the certificate chain Air4Thai omits, and no sidecar is '
      + 'configured - set CHIVAGO_TRANSCODE_URL so the cross-check can be made there',
    ));
  }
  return fetchOverNodeTls(timeoutMs);
}

/**
 * Can this runtime make the request itself?
 *
 * `node:tls` resolves under `nodejs_compat` but does not carry a root store,
 * so the honest test is whether there are any roots to build a chain from -
 * not whether the import succeeded.
 */
const canDoNodeTls = (): boolean =>
  Array.isArray(rootCertificates) && rootCertificates.length > 0;
