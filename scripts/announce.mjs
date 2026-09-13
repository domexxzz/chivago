/**
 * Say what just changed: to Discord, and to Hermes on this machine.
 *
 *   node scripts/announce.mjs "title" "what changed"
 *   node scripts/announce.mjs --from-git            # last commit, read off HEAD
 *   node scripts/announce.mjs --dry-run "t" "b"     # print, send nothing
 *
 * THE RULE THIS FILE FOLLOWS: announcing must never break the thing it is
 * announcing. Every network call is wrapped, the exit code is 0 unless
 * --strict is passed, and a Discord outage or a stopped Hermes is reported on
 * stdout and then forgiven. A release script that fails because a chat
 * message did not send has its priorities backwards.
 *
 * THE WEBHOOK IS A CREDENTIAL. It lives in `.env`, which this repository has
 * ignored since its first commit, and is read from the environment here.
 * Anybody holding that URL can post into the channel as this app, so it is
 * never printed, never echoed back in an error, and never committed. See
 * `.env.example` for the names.
 *
 * Hermes is the memory service on this machine (sentiara-ai, port 8770). It
 * is optional by design: a laptop that is not running it still gets the
 * Discord post, and the script says which of the two landed.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `.env`, read here rather than by a dependency.
 *
 * Four lines of parsing against a package, a lockfile entry and a supply
 * chain. The format is the subset that is actually used: KEY=value, hashes
 * are comments, surrounding quotes come off.
 */
function loadEnv() {
  try {
    for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
      const text = line.trim();
      if (!text || text.startsWith('#')) continue;
      const at = text.indexOf('=');
      if (at < 1) continue;
      const key = text.slice(0, at).trim();
      if (process.env[key] !== undefined) continue; // a real env var wins
      process.env[key] = text.slice(at + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // No .env is normal on a machine that passes the webhook in the environment.
  }
}

const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: 8000 }).trim();
  } catch {
    return '';
  }
};

/** What HEAD says, for `--from-git`. */
function fromGit() {
  const subject = git('log', '-1', '--pretty=%s');
  const bodyText = git('log', '-1', '--pretty=%b').trim();
  const stat = git('show', '--stat', '--oneline', 'HEAD').split('\n').slice(-1)[0]?.trim() ?? '';
  return {
    title: subject || 'Update',
    // The commit body carries the reasoning in this repository, so it is the
    // announcement. Trimmed to what a chat message can hold without becoming
    // a wall nobody reads.
    body: [bodyText.split('\n\n')[0] ?? '', stat].filter(Boolean).join('\n\n'),
  };
}

/** Facts worth having beside the message, all read rather than passed in. */
function context() {
  return {
    branch: git('branch', '--show-current') || '?',
    sha: git('rev-parse', '--short', 'HEAD') || '?',
    subject: git('log', '-1', '--pretty=%s'),
    dirty: git('status', '--porcelain').split('\n').filter((l) => l.trim()).length,
  };
}

const REPO_URL = 'https://github.com/domexxzz/chivago';
const clip = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

async function toDiscord(title, body, ctx) {
  const url = process.env.CHIVAGO_DISCORD_WEBHOOK;
  if (!url) return { ok: false, why: 'CHIVAGO_DISCORD_WEBHOOK is not set' };

  const payload = {
    username: 'ChivaGo',
    embeds: [{
      title: clip(title, 250),
      description: clip(body || '_no detail given_', 3800),
      url: ctx.sha === '?' ? undefined : `${REPO_URL}/commit/${ctx.sha}`,
      // The brand teal. A colour makes a stream of these scannable at a glance.
      color: 0x0e7480,
      fields: [
        { name: 'branch', value: ctx.branch, inline: true },
        { name: 'commit', value: ctx.sha, inline: true },
        {
          name: 'working tree',
          // Said plainly: an announcement made from a dirty tree describes
          // something that is not what anybody else can check out.
          value: ctx.dirty === 0 ? 'clean' : `${ctx.dirty} uncommitted`,
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
    }],
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    // The URL is never included in the reason, whatever the status was.
    return res.ok ? { ok: true } : { ok: false, why: `Discord answered ${res.status}` };
  } catch (err) {
    return { ok: false, why: `Discord unreachable (${err.name})` };
  }
}

async function toHermes(title, body, ctx) {
  const base = process.env.CHIVAGO_HERMES_URL ?? 'http://localhost:8770';
  const content = [
    `[ChivaGo ${ctx.sha}] ${title}`,
    body,
    `branch ${ctx.branch} · ${ctx.dirty === 0 ? 'tree clean' : `${ctx.dirty} uncommitted`} · ${REPO_URL}`,
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch(`${base}/memory/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'project',
        content,
        tags: ['chivago', 'update'],
        importance: 'normal',
      }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok ? { ok: true } : { ok: false, why: `Hermes answered ${res.status}` };
  } catch (err) {
    // Expected on any machine not running sentiara-ai. Not a failure.
    return { ok: false, why: `Hermes not reachable at ${base} (${err.name})` };
  }
}

async function main() {
  loadEnv();
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const strict = argv.includes('--strict');
  const useGit = argv.includes('--from-git');
  const words = argv.filter((a) => !a.startsWith('--'));

  const ctx = context();
  const { title, body } = useGit
    ? fromGit()
    : { title: words[0] ?? ctx.subject ?? 'Update', body: words.slice(1).join('\n') };

  if (dryRun) {
    console.log(`[announce] DRY RUN — nothing sent\n  title: ${title}\n  body: ${body}\n  ${ctx.branch} · ${ctx.sha} · ${ctx.dirty} uncommitted`);
    console.log(`  discord: ${process.env.CHIVAGO_DISCORD_WEBHOOK ? 'webhook configured' : 'NOT configured'}`);
    return 0;
  }

  const [discord, hermes] = await Promise.all([toDiscord(title, body, ctx), toHermes(title, body, ctx)]);
  console.log(`[announce] discord: ${discord.ok ? 'sent' : `skipped — ${discord.why}`}`);
  console.log(`[announce] hermes:  ${hermes.ok ? 'saved' : `skipped — ${hermes.why}`}`);

  // Zero unless asked otherwise. See the rule at the top of this file.
  return strict && !(discord.ok && hermes.ok) ? 1 : 0;
}

main().then((code) => process.exit(code), (err) => {
  console.log(`[announce] failed, and is not stopping anything: ${err.message}`);
  process.exit(0);
});
