/**
 * The duty desk: live SOS alerts for whoever is watching.
 *
 * This screen is only worth anything if a human is in front of it. The software
 * can put an alert here in under a second; it cannot make someone look. That is
 * an operational commitment, not an engineering one, and the page says so.
 */

import { html, layout, type Raw } from './html.ts';
import { formatDateTime, formatWaiting, type Locale } from './i18n.ts';
import type { SosAlertRecord } from '../sos-service.ts';
import type { EscalationRecord } from '../escalation-service.ts';
import { hasGoneQuiet, type TrailSummary } from '../position-service.ts';

const minutesSince = (iso: string): number => (Date.now() - new Date(iso).getTime()) / 60_000;

const mapsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

function trailBlock(summary: TrailSummary, locale: Locale): Raw {
  if (summary.points === 0) {
    return html`<div class="muted" style="margin-top:12px">No movement recorded yet.</div>`;
  }
  const quiet = hasGoneQuiet(summary);
  const minutes = Math.floor((summary.silentForSeconds ?? 0) / 60);
  return html`
    <div style="margin-top:14px">
      <div class="kicker">Movement · การเคลื่อนที่</div>
      <div class="check">
        <span class="dot ${quiet ? 'warn' : 'pass'}"></span>
        <div>
          <strong style="font-size:14px">
            ${
              quiet
                ? `No signal for ${minutes} min`
                : `Updating · last fix ${summary.silentForSeconds}s ago`
            }
          </strong>
          <div class="muted">
            ${summary.points} fixes ·
            ${summary.travelledM} m travelled ·
            ${summary.netDisplacementM} m from where they started
            ${summary.lastSource ? ` · via ${summary.lastSource}` : ''}
          </div>
          ${
            quiet
              ? html`<div class="muted" style="color:var(--color-accent-700)">
                  The phone has stopped reporting. The pin is where they were, not
                  necessarily where they are.
                </div>`
              : ''
          }
        </div>
      </div>
    </div>
  `;
}

function alertCard(
  alert: SosAlertRecord,
  escalations: EscalationRecord[],
  summary: TrailSummary,
  locale: Locale,
): Raw {
  const waiting = minutesSince(alert.firedAt);
  const unacknowledged = alert.status === 'dispatching';
  const escalated = escalations.length > 0 && unacknowledged;
  return html`
    <div class="card ${escalated ? 'escalated' : unacknowledged ? 'urgent' : ''}">
      ${
        escalated
          ? html`<div class="escbar">
              ESCALATED · ${escalations.length} rung${escalations.length === 1 ? '' : 's'} fired —
              the traveller has been told nobody answered
            </div>`
          : ''
      }
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
        <div>
          <div class="kicker">
            ${unacknowledged ? 'NOT YET PICKED UP · ยังไม่มีผู้รับเรื่อง' : `Picked up by ${alert.acknowledgedBy}`}
          </div>
          <h3 style="margin:6px 0 2px">${alert.locationLabel}</h3>
          <div class="muted">
            ${alert.lat.toFixed(5)}, ${alert.lng.toFixed(5)} ·
            fired ${formatWaiting(waiting / 60, locale)}
            ${alert.lastPositionAt ? html` · moved ${formatDateTime(alert.lastPositionAt, locale)}` : ''}
          </div>
        </div>
        <div style="text-align:right">
          <div class="stat" style="font-size:22px;${unacknowledged ? 'color:var(--color-accent-700)' : ''}">
            ${Math.round(waiting)} min
          </div>
          <div class="kicker">since fired</div>
        </div>
      </div>

      ${alert.note ? html`<p style="margin-top:12px"><strong>${alert.note}</strong></p>` : ''}

      ${trailBlock(summary, locale)}

      ${
        escalations.length > 0
          ? html`<div style="margin-top:14px">
              <div class="kicker">Escalation · การยกระดับ</div>
              ${escalations.map(
                (e) => html`
                  <div class="check">
                    <span class="dot warn"></span>
                    <div>
                      <strong style="font-size:14px">${e.rung}</strong>
                      <div class="muted">
                        ${formatDateTime(e.firedAt, locale)}${e.detail ? ` — ${e.detail}` : ''}
                      </div>
                    </div>
                  </div>
                `,
              )}
            </div>`
          : ''
      }

      <div style="margin-top:14px">
        <div class="kicker">Delivery · การส่งต่อ</div>
        ${alert.dispatches.map(
          (d) => html`
            <div class="check">
              <span class="dot ${d.status === 'delivered' ? 'pass' : d.status === 'unavailable' ? 'unknown' : 'warn'}"></span>
              <div>
                <strong style="font-size:14px">${d.targetLabel}</strong>
                <div class="muted">${d.channel} · ${d.status}${d.detail ? ` — ${d.detail}` : ''}</div>
              </div>
            </div>
          `,
        )}
      </div>

      <div class="actions" style="margin-top:16px">
        <a class="btn btn-secondary" style="padding:10px 16px;text-decoration:none"
           href="${mapsUrl(alert.lat, alert.lng)}" target="_blank" rel="noopener noreferrer">
          Open in Maps
        </a>
        <a class="btn btn-secondary" style="padding:10px 16px;text-decoration:none"
           href="${alert.shareUrl}" target="_blank" rel="noopener noreferrer">
          Live page
        </a>
        ${
          unacknowledged
            ? html`<form method="post" action="/console/sos/${alert.id}/acknowledge">
                 <button class="btn btn-primary" type="submit" style="padding:10px 18px">
                   I have this — tell them
                 </button>
               </form>`
            : html`<form method="post" action="/console/sos/${alert.id}/resolve">
                 <button class="btn btn-secondary" type="submit" style="padding:10px 18px">
                   Close alert
                 </button>
               </form>`
        }
      </div>
    </div>
  `;
}

export function sosDeskPage(
  locale: Locale,
  hostName: string,
  reviewer: string | null,
  live: SosAlertRecord[],
  recent: SosAlertRecord[],
  escalations: Record<string, EscalationRecord[]> = {},
  trails: Record<string, TrailSummary> = {},
  canModerate = false,
): string {
  const unacknowledged = live.filter((a) => a.status === 'dispatching').length;
  const escalatedCount = live.filter(
    (a) => a.status === 'dispatching' && (escalations[a.id]?.length ?? 0) > 0,
  ).length;
  const body = html`
    <style>
      .card.urgent { border-color: var(--color-accent); border-width: 3px; }
      .card.escalated { border-color: var(--color-accent); border-width: 4px; }
      .escbar { background: var(--color-accent); color: var(--color-bg);
                margin: -18px -18px 16px; padding: 10px 18px;
                font-weight: 800; font-size: 12px; letter-spacing: .06em;
                text-transform: uppercase; }
      .desk-banner { background: var(--color-accent); color: var(--color-bg);
                     padding: 14px 18px; margin-bottom: 20px; }
      .desk-quiet { border: 2px solid var(--color-divider); padding: 14px 18px;
                    margin-bottom: 20px; color: var(--color-neutral-700); }
    </style>

    ${
      unacknowledged > 0
        ? html`<div class="desk-banner">
            <strong style="font-size:18px">
              ${unacknowledged} alert${unacknowledged === 1 ? '' : 's'} not yet picked up
              ${escalatedCount > 0 ? html` · ${escalatedCount} ESCALATED` : ''}
            </strong>
            <div style="opacity:.9;margin-top:4px">ยังไม่มีผู้รับเรื่อง</div>
          </div>`
        : html`<div class="desk-quiet">
            No unacknowledged alerts · ไม่มีเรื่องค้าง
          </div>`
    }

    <h3>Live alerts</h3>
    ${
      live.length === 0
        ? html`<p class="muted">Nothing active right now.</p>`
        : live.map((a) =>
            alertCard(
              a,
              escalations[a.id] ?? [],
              trails[a.id] ?? {
                points: 0, netDisplacementM: 0, travelledM: 0,
                silentForSeconds: null, lastSource: null, movingAwayFromStart: false,
              },
              locale,
            ),
          )
    }

    <!--
      Stated on the screen, not just in the docs. An operator who believes this
      page dispatches an ambulance will act too slowly.
    -->
    <div class="card" style="margin-top:24px">
      <div class="kicker" style="color:var(--color-accent-700)">What this desk is, and is not</div>
      <p style="margin-top:8px">
        ChivaGo <strong>cannot dispatch emergency services</strong>. Acknowledging an alert
        tells the traveller a named person has seen it and has their live location —
        nothing more. If anyone is hurt, call <strong>1669</strong> (medical) or
        <strong>1155</strong> (tourist police) yourself.
      </p>
      <p class="muted">
        ChivaGo ไม่สามารถส่งหน่วยฉุกเฉินได้ การรับเรื่องเป็นการแจ้งนักท่องเที่ยวว่ามีคนเห็นและ
        ทราบตำแหน่งแล้วเท่านั้น หากมีผู้บาดเจ็บ กรุณาโทร 1669 หรือ 1155 ด้วยตนเอง
      </p>
    </div>

    ${
      recent.length > 0
        ? html`
            <h4 style="margin-top:32px">Recent</h4>
            <table class="table" style="width:100%">
              <thead>
                <tr><th>When</th><th>Where</th><th>Status</th><th>Picked up by</th></tr>
              </thead>
              <tbody>
                ${recent.map(
                  (a) => html`
                    <tr>
                      <td>${formatDateTime(a.firedAt, locale)}</td>
                      <td>${a.locationLabel}</td>
                      <td>${a.status}</td>
                      <td>${a.acknowledgedBy ?? '—'}</td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          `
        : ''
    }

    <script>
      // The desk reloads itself. An operator watching a static page would not
      // see a new alert until they happened to click something.
      setTimeout(function () { location.reload(); }, 20000);
    </script>
  `;
  return layout(
    {
      title: 'SOS desk', locale, hostName, reviewer, signedIn: true,
      path: '/console/sos', canModerate,
    },
    body,
  );
}
