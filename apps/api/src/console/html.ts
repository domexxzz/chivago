/**
 * HTML rendering for the host console.
 *
 * Server-rendered, no build step, no bundle. That is a deliberate choice: the
 * console is used by municipal and NGO staff at office desks, sometimes on old
 * machines and often on the island's patchy connection. A 2 MB SPA to render a
 * list of twelve submissions would be the wrong trade.
 *
 * It links the real stylesheet, which carries the app's own palette since
 * 21 November 2026 - see the header of `public/modernist.css` for what moved
 * and what deliberately did not.
 */

import {
  htmlLang, LOCALE_NAMES, LOCALES, t, type ConsoleStringKey, type Locale,
} from './i18n.ts';

/**
 * Escape text for HTML.
 *
 * Everything interpolated into a page goes through this. Quest names, review
 * notes and user ids all originate outside the console, and a review note is
 * literally free text typed by a person - exactly the shape of an injection.
 */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A string that is already safe HTML.
 *
 * This type is the whole escaping boundary. `html` returns one, so a nested
 * template composes instead of being escaped into visible tag soup - which is
 * exactly what happened the first time the photo gallery rendered. Anything
 * that is NOT a Raw is treated as untrusted text, so the default is safe and
 * the unsafe path has to be spelled out.
 */
export class Raw {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

/**
 * Mark a string as already-safe HTML.
 * Only ever call this on markup this codebase produced. Never on input.
 */
export const raw = (value: string): Raw => new Raw(value);

/** Render one interpolated value. Raw passes through; arrays recurse. */
function renderValue(v: unknown): string {
  if (v instanceof Raw) return v.value;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(v);
}

/** Tagged template that escapes every interpolation by default. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): Raw {
  let out = strings[0] ?? '';
  for (let i = 0; i < values.length; i += 1) {
    out += renderValue(values[i]) + (strings[i + 1] ?? '');
  }
  return new Raw(out);
}

interface LayoutOptions {
  title: string;
  locale: Locale;
  hostName?: string;
  reviewer?: string | null;
  /** Renders the nav only when signed in. */
  signedIn?: boolean;
  activeNav?: 'queue' | 'history' | 'moderation' | 'guides' | 'sponsor' | 'esg' | 'statement' | 'stories'
    | 'coastal'
    | 'organisations' | 'quests' | 'questDesk' | 'reviewDeclared' | 'inquiries' | 'applications' | 'admin';
  pendingCount?: number;
  /** Shows the Reviews tab. Moderators only - see place-review-service.ts. */
  canModerate?: boolean;
  /** Global data administration. Never inferred from moderator access. */
  canAdmin?: boolean;
  /**
   * An operator's console (docs/62): the nav is its questions and the way
   * out, and the badge counts questions waiting on it rather than proofs -
   * it has no queue, and polling one would be refused every minute.
   */
  marketplaceOnly?: boolean;
  /** Path to return to after switching language. */
  path?: string;
  /**
   * A page for a stranger: no session, no console nav, no language switcher
   * (the locale cookie lives under /console and cannot reach it). The brand
   * slot shows who the page is about rather than "Sign in".
   */
  publicPage?: boolean;
}

export function layout(options: LayoutOptions, body: Raw | string): string {
  const { title, locale, hostName, reviewer, signedIn, activeNav, pendingCount } = options;
  // Hidden, not merely disabled: a tab a host can see but not open invites
  // them to ask why, and the answer is a permission boundary they cannot
  // cross. Better it simply is not theirs.
  const canModerate = options.canModerate ?? false;
  const canAdmin = options.canAdmin ?? false;
  const marketplaceOnly = options.marketplaceOnly ?? false;
  const tr = (key: ConsoleStringKey) => t(key, locale);
  const returnTo = options.path ?? '/console';
  return `<!doctype html>
<html lang="${htmlLang(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${pendingCount ? `(${pendingCount}) ` : ''}${esc(title)} · ChivarGo Host Console</title>
<!-- Same origin as the app, so /favicon.ico would be found anyway; this names
     the 192px mark so a retina tab gets the sharp one. Both come out of the
     web export, and 404 harmlessly on an API started without one. -->
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
<link rel="stylesheet" href="/console/assets/modernist.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<!-- Archivo carries no Thai glyphs, so Noto Sans Thai is loaded alongside it and
     listed FIRST in the Thai stack. Without it the browser falls back to a
     system Thai face that does not match the rest of the system. -->
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600;800&display=swap" rel="stylesheet">
<style>
  body { max-width: 1080px; margin: 0 auto; padding: 0 24px 64px; }
  /* Thai needs its own face and a looser line-height than Latin. Never share a
     line-height across scripts. */
  html[lang="th"] body { font-family: "Noto Sans Thai", var(--font-body), sans-serif; line-height: 1.7; }
  html[lang="th"] h1, html[lang="th"] h2, html[lang="th"] h3,
  html[lang="th"] h4, html[lang="th"] .brand, html[lang="th"] .stat {
    font-family: "Noto Sans Thai", var(--font-heading), sans-serif; line-height: 1.35; }
  html[lang="th"] .kicker { letter-spacing: .06em; }
  .lang { display:flex; gap:2px; margin-left:12px; }
  .lang a { display:inline-block; padding:8px 10px; font-size:11px; font-weight:600;
            text-decoration:none; border:1px solid var(--color-neutral-300);
            border-radius:var(--radius-sm); color:var(--color-neutral-700); }
  .lang a.on { border-color:var(--color-text); background:var(--color-text); color:var(--color-bg); }
  a { color: var(--color-brand-700); }
  .bar { display:flex; align-items:center; justify-content:space-between; gap:16px;
         border-bottom:1px solid var(--color-divider); padding:18px 0; margin-bottom:24px; }
  .brand { font-family:var(--font-heading); font-weight:800; font-size:20px; letter-spacing:-0.02em;
           color:var(--color-brand-800); }
  .kicker { font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:var(--color-neutral-700); }
  /* Wraps at every width, not only on a phone. A moderator's nav is thirteen
     tabs and overflowed the page sideways on a laptop long before Operators
     was added to it; a second row of tabs is better than a horizontal
     scrollbar on every page of the console. */
  .bar-tools { display:flex; align-items:center; }
  .nav { display:flex; gap:2px; flex-wrap:wrap; justify-content:flex-end; }
  .nav a { display:inline-block; padding:8px 14px; font-family:var(--font-heading); font-weight:800;
           font-size:12px; letter-spacing:.06em; text-transform:uppercase; text-decoration:none;
           border:1px solid var(--color-neutral-300); border-radius:var(--radius-sm);
           background:var(--color-surface); color:var(--color-brand-800); }
  .nav a:hover { border-color:var(--color-brand-400); }
  .nav a.on { background:var(--color-brand-700); border-color:var(--color-brand-700); color:#ffffff; }
  .row { display:flex; gap:16px; align-items:flex-start; padding:16px 0;
         border-bottom:1px solid var(--color-neutral-200); }
  .code { width:56px; height:56px; flex:none; border:1px solid var(--color-brand-200);
          border-radius:var(--radius-md); background:var(--color-brand-100);
          color:var(--color-brand-800);
          display:flex; align-items:center; justify-content:center;
          font-family:var(--font-heading); font-weight:800; font-size:12px; }
  .stat { font-family:var(--font-heading); font-weight:800; font-size:30px; letter-spacing:-0.02em; }
  .grid { display:grid; grid-template-columns:repeat(3,1fr); border-top:1px solid var(--color-divider); }
  .grid > div { padding:16px; border-bottom:1px solid var(--color-neutral-300);
                border-right:1px solid var(--color-neutral-300); }
  .grid > div:last-child { border-right:0; }
  .check { display:flex; gap:12px; align-items:flex-start; padding:12px 0;
           border-bottom:1px solid var(--color-neutral-200); }
  /*
    FOUR STATES, FOUR COLOURS. Warn and fail were both the one strong
    colour the old palette had, and pass was plain ink - so a reviewer
    scanning the column could not tell a thing that needs a second look from a
    thing that failed, and a pass looked like a bullet point. Now they read
    the way they do everywhere else in the product: green verified, gold worth
    checking, red wrong, grey unknowable.
  */
  .dot { width:10px; height:10px; flex:none; margin-top:5px; border-radius:50%; }
  .pass { background:var(--color-ok-600); }
  .warn { background:var(--color-warn-500); }
  .fail { background:var(--color-accent); }
  .unknown { background:var(--color-neutral-400); }
  .photos { display:flex; gap:12px; flex-wrap:wrap; margin:16px 0; }
  .photo { border:1px solid var(--color-neutral-300); border-radius:var(--radius-md);
           overflow:hidden; background:var(--color-surface); }
  /*
    IN COLOUR. These were greyscaled, which was the old system's house style
    and is the wrong treatment for the one thing on the page a reviewer is
    being asked to judge: whether a beach got cleaned is a question about
    green water, brown sand and the colour of what is in the bag.
  */
  .photo img { display:block; width:220px; height:165px; object-fit:cover; }
  .photo figcaption { font-size:11px; padding:6px 8px; border-top:1px solid var(--color-neutral-200);
                      color:var(--color-neutral-700); }
  /* "read from the file" - quieter than the figure it qualifies, because it
     is provenance rather than a reading. */
  .photo figcaption .src { color:var(--color-neutral-700); font-style:italic; }
  .badge { display:inline-block; font-family:var(--font-heading); font-weight:800; font-size:11px;
           letter-spacing:.06em; text-transform:uppercase; padding:3px 8px;
           border-radius:999px; }
  /* White on accent-700 is 7.07:1; the page ground on accent-600 was 4.41:1,
     under AA for an 11px bold label. */
  .badge-overdue { background:var(--color-accent-700); color:#ffffff; }
  .badge-ok { border:1px solid var(--color-neutral-300); background:var(--color-surface);
              color:var(--color-neutral-700); }
  .actions { display:flex; gap:12px; margin-top:24px; flex-wrap:wrap; }
  .actions form { display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap; }
  /* A white field on the pale ground, so the box is found by its fill rather
     than by a 2px rule around it. The border stays visible on its own. */
  textarea, input[type=text], input[type=password], select {
    font-family:var(--font-body); font-size:14px; padding:10px 12px;
    border:1px solid var(--color-neutral-400); background:var(--color-surface);
    color:var(--color-text); border-radius:var(--radius-sm); }
  textarea:focus, input[type=text]:focus, input[type=password]:focus, select:focus {
    border-color:var(--color-brand-600); }
  textarea { width:100%; min-height:80px; }
  button { cursor:pointer; }
  .danger { background:var(--color-surface); color:var(--color-accent-700);
            border:1px solid var(--color-accent); border-radius:var(--radius-sm); }
  .muted { color:var(--color-neutral-700); font-size:13px; }
  .empty { padding:64px 0; text-align:left; }
  @media (max-width:720px){ .grid { grid-template-columns:1fr; } }
  /* A phone. Most hosts are a municipal officer or a market trader with a
     phone, not a desk; the console has to work between two other things. */
  @media (max-width:720px){
    body { padding: 0 14px 48px; }
    .bar { flex-direction:column; align-items:flex-start; gap:10px; padding:12px 0; }
    /* Menu and languages stacked under the host name, left-aligned. Side by
       side, the right-aligned menu wrapped into a staggered column half a
       phone screen tall, beside the language buttons (seen 20 Nov 2026). */
    .bar-tools { flex-direction:column; align-items:flex-start; gap:10px; width:100%; }
    .nav { justify-content:flex-start; flex-wrap:wrap; gap:4px; }
    .lang { margin-left:0; }
    .nav a { padding:8px 10px; font-size:11px; }
    .row { flex-direction:column; gap:8px; }
    .photo img { width:100%; height:auto; max-height:60vh; }
    .photos { flex-direction:column; }
    table { display:block; overflow-x:auto; max-width:100%; }
    textarea, input[type=text], input[type=password], select { width:100%; box-sizing:border-box; }
    .actions form { width:100%; }
    button { min-height:44px; }
  }
  #pending-badge:empty { display:none; }
</style>
</head>
<body>
<header class="bar">
  <div>
    <div class="kicker">${esc(options.publicPage ? 'ChivarGo' : tr('brand'))}</div>
    <div class="brand">${esc(hostName ?? tr('signIn'))}</div>
  </div>
  <div class="bar-tools">
    ${
      signedIn && marketplaceOnly
        ? `<nav class="nav">
             <a href="/console/inquiries" class="${activeNav === 'inquiries' ? 'on' : ''}">${tr('inquiries')}<span id="pending-badge">${
               pendingCount ? ` · ${pendingCount}` : ''
             }</span></a>
             <a href="/console/logout">${tr('signOut')}</a>
           </nav>`
        : signedIn
        ? `<nav class="nav">
             <a href="/console" class="${activeNav === 'queue' ? 'on' : ''}">${tr('queue')}<span id="pending-badge">${
               pendingCount ? ` · ${pendingCount}` : ''
             }</span></a>
             <a href="/console/history" class="${activeNav === 'history' ? 'on' : ''}">${tr('history')}</a>
             ${canModerate ? `<a href="/console/reviews" class="${activeNav === 'moderation' ? 'on' : ''}">${tr('moderation')}</a>` : ''}
             ${canModerate ? `<a href="/console/guides" class="${activeNav === 'guides' ? 'on' : ''}">${locale === 'en' ? 'Guide approvals' : 'อนุมัติไกด์'}</a>` : ''}
             ${canModerate ? `<a href="/console/review" class="${activeNav === 'reviewDeclared' ? 'on' : ''}">${tr('reviewDeclared')}</a>` : ''}
             ${canModerate ? `<a href="/console/organisations" class="${activeNav === 'organisations' ? 'on' : ''}">${tr('organisations')}</a>` : ''}
             ${canModerate ? `<a href="/console/applications" class="${activeNav === 'applications' ? 'on' : ''}">${tr('applications')}</a>` : ''}
             ${canAdmin ? `<a href="/console/admin" class="${activeNav === 'admin' ? 'on' : ''}">ADMIN</a>` : ''}
             <a href="/console/quest-desk" class="${activeNav === 'questDesk' ? 'on' : ''}">${tr('questDesk')}</a>
             <a href="/console/quests" class="${activeNav === 'quests' ? 'on' : ''}">${tr('quests')}</a>
             <a href="/console/sponsor" class="${activeNav === 'sponsor' ? 'on' : ''}">${tr('sponsor')}</a>
             <a href="/console/esg" class="${activeNav === 'esg' ? 'on' : ''}">${tr('esg')}</a>
             <a href="/console/coastal" class="${activeNav === 'coastal' ? 'on' : ''}">${locale === 'en' ? 'Shoreline' : 'ชายฝั่ง'}</a>
             <a href="/console/statement" class="${activeNav === 'statement' ? 'on' : ''}">${tr('statement')}</a>
             <a href="/console/stories" class="${activeNav === 'stories' ? 'on' : ''}">${tr('stories')}</a>
             <a href="/console/inquiries" class="${activeNav === 'inquiries' ? 'on' : ''}">${tr('inquiries')}</a>
             <a href="/console/sos" style="border-color:var(--color-accent);color:var(--color-accent-700)">SOS</a>
             <a href="/console/logout">${tr('signOut')}</a>
           </nav>`
        : ''
    }
    ${options.publicPage ? '' : `<div class="lang">
      ${LOCALES.map(
        (l) =>
          `<a href="/console/lang/${l}?to=${encodeURIComponent(returnTo)}" class="${
            l === locale ? 'on' : ''
          }" hreflang="${l}" lang="${l}">${esc(LOCALE_NAMES[l])}</a>`,
      ).join('')}
    </div>`}
  </div>
</header>
${reviewer ? `<p class="muted">${esc(tr('signedInAs'))} ${esc(reviewer)}</p>` : ''}
${body instanceof Raw ? body.value : esc(body)}
${signedIn ? `<script>
(function(){
  // Doubled backslashes: this is a template string, which would otherwise eat
  // them and ship /^(d+) / - a regex that matches nothing, so every poll put
  // a second "(1) " in front of the title.
  var base = document.title.replace(/^\\(\\d+\\) /, '');
  var last = ${Number(pendingCount ?? 0)};
  var badge = document.getElementById('pending-badge');
  function show(n){
    document.title = (n ? '(' + n + ') ' : '') + base;
    if (badge) badge.textContent = n ? ' · ' + n : '';
  }
  function poll(){
    fetch(${JSON.stringify(marketplaceOnly ? '/console/inquiries/waiting' : '/console/pending')}, { credentials: 'same-origin', cache: 'no-store' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        if (!j) return;
        if (j.pending > last && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('ChivarGo', { body: ${JSON.stringify(tr(marketplaceOnly ? 'newQuestionWaiting' : 'newProofWaiting'))}, tag: 'chivago-pending' });
        }
        last = j.pending; show(j.pending);
      }).catch(function(){});
  }
  setInterval(poll, 60000);
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) poll(); });
  var ask = document.getElementById('notify-me');
  if (ask && 'Notification' in window) {
    if (Notification.permission === 'granted') ask.textContent = ${JSON.stringify(tr('notifyOn'))};
    ask.addEventListener('click', function(){
      Notification.requestPermission().then(function(p){ if (p === 'granted') ask.textContent = ${JSON.stringify(tr('notifyOn'))}; });
    });
  } else if (ask) { ask.style.display = 'none'; }
})();
</script>` : ''}
</body>
</html>`;
}
