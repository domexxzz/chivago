/**
 * Console page bodies.
 *
 * Every page takes a `Locale`. Nothing here holds a hard-coded user-facing
 * string - all copy comes from i18n.ts, and everything a VOLUNTEER will read
 * (the rejection reasons) comes from @chivago/core so it stays with the app copy.
 */

import { REJECTION_REASONS, REJECTION_REASON_KEYS } from '@chivago/core';
import { esc, html, layout, type Raw } from './html.ts';
import {
  formatDateTime, formatNumber, formatWaiting, t, tf, type Locale,
} from './i18n.ts';
import type { DecidedItem, ReviewCheck, ReviewItem } from '../review-service.ts';

/** Check labels are localised here; the detail sentence stays as the service wrote it. */
const CHECK_LABEL: Record<string, Parameters<typeof t>[0]> = {
  geotag: 'checkPhotoLocation',
  timing: 'checkCaptureTime',
  weight: 'checkWeight',
};

// ---------------------------------------------------------------------------

export function loginPage(locale: Locale, error?: boolean): string {
  const tr = (k: Parameters<typeof t>[0]) => t(k, locale);
  return layout(
    { title: tr('signIn'), locale, path: '/console/login' },
    html`
      <h3>${tr('signInTitle')}</h3>
      <p class="muted" style="max-width:56ch">${tr('signInBlurb')}</p>
      ${
        error
          ? html`<p style="color:var(--color-accent-700)"><strong>${tr('signInFailed')}</strong></p>`
          : ''
      }
      <form method="post" action="/console/login" style="max-width:420px;margin-top:24px">
        <div class="field">
          <label for="reviewer">${tr('yourName')}</label>
          <input class="input" type="text" id="reviewer" name="reviewer"
                 autocomplete="name" required style="width:100%">
        </div>
        <div class="field" style="margin-top:16px">
          <label for="key">${tr('accessKey')}</label>
          <input class="input" type="password" id="key" name="key"
                 placeholder="chv_XXXXX-XXXXX-XXXXX-XXXXX" autocomplete="off"
                 required style="width:100%" dir="ltr">
        </div>
        <button class="btn btn-primary btn-block" type="submit" style="margin-top:20px">
          ${tr('signIn')}
        </button>
      </form>
    `,
  );
}

// ---------------------------------------------------------------------------

function checkRow(check: ReviewCheck, locale: Locale): Raw {
  const label = CHECK_LABEL[check.key];
  return html`
    <div class="check">
      <span class="dot ${check.status}"></span>
      <div>
        <strong style="font-size:14px">${label ? t(label, locale) : check.key}</strong>
        <div class="muted">${tf(check.detailKey, locale, check.params)}</div>
      </div>
    </div>
  `;
}

export function queuePage(
  locale: Locale,
  hostName: string,
  reviewer: string | null,
  items: ReviewItem[],
  stats: { pending: number; overdue: number; oldestHours: number },
  canModerate = false,
): string {
  const tr = (k: Parameters<typeof t>[0]) => t(k, locale);
  const body = html`
    <div class="grid">
      <div>
        <div class="stat">${formatNumber(stats.pending, locale)}</div>
        <div class="kicker">${tr('awaitingReview')}</div>
      </div>
      <div>
        <div class="stat" style="color:${stats.overdue > 0 ? 'var(--color-accent-700)' : 'inherit'}">
          ${formatNumber(stats.overdue, locale)}
        </div>
        <div class="kicker">${tr('pastSla')}</div>
      </div>
      <div>
        <div class="stat">${formatNumber(stats.oldestHours, locale)}h</div>
        <div class="kicker">${tr('oldestWaiting')}</div>
      </div>
    </div>

    ${
      items.length === 0
        ? html`<div class="empty">
            <h4>${tr('nothingToReview')}</h4>
    <p><button id="notify-me" type="button" class="btn" style="min-height:44px">${tr('notifyMe')}</button></p>
            <p class="muted">${tr('nothingToReviewBlurb')}</p>
          </div>`
        : items.map(
            (item) => html`
              <div class="row">
                <div class="code" dir="ltr">${item.questCode}</div>
                <div style="flex:1">
                  <a href="/console/proof/${item.proofId}"
                     style="font-weight:800;font-size:17px;text-decoration:none">
                    ${item.questName}
                  </a>
                  <div class="muted" style="margin-top:4px">
                    ${item.questWhere} ·
                    ${formatNumber(item.photos.length, locale)}
                    ${item.photos.length === 1 ? tr('photo') : tr('photos')}${
                      item.weightKg !== null ? ` · ${formatNumber(item.weightKg, locale)} kg` : ''
                    }
                  </div>
                  <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                    <span class="badge ${item.overdue ? 'badge-overdue' : 'badge-ok'}">
                      ${formatWaiting(item.waitingHours, locale)}
                    </span>
                    ${item.checks
                      .filter((c) => c.status === 'fail' || c.status === 'warn')
                      .map((c) => {
                        const label = CHECK_LABEL[c.key];
                        return html`<span class="badge badge-ok"
                          style="border-color:var(--color-accent);color:var(--color-accent-700)"
                          >${label ? t(label, locale) : c.key}</span>`;
                      })}
                    ${
                      item.priorRejections > 0
                        ? html`<span class="badge badge-ok"
                            >${formatNumber(item.priorRejections, locale)} ${tr('priorRejections')}</span>`
                        : ''
                    }
                  </div>
                </div>
                <div style="text-align:right">
                  <div class="stat" style="font-size:22px;color:var(--color-accent-700)" dir="ltr">
                    +${formatNumber(item.rewardPoints, locale)}
                  </div>
                </div>
              </div>
            `,
          )
    }
  `;
  return layout(
    {
      title: tr('queue'), locale, hostName, reviewer,
      signedIn: true, activeNav: 'queue', pendingCount: stats.pending, path: '/console',
      canModerate,
    },
    body,
  );
}

// ---------------------------------------------------------------------------

export function detailPage(
  locale: Locale,
  hostName: string,
  reviewer: string | null,
  item: ReviewItem,
  pendingCount: number,
  csrf: string,
  canModerate = false,
): string {
  const tr = (k: Parameters<typeof t>[0]) => t(k, locale);
  const body = html`
    <p><a href="/console">&larr; ${tr('backToQueue')}</a></p>

    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;flex-wrap:wrap">
      <div>
        <div class="kicker">${tr('quest')} · <span dir="ltr">${item.questCode}</span></div>
        <h3 style="margin-top:6px">${item.questName}</h3>
        <p class="muted">
          ${item.questWhere} · ${tr('fence')} ${formatNumber(item.geofenceRadiusM, locale)} m
        </p>
      </div>
      <div style="text-align:right">
        <div class="stat" style="color:var(--color-accent-700)" dir="ltr">
          +${formatNumber(item.rewardPoints, locale)}
        </div>
        <div class="kicker">${tr('pointsAtStake')}</div>
      </div>
    </div>

    <div class="grid" style="margin-top:16px">
      <div>
        <div class="kicker">${tr('submitted')}</div>
        <div style="font-weight:800;font-size:15px;margin-top:4px">
          ${formatWaiting(item.waitingHours, locale)}
        </div>
        <div class="muted">${formatDateTime(item.submittedAt, locale)}</div>
      </div>
      <div>
        <div class="kicker">${tr('volunteer')}</div>
        <div style="font-weight:800;font-size:15px;margin-top:4px" dir="ltr">${item.userId}</div>
        <div class="muted">
          ${formatNumber(item.priorApprovals, locale)} ${tr('approvedCount')} ·
          ${formatNumber(item.priorRejections, locale)} ${tr('rejectedCount')} ${tr('withYou')}
        </div>
      </div>
      <div>
        <div class="kicker">${tr('weightLogged')}</div>
        <div style="font-weight:800;font-size:15px;margin-top:4px">
          ${item.weightKg !== null ? `${formatNumber(item.weightKg, locale)} kg` : tr('none')}
        </div>
      </div>
    </div>
    ${item.partyPresent.length > 0 ? html`
    <div class="grid" style="margin-top:0;border-top:0;grid-template-columns:1fr">
      <div>
        <div class="kicker">${tr('partyPresent')} · ${formatNumber(item.partyPresent.length, locale)}</div>
        <div style="font-weight:800;font-size:15px;margin-top:4px">${item.partyPresent.map((n) => esc(n)).join(' · ')}</div>
        <div class="muted">${tr('partyPaysAll')}</div>
      </div>
    </div>` : ''}

    <h4 style="margin-top:32px">${tr('photosHeading')}</h4>
    ${
      item.photos.length === 0
        ? html`<p class="muted">${tr('noPhotos')}</p>`
        : html`<div class="photos">
            ${item.photos.map(
              (p) => html`
                <figure class="photo">
                  <img src="${p.url}" alt="${tr('photosHeading')} — ${item.questName}" loading="lazy">
                  <figcaption>
                    ${
                      p.distanceM !== null
                        ? `${formatNumber(Math.round(p.distanceM), locale)} m ${tr('fromSite')}`
                        : tr('noLocation')
                    }
                    ${p.takenAt ? ` · ${formatDateTime(p.takenAt, locale)}` : ''}
                  </figcaption>
                </figure>
              `,
            )}
          </div>`
    }

    <h4 style="margin-top:32px">${tr('automaticChecks')}</h4>
    <p class="muted" style="max-width:64ch">${tr('checksBlurb')}</p>
    ${item.checks.map((c) => checkRow(c, locale))}

    <h4 style="margin-top:32px">${tr('decision')}</h4>
    <form method="post" action="/console/decide">
      <input type="hidden" name="csrf" value="${csrf}">
      <input type="hidden" name="proofId" value="${item.proofId}">

      <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
        <label for="reason" class="kicker">${tr('reasonIfRejecting')}</label>
        <select id="reason" name="reason">
          <option value="">${tr('selectPlaceholder')}</option>
          ${
            // Rendered in the REVIEWER's language, stored as a KEY, and shown to
            // the volunteer in theirs. See REJECTION_REASONS in core.
            REJECTION_REASON_KEYS.map(
              (key) => html`<option value="${key}">${REJECTION_REASONS[key][locale]}</option>`,
            )
          }
        </select>
      </div>

      <label for="note" class="kicker">${tr('noteToVolunteer')}</label>
      <textarea id="note" name="note" maxlength="500"
        placeholder="${tr('notePlaceholder')}"></textarea>
      <p class="muted" style="margin-top:6px;max-width:64ch">${tr('noteNotTranslated')}</p>

      <div class="actions">
        <button class="btn btn-primary" type="submit" name="decision" value="approve"
          style="padding:12px 20px">
          ${tr('approveAndRelease')} <span dir="ltr">+${formatNumber(item.rewardPoints, locale)}</span>
        </button>
        <button class="btn danger" type="submit" name="decision" value="reject"
          style="padding:12px 20px">
          ${tr('reject')}
        </button>
      </div>
      <p class="muted" style="margin-top:12px">
        ${tr('approveWarning')} ${esc(hostName)}. ${tr('cannotUndo')}
      </p>
    </form>
  `;
  return layout(
    {
      title: item.questName, locale, hostName, reviewer,
      signedIn: true, activeNav: 'queue', pendingCount,
      path: `/console/proof/${item.proofId}`,
      canModerate,
    },
    body,
  );
}

// ---------------------------------------------------------------------------

export function historyPage(
  locale: Locale,
  hostName: string,
  reviewer: string | null,
  decisions: DecidedItem[],
  pendingCount: number,
  canModerate = false,
): string {
  const tr = (k: Parameters<typeof t>[0]) => t(k, locale);
  const body = html`
    <h3>${tr('recentDecisions')}</h3>
    <p class="muted">${tr('recentDecisionsBlurb')}</p>
    ${
      decisions.length === 0
        ? html`<div class="empty"><p class="muted">${tr('noDecisions')}</p></div>`
        : html`<table class="table" style="width:100%;margin-top:16px">
            <thead>
              <tr>
                <th>${tr('colQuest')}</th><th>${tr('colVolunteer')}</th>
                <th>${tr('colDecision')}</th><th>${tr('colReviewer')}</th><th>${tr('colWhen')}</th>
              </tr>
            </thead>
            <tbody>
              ${decisions.map(
                (d) => html`
                  <tr>
                    <td>${d.questName}</td>
                    <td dir="ltr">${d.userId}</td>
                    <td style="color:${d.approved ? 'var(--color-accent-700)' : 'var(--color-neutral-600)'}">
                      ${
                        d.approved
                          ? html`${tr('approved')} <span dir="ltr">+${formatNumber(d.rewardPoints, locale)}</span>`
                          : tr('rejected')
                      }
                      ${
                        // The stored reason is a KEY, so it renders in the
                        // reviewer's language here and in the volunteer's in the app.
                        d.reasonKey
                          ? html`<div class="muted">${REJECTION_REASONS[d.reasonKey][locale]}</div>`
                          : ''
                      }
                      ${d.reviewNote ? html`<div class="muted">${d.reviewNote}</div>` : ''}
                    </td>
                    <td>${d.reviewedBy ?? '—'}</td>
                    <td>${formatDateTime(d.reviewedAt, locale)}</td>
                  </tr>
                `,
              )}
            </tbody>
          </table>`
    }
  `;
  return layout(
    {
      title: tr('history'), locale, hostName, reviewer,
      signedIn: true, activeNav: 'history', pendingCount, path: '/console/history',
      canModerate,
    },
    body,
  );
}

export function messagePage(
  locale: Locale,
  titleKey: Parameters<typeof t>[0],
  messageKey: Parameters<typeof t>[0],
  backHref = '/console',
): string {
  return layout(
    { title: t(titleKey, locale), locale, path: backHref },
    html`<h3>${t(titleKey, locale)}</h3>
      <p class="muted">${t(messageKey, locale)}</p>
      <p><a href="${backHref}">${t('back', locale)}</a></p>`,
  );
}
