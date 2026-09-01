/**
 * One command, from a cold repo to a link a judge can open on their own phone.
 *
 *   node scripts/demo-day.mjs
 *
 * What it does, in order, stopping the moment anything is wrong:
 *
 *   1. Seeds the pilot content, if the database has none.
 *   2. Runs `demo:reset --walk`, which puts the traveller state into a known
 *      shape AND refuses to continue if any screen would open empty.
 *   3. Builds the web app in SAME-ORIGIN mode, so it talks to whatever host it
 *      is served from rather than a hostname baked in at build time.
 *   4. Starts the API, serving that build itself. One origin, no CORS.
 *   5. Opens a Cloudflare tunnel and prints the public URL.
 *
 * WHY A TUNNEL AND NOT A DEPLOY. This runs the real backend - the real
 * geofence, the real host verification, the real SQLite file on this laptop -
 * so a judge checking in on their phone and a host approving it in the console
 * are two people using one system, which is the thing worth demonstrating and
 * the thing a static build cannot show. It also needs no card, no account and
 * no rebuild when the URL changes.
 *
 * WHAT IT COSTS. The laptop has to stay awake and online. If the venue wifi
 * dies, this dies with it - which is why the static demo stays deployed as the
 * fallback that works with no server at all.
 *
 * `cloudflared` is the only thing needed that is not already in this repo:
 *   winget install --id Cloudflare.cloudflared
 *   brew install cloudflared
 * Without it everything still runs; you get a LAN address instead of a public
 * one, which is enough when the judges are on the same wifi.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB_DIR = join(ROOT, 'apps', 'mobile', 'dist-live');
const PORT = process.env.PORT ?? '8787';

const children = [];
let shuttingDown = false;

// ---------------------------------------------------------------------------

const rule = () => console.log('─'.repeat(64));
const step = (n, what) => console.log(`\n[${n}/5] ${what}`);
const die = (why, fix) => {
  console.error(`\n  STOPPED: ${why}`);
  if (fix) console.error(`  ${fix}`);
  shutdown(1);
};

function run(command, args, { cwd = ROOT, env = {} } = {}) {
  const r = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  return r.status === 0;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try { child.kill(); } catch { /* already gone */ }
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

/**
 * The address a judge on the same wifi can actually reach.
 *
 * "First non-internal IPv4" is wrong on any real laptop. This one offered
 * 100.74.113.113 first - a Tailscale address, reachable only by devices on
 * that private network - and the script would have printed it under the words
 * "same wifi". A wrong address presented confidently is worse than none: it
 * sends someone to a page that never loads and no one can explain why.
 *
 * So: prefer genuine private LAN ranges, and skip the two that look like LAN
 * addresses and are not - CGNAT (100.64/10, where Tailscale lives) and the
 * Docker/WSL bridge on 172.17.
 */
function lanAddress() {
  const candidates = [];
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const a of addresses ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const [a1, a2] = a.address.split('.').map(Number);
      if (a1 === 100 && a2 >= 64 && a2 <= 127) continue;        // CGNAT / Tailscale
      if (a1 === 172 && a2 >= 16 && a2 <= 31) continue;         // Docker / WSL bridge
      if (a1 === 169 && a2 === 254) continue;                   // link-local, no DHCP
      const real = a1 === 192 && a2 === 168 ? 0 : a1 === 10 ? 1 : 2;
      candidates.push({ address: a.address, rank: real, name });
    }
  }
  candidates.sort((x, y) => x.rank - y.rank);
  return candidates[0]?.address ?? null;
}

const hasCloudflared = spawnSync('cloudflared', ['--version'], {
  stdio: 'ignore',
}).status === 0;

/**
 * Is another cloudflared already running on this machine?
 *
 * Worth saying out loud before starting one. A laptop that hosts somebody's
 * live site through a named tunnel is not an unusual laptop, and two tunnels
 * from one machine is the setup most likely to produce a symptom nobody can
 * attribute: requests succeeding or failing depending on which connector the
 * edge happened to pick.
 *
 * This does not stop the run - ours is isolated by --config and cannot touch
 * theirs. It stops the ten minutes of confusion later.
 */
function otherTunnelRunning() {
  const ps = process.platform === 'win32'
    ? spawnSync('tasklist', ['/FI', 'IMAGENAME eq cloudflared.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' })
    : spawnSync('pgrep', ['-c', 'cloudflared'], { encoding: 'utf8' });
  const out = `${ps.stdout ?? ''}`.trim();
  return process.platform === 'win32'
    ? out.toLowerCase().includes('cloudflared.exe')
    : Number(out) > 0;
}

// ---------------------------------------------------------------------------

rule();
console.log('ChivaGo · demo day');
rule();

step(1, 'Seeding the pilot content');
if (!run('pnpm', ['--filter', '@chivago/api', 'seed'])) {
  die('the content seed failed', 'Nothing else can work without places and quests.');
}

step(2, 'Resetting the traveller state, and checking every screen has something to show');
if (!run('pnpm', ['--filter', '@chivago/api', 'demo:reset', '--walk'])) {
  // --walk already named the empty screen. Do not paper over it: a demo that
  // starts with a known-blank screen is the failure this whole script exists
  // to catch, and catching it here means catching it before the audience.
  die('a screen would open empty', 'Fix what --walk named above, then run this again.');
}

step(3, 'Building the web app in same-origin mode');
// --clear is NOT optional, and this is not caution.
//
// Metro inlines EXPO_PUBLIC_* at transform time and caches the result keyed on
// the source, not on the environment. Build the demo once and this build reuses
// those modules: the demo server gets installed, `installDemoServer` folds to
// unconditional, and the app answers every request from a snapshot while the
// screen says it is talking to the real backend. It was caught by grepping the
// bundle, which is not a thing anybody does on the morning of a demo.
if (!run('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist-live', '--clear'], {
  cwd: join(ROOT, 'apps', 'mobile'),
  // NOT the demo build: this one talks to the real API it is served from.
  env: { EXPO_PUBLIC_API_URL: 'same-origin', EXPO_PUBLIC_DEMO: '' },
})) {
  die('the web build failed');
}
if (!run('node', ['scripts/flatten-assets.mjs', 'dist-live'], {
  cwd: join(ROOT, 'apps', 'mobile'),
})) {
  die('flattening the fonts failed', 'Every font would 404 and the app would hang on its splash.');
}
if (!existsSync(join(WEB_DIR, 'index.html'))) {
  die('the build produced no index.html');
}

step(4, 'Starting the API, serving that build');
const api = spawn('node', ['--experimental-strip-types', 'src/server.ts'], {
  cwd: join(ROOT, 'apps', 'api'),
  stdio: ['ignore', 'pipe', 'inherit'],
  env: { ...process.env, PORT, CHIVAGO_WEB_DIR: WEB_DIR },
});
children.push(api);
api.on('exit', (code) => {
  if (!shuttingDown) die(`the API exited with code ${code}`);
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('the API did not start in 30s')), 30_000);
  api.stdout.on('data', (chunk) => {
    const line = String(chunk);
    process.stdout.write(`      ${line}`);
    if (line.includes('listening')) { clearTimeout(timer); resolve(); }
  });
}).catch((error) => die(error.message));

step(5, hasCloudflared ? 'Opening a public tunnel' : 'No tunnel — cloudflared is not installed');

if (hasCloudflared && otherTunnelRunning()) {
  console.log('');
  console.log('      NOTE: cloudflared is already running on this machine.');
  console.log('      Ours runs isolated (--config of its own) and cannot touch it,');
  console.log('      but if another site on this laptop misbehaves, start here.');
}

const lan = lanAddress();

if (!hasCloudflared) {
  rule();
  console.log('\n  Running, but only on this network.\n');
  console.log(`      This laptop   http://localhost:${PORT}`);
  if (lan) console.log(`      Same wifi     http://${lan}:${PORT}`);
  console.log('\n  For a link that works from any network:');
  console.log('      winget install --id Cloudflare.cloudflared');
  console.log('      brew install cloudflared\n');
  console.log('  Ctrl+C to stop.');
  rule();
} else {
  // ISOLATED FROM THIS MACHINE'S CLOUDFLARED, which is the important part.
  //
  // cloudflared reads ~/.cloudflared/config.yml by default. On a machine that
  // already runs a named tunnel, that config names a tunnel and a credentials
  // file - so `cloudflared tunnel --url ...` quietly authenticates as somebody
  // else's production tunnel and registers a connector on it. That happened
  // here, against a live site, and the only reason nothing broke is luck.
  //
  // `--config` pointing at our own empty file stops it reading theirs. A quick
  // tunnel needs no credentials, so there is nothing else to supply.
  const isolatedConfig = join(ROOT, 'node_modules', '.cache', 'chivago-tunnel.yml');
  mkdirSync(dirname(isolatedConfig), { recursive: true });
  writeFileSync(isolatedConfig, [
    '# Written by scripts/demo-day.mjs. Not for editing.',
    '#',
    '# It occupies --config so cloudflared cannot fall back to',
    '# ~/.cloudflared/config.yml and borrow whatever tunnel lives there. It',
    '# cannot be empty: cloudflared rejects an empty config file outright.',
    '#',
    '# http2 rather than the default QUIC, because plenty of venue and office',
    '# networks drop outbound UDP on 7844 - this one does. When that happens',
    '# the tunnel still registers and still prints a URL. It just cannot carry',
    '# traffic, which looks exactly like success until somebody opens the link.',
    'protocol: http2',
    '',
  ].join('\n'), 'utf8');

  // NO SHELL. On Windows `shell: true` concatenates the args instead of
  // escaping them - Node warns about it - and `--url` arrived mangled, so
  // cloudflared opened a tunnel with no origin behind it. It still printed a
  // perfectly good URL. Every request to that URL returned 404.
  const tunnel = spawn('cloudflared', [
    'tunnel', '--config', isolatedConfig, '--no-autoupdate',
    '--url', `http://localhost:${PORT}`,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(tunnel);

  let announced = false;

  const watch = (chunk) => {
    const text = String(chunk);
    // Cloudflared's own output goes to the operator. The first version of this
    // swallowed everything that was not the URL, so the one run that failed
    // failed silently and the diagnosis had to come from curl.
    for (const line of text.split('\n')) {
      if (line.trim() && !/\btrycloudflare\.com\b/.test(line)) {
        console.log(`      ${line.trim()}`);
      }
    }

    const url = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)?.[0];
    if (!url || announced) return;
    announced = true;
    void announce(url);
  };

  tunnel.stdout.on('data', watch);
  tunnel.stderr.on('data', watch);

  tunnel.on('exit', (code) => {
    if (!shuttingDown) die(`the tunnel exited with code ${code}`);
  });

  /**
   * Print the link only once it has actually served something.
   *
   * A printed URL is a promise, and this script printed one that 404'd on
   * every path: the tunnel was up, the edge answered, and there was nothing
   * behind it. Handing that to a judge is worse than handing them nothing,
   * because they will try it once and stop.
   */
  async function announce(url) {
    process.stdout.write('\n      checking the tunnel actually serves the app');

    let served = false;
    for (let attempt = 0; attempt < 20 && !served; attempt += 1) {
      await new Promise((r) => { setTimeout(r, 1000); });
      process.stdout.write('.');
      try {
        const res = await fetch(`${url}/health`, { redirect: 'manual' });
        served = res.ok;
      } catch { /* the tunnel is still coming up */ }
    }
    console.log('');

    if (!served) {
      console.log('');
      rule();
      console.log('\n  The tunnel is up but is not reaching this machine.\n');
      console.log(`      ${url}/health did not answer\n`);
      console.log('  The app itself is fine — use the local address instead:\n');
      console.log(`      http://localhost:${PORT}`);
      if (lan) console.log(`      http://${lan}:${PORT}   (anyone on this wifi)`);
      console.log('\n  Ctrl+C to stop.');
      rule();
      return;
    }

    console.log('');
    rule();
    console.log('\n  Open this. It is the real backend, not the static demo.\n');
    console.log(`      ${url}\n`);
    console.log('  The host console, which the static demo cannot show at all:\n');
    console.log(`      ${url}/console\n`);
    if (lan) console.log(`      (same wifi, no tunnel: http://${lan}:${PORT})\n`);
    console.log('  Everything a judge does here is written to the SQLite file on');
    console.log('  this laptop. Re-run this script to put it all back.\n');
    console.log('  Ctrl+C to stop.');
    rule();
  }
}
