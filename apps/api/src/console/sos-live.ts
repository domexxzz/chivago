/**
 * The public live-location page.
 *
 * A family member abroad cannot be asked to install an app or create an account
 * in the middle of an emergency. They get a link, they open it in a browser,
 * they see where the person is. That is the whole design.
 *
 * ACCESS CONTROL IS THE URL. The token is 32 bytes of CSPRNG, so it is not
 * guessable; everything else follows from that:
 *  - `noindex` so it never reaches a search engine;
 *  - `no-store` so no proxy or browser keeps a copy;
 *  - `no-referrer` so the token does not leak through an outbound click;
 *  - the page dies when the alert ends. It showed where someone was during an
 *    emergency; it is not a permanent tracker.
 *
 * Bilingual, and both languages are shown together rather than switched. The
 * reader is whoever the person in trouble happened to send it to, and there is
 * no time to work out a language toggle.
 */

import { esc } from './html.ts';
import type { PublicAlertView } from '../sos-service.ts';

const MAPS = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

export function sosLivePage(view: PublicAlertView | null): string {
  if (!view) return notFoundPage();
  if (!view.live) return endedPage(view);

  const updated = view.lastPositionAt ?? view.firedAt;
  return page(
    'Live location · ตำแหน่งปัจจุบัน',
    `
    <div class="alert">
      <div class="kicker">Emergency alert · แจ้งเตือนฉุกเฉิน</div>
      <h1>${esc(view.name)}</h1>
      <p class="lead">
        triggered SOS in ChivaGo and is sharing their live location with you.<br>
        <span class="th">กดขอความช่วยเหลือและกำลังแชร์ตำแหน่งกับคุณ</span>
      </p>
    </div>

    <div class="card">
      <div class="kicker">Location · ตำแหน่ง</div>
      <div class="big">${esc(view.locationLabel)}</div>
      ${view.lat !== null && view.lng !== null
        ? `<div class="coords">${view.lat.toFixed(5)}, ${view.lng.toFixed(5)}</div>
           <a class="btn" href="${MAPS(view.lat, view.lng)}" target="_blank" rel="noopener noreferrer">
             Open in Maps · เปิดในแผนที่
           </a>`
        : `<div class="coords">Their phone has not been able to say where they are. · โทรศัพท์ยังบอกตำแหน่งไม่ได้</div>`}
      <p class="muted" data-updated="${esc(updated)}">
        Updated <time>${esc(new Date(updated).toLocaleString('en-GB'))}</time>.
        This page refreshes itself.<br>
        <span class="th">อัปเดตอัตโนมัติ</span>
      </p>
    </div>

    ${
      view.note
        ? `<div class="card"><div class="kicker">What they said · ข้อความ</div>
             <p class="big">${esc(view.note)}</p></div>`
        : ''
    }

    <div class="card">
      <div class="kicker">Status · สถานะ</div>
      ${
        view.acknowledgedBy
          ? `<p class="big">Picked up by ${esc(view.acknowledgedBy)}</p>
             <p class="th">เจ้าหน้าที่รับเรื่องแล้ว</p>`
          : `<p class="big">Not yet picked up</p>
             <p class="th">ยังไม่มีเจ้าหน้าที่รับเรื่อง</p>`
      }
    </div>

    <!--
      The most important block on the page. ChivaGo cannot send an ambulance;
      these numbers can. Placed above everything optional, in the accent, and
      never behind a tap.
    -->
    <div class="card urgent">
      <div class="kicker">If they need help now · หากต้องการความช่วยเหลือทันที</div>
      <p>ChivaGo cannot send an ambulance. Call Thailand's emergency services directly.</p>
      <p class="th">ChivaGo ไม่สามารถส่งรถพยาบาลได้ กรุณาโทรหาหน่วยฉุกเฉินโดยตรง</p>
      <div class="calls">
        <a class="call" href="tel:1669"><b>1669</b><span>Medical · เจ็บป่วยฉุกเฉิน</span></a>
        <a class="call" href="tel:1155"><b>1155</b><span>Tourist Police · ตำรวจท่องเที่ยว</span></a>
        <a class="call" href="tel:191"><b>191</b><span>Police · ตำรวจ</span></a>
      </div>
      <p class="muted">Nearest hospital · โรงพยาบาลใกล้ที่สุด: ${esc(view.nearestHospital)}</p>
    </div>
  `,
  );
}

function endedPage(view: PublicAlertView): string {
  const label = view.status === 'cancelled' ? 'stood down' : 'resolved';
  return page(
    'Alert ended · การแจ้งเตือนสิ้นสุด',
    `
    <div class="card">
      <div class="kicker">Alert ended · สิ้นสุดแล้ว</div>
      <h1>${esc(view.name)}'s alert was ${label}</h1>
      <p class="th">การแจ้งเตือนสิ้นสุดแล้ว</p>
      <!-- Position is withheld once the alert ends. The link existed to show
           where someone was during an emergency, not to follow them afterwards. -->
      <p class="muted">
        Location sharing has stopped.<br>
        <span class="th">หยุดแชร์ตำแหน่งแล้ว</span>
      </p>
    </div>
    <div class="card urgent">
      <p>If you still cannot reach them, call 1669 (medical) or 1155 (tourist police).</p>
      <p class="th">หากยังติดต่อไม่ได้ โทร 1669 หรือ 1155</p>
      <div class="calls">
        <a class="call" href="tel:1669"><b>1669</b><span>Medical</span></a>
        <a class="call" href="tel:1155"><b>1155</b><span>Tourist Police</span></a>
      </div>
    </div>
  `,
  );
}

function notFoundPage(): string {
  return page(
    'Link not found',
    `<div class="card">
       <h1>This link is not valid</h1>
       <p class="th">ลิงก์นี้ใช้ไม่ได้</p>
       <p class="muted">It may have expired, or the address may be mistyped.<br>
         <span class="th">อาจหมดอายุแล้วหรือพิมพ์ที่อยู่ผิด</span></p>
     </div>`,
  );
}

/**
 * The shell.
 *
 * Self-contained: inline CSS, no external stylesheet, no fonts, no analytics.
 * This page is opened in an emergency, sometimes on roaming data or a weak
 * connection, and every extra request is another chance for it not to load.
 */
function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- Never index a page that shows a person's live location. -->
<meta name="robots" content="noindex, nofollow, noarchive">
<!-- The URL IS the credential; do not let it leak through an outbound click. -->
<meta name="referrer" content="no-referrer">
<title>${esc(title)} · ChivaGo</title>
<style>
  :root { --ink:#201e1d; --bg:#f3f2f2; --accent:#ec3013; --accent-700:#ae1800;
          --n300:#d7d3d3; --n700:#605d5d; }
  *,*::before,*::after { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-size:16px; line-height:1.55;
         font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
         max-width:640px; margin:0 auto; padding:24px 20px 64px; }
  h1 { font-size:28px; line-height:1.15; margin:8px 0 6px; letter-spacing:-0.02em; }
  .kicker { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--n700); }
  .th { color:var(--n700); font-size:14px; line-height:1.7; }
  .lead { margin:6px 0 0; }
  .alert { border-left:6px solid var(--accent); padding:4px 0 4px 16px; margin-bottom:24px; }
  .card { border:2px solid var(--ink); padding:18px; margin-bottom:16px; background:var(--bg); }
  .card.urgent { border-color:var(--accent); }
  .big { font-size:22px; font-weight:700; margin:6px 0 2px; letter-spacing:-0.01em; }
  .coords { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:13px;
            color:var(--n700); margin-bottom:14px; }
  .btn { display:block; background:var(--accent); color:var(--bg); text-decoration:none;
         font-weight:700; padding:16px 18px; text-align:left; }
  .muted { color:var(--n700); font-size:13px; margin:14px 0 0; }
  .calls { display:flex; gap:10px; margin:16px 0 8px; flex-wrap:wrap; }
  .call { flex:1 1 30%; min-width:110px; border:2px solid var(--accent); text-decoration:none;
          color:var(--ink); padding:14px 10px; text-align:center; }
  .call b { display:block; font-size:24px; color:var(--accent-700); }
  .call span { font-size:11px; color:var(--n700); }
</style>
</head>
<body>
${body}
<p class="muted" style="margin-top:32px">
  Shared through ChivaGo. This page stops updating when the alert ends.<br>
  <span class="th">แชร์ผ่าน ChivaGo หน้านี้จะหยุดอัปเดตเมื่อการแจ้งเตือนสิ้นสุด</span>
</p>
<script>
  // Poll rather than push: a family member on roaming data in another country
  // is exactly who cannot hold a websocket open. 15s is often enough to follow
  // someone moving, cheap enough not to drain their battery.
  setTimeout(function () { location.reload(); }, 15000);
</script>
</body>
</html>`;
}
