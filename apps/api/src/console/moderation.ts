/**
 * The review moderation desk.
 *
 * Reachable only by a host whose row carries `role = 'moderator'`. The proof
 * queue is host-scoped because the host is the party vouching for the work;
 * reviews are about PLACES, which no host owns, so scoping cannot decide this.
 * Letting any console holder hide any review would hand a hotel partner the
 * ability to bury a bad review of the beach beside a competitor.
 *
 * The page states the limits of its own claim at the top, on purpose. A
 * moderator who believes "verified" means "true" will under-moderate.
 */

import {
  MODERATION_REASONS, MODERATION_REASON_KEYS, REPORT_REASONS,
} from '@chivago/core';
import { esc, html, layout, type Raw } from './html.ts';
import { formatDateTime, t, tf, type Locale } from './i18n.ts';
import type {
  LogEntry, ModerationFilter, ModerationItem, ReviewReport,
} from '../place-review-service.ts';
import type { ModeratorWatch } from '../moderator-watch.ts';
import type { BatchPreviewRow, ReviewBatch } from '../batch-service.ts';

const FILTERS: { key: ModerationFilter; label: Parameters<typeof t>[0] }[] = [
  { key: 'appeals', label: 'filterAppeals' },
  { key: 'reported', label: 'filterReported' },
  { key: 'low', label: 'filterLow' },
  { key: 'visible', label: 'filterVisible' },
  { key: 'hidden', label: 'filterHidden' },
  { key: 'all', label: 'filterAll' },
];

export function moderationPage(
  locale: Locale,
  hostName: string,
  reviewer: string | null,
  items: ModerationItem[],
  counts: Record<ModerationFilter, number>,
  active: ModerationFilter,
  csrf: string,
  pendingCount: number,
  flaggedModerators = 0,
  awaitingApproval = 0,
): string {
  const tr = (k: Parameters<typeof t>[0]) => t(k, locale);

  return layout(
    {
      title: tr('moderationTitle'),
      locale, hostName, reviewer, signedIn: true,
      activeNav: 'moderation', pendingCount,
      // Anyone rendering THIS page is a moderator by definition. Without it
      // the active tab vanishes on its own page, which reads as the nav
      // losing track of where you are.
      canModerate: true,
      path: `/console/reviews?filter=${active}`,
    },
    html`
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:16px">
        <h3>${tr('moderationTitle')}</h3>
        <span>
          ${awaitingApproval > 0
            ? html`<a href="/console/reviews/batches"
                   style="color:var(--color-accent-700);font-weight:600">
                 ${tr('filterBatches')} · ${awaitingApproval}</a> · `
            : html`<a href="/console/reviews/batches">${tr('filterBatches')}</a> · `}
        <a href="/console/reviews/log"
           style="${flaggedModerators > 0 ? 'color:var(--color-accent-700);font-weight:600' : ''}">
          ${tr('auditLog')}${flaggedModerators > 0
            ? ` · ${tf('flaggedCount', locale, { n: String(flaggedModerators) })}`
            : ''}
        </a>
        </span>
      </div>
      <p class="muted" style="max-width:72ch">${tr('moderationBlurb')}</p>

      <nav class="nav" style="margin-top:18px;flex-wrap:wrap">
        ${FILTERS.map(
          (f) => html`<a href="/console/reviews?filter=${f.key}"
             class="${f.key === active ? 'on' : ''}">${tr(f.label)} · ${counts[f.key]}</a>`,
        )}
      </nav>

      ${active === 'low' ? html`<p class="muted" style="margin-top:12px;max-width:72ch">
        ${tr('lowLensBlurb')}</p>` : ''}
      ${active === 'reported' ? html`<p class="muted" style="margin-top:12px;max-width:72ch">
        ${tr('reportsBlurb')}</p>` : ''}
      ${active === 'appeals' ? html`<p class="muted" style="margin-top:12px;max-width:72ch">
        ${tr('appealsBlurb')}</p>` : ''}

      ${
        items.length === 0
          ? html`<p style="margin-top:32px"><strong>${tr('nothingToModerate')}</strong></p>`
          : html`
              <form method="post" action="/console/reviews/batches/propose">
                <input type="hidden" name="csrf" value="${csrf}">
                ${items.map((item) => reviewCard(item, locale, csrf))}
                ${batchBar(locale)}
              </form>
            `
      }
    `,
  );
}

function reviewCard(item: ModerationItem, locale: Locale, csrf: string): Raw {
  const tr = (k: Parameters<typeof t>[0]) => t(k, locale);
  const hidden = item.hiddenAt !== null;

  return html`
    <article style="border:2px solid var(--color-text);padding:18px;margin-top:18px;
                    ${hidden ? 'opacity:.72;border-color:var(--color-neutral-400)' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:16px">
        <div>
          <span class="kicker">${tr('reviewOf')}</span>
          <h4 style="margin:2px 0 0">${item.placeName}</h4>
        </div>
        <div style="text-align:right">
          <div class="stat" style="font-size:22px">${item.rating} / 5</div>
          ${hidden
            ? ''
            : html`<label style="font-size:11px;display:block;margin-top:6px">
                <input type="checkbox" name="reviewId" value="${item.id}">
                ${t('batchSelected', locale)}</label>`}
        </div>
      </div>

      <p class="muted" style="margin-top:8px;font-size:12px">
        ${tr('visitedOn')} ${formatDateTime(item.visitedAt, locale)}
        · ${tr('writtenOn')} ${formatDateTime(item.createdAt, locale)}
        · ${tr('writtenIn')} ${item.language.toUpperCase()}
      </p>

      ${
        item.body
          ? html`<p style="margin-top:12px;white-space:pre-wrap">${item.body}</p>`
          : html`<p class="muted" style="margin-top:12px"><em>${tr('none')}</em></p>`
      }

      ${item.appeal ? appealBlock(item, locale, csrf) : ''}
      ${item.reports.length > 0 ? reportsBlock(item, locale, csrf) : ''}
      ${hidden ? hiddenBanner(item, locale, csrf) : takeDownForm(item, locale, csrf)}
    </article>
  `;
}

function hiddenBanner(item: ModerationItem, locale: Locale, csrf: string): Raw {
  const tr = (k: Parameters<typeof t>[0]) => t(k, locale);
  const reason = item.hiddenReasonKey ? MODERATION_REASONS[item.hiddenReasonKey][locale] : null;

  return html`
    <div style="border-top:1px solid var(--color-neutral-300);margin-top:16px;padding-top:14px">
      <p style="font-size:13px">
        <strong>${tr('takenDownBy')} ${item.hiddenBy ?? '—'}</strong>
        ${item.hiddenAt ? ` · ${formatDateTime(item.hiddenAt, locale)}` : ''}
      </p>
      ${reason ? html`<p style="margin-top:4px;font-size:13px">${reason}</p>` : ''}
      ${
        item.hiddenNote
          ? html`<p class="muted" style="margin-top:4px;font-size:12px">${item.hiddenNote}</p>`
          : ''
      }
      <form method="post" action="/console/reviews/${item.id}/restore" style="margin-top:12px">
        <input type="hidden" name="csrf" value="${csrf}">
        <button class="btn" type="submit">${tr('restoreCta')}</button>
      </form>
    </div>
  `;
}

/**
 * The take-down control.
 *
 * The reason is a REQUIRED select, not a free-text box. It is keyed so the
 * author reads it in their own language, and the two notes under the form say
 * what actually follows from pressing the button - that the author is told,
 * and that their points stay. A moderator who does not know those two things
 * will hesitate over the wrong decisions.
 */
function takeDownForm(item: ModerationItem, locale: Locale, csrf: string): Raw {
  const tr = (k: Parameters<typeof t>[0]) => t(k, locale);

  return html`
    <details style="margin-top:16px;border-top:1px solid var(--color-neutral-300);padding-top:14px">
      <summary style="cursor:pointer;font-weight:600;font-size:13px">${tr('takeDown')}</summary>
      <form method="post" action="/console/reviews/${item.id}/hide" style="margin-top:14px">
        <input type="hidden" name="csrf" value="${csrf}">

        <div class="field">
          <label for="reason-${item.id}">${tr('takeDownReason')}</label>
          <select class="input" id="reason-${item.id}" name="reason" required
                  style="width:100%;max-width:520px">
            <option value="">—</option>
            ${MODERATION_REASON_KEYS.map(
              (key) => html`<option value="${key}">${MODERATION_REASONS[key][locale]}</option>`,
            )}
          </select>
        </div>

        <div class="field" style="margin-top:14px">
          <label for="note-${item.id}">${tr('takeDownNote')}</label>
          <input class="input" type="text" id="note-${item.id}" name="note"
                 maxlength="500" style="width:100%;max-width:520px">
        </div>

        <p class="muted" style="margin-top:12px;font-size:12px;max-width:64ch">
          ${tr('authorIsTold')}
        </p>
        <p class="muted" style="margin-top:6px;font-size:12px;max-width:64ch">
          ${tr('pointsKept')}
        </p>

        <button class="btn btn-primary" type="submit" style="margin-top:14px">
          ${tr('takeDownCta')}
        </button>
      </form>
    </details>
  `;
}

/**
 * What readers reported, and the third outcome.
 *
 * Sits ABOVE the take-down form on purpose: a moderator should read why humans
 * flagged this before reaching the control that removes it.
 *
 * "Looked at it, it is fine" is not a courtesy. A desk without it leaves only
 * hide or ignore, and ignoring means the row stays at the top of the queue
 * until somebody hides it to make it go away.
 */
function reportsBlock(item: ModerationItem, locale: Locale, csrf: string): Raw {
  const tr = (k: Parameters<typeof t>[0]) => t(k, locale);

  return html`
    <div style="border:2px solid var(--color-accent);padding:14px;margin-top:16px">
      <p class="kicker" style="color:var(--color-accent-700)">
        ${tr('reportedBy')} · ${item.reports.length}
      </p>
      ${item.reports.map(
        (report) => html`
          <div style="margin-top:10px;padding-top:10px;
                      border-top:1px solid var(--color-neutral-300)">
            <p style="font-size:13px"><strong>${REPORT_REASONS[report.reasonKey][locale]}</strong>
              <span class="muted"> · ${formatDateTime(report.createdAt, locale)}</span></p>
            ${reporterLine(report, locale)}
            ${
              report.note
                ? html`<p class="muted" style="margin-top:4px;font-size:12px">
                    ${tr('reportedNote')}: ${report.note}</p>`
                : ''
            }
          </div>
        `,
      )}
      <form method="post" action="/console/reviews/${item.id}/dismiss" style="margin-top:14px">
        <input type="hidden" name="csrf" value="${csrf}">
        <button class="btn" type="submit">${tr('dismissReports')}</button>
      </form>
    </div>
  `;
}

/**
 * How reliable this reporter has been.
 *
 * Aggregate counts only, never a name and never a list of what they flagged. A
 * moderator weighing a report needs to know whether this reader is usually
 * right, and a reader whose reports are always dismissed is itself a signal.
 * Anything more identifying would be surveillance dressed as moderation.
 *
 * A first-time reporter is said so explicitly rather than shown "1 · 0 · 0",
 * which reads as a bad record when it is no record at all.
 */
function reporterLine(report: ReviewReport, locale: Locale): Raw {
  const record = report.record;
  if (!record) return html``;
  if (record.filed <= 1) {
    return html`<p class="muted" style="margin-top:2px;font-size:11px">
      ${t('firstReport', locale)}</p>`;
  }
  return html`<p class="muted" style="margin-top:2px;font-size:11px">
    ${t('reporterRecord', locale)}:
    ${tf('reporterRecordDetail', locale, {
      filed: String(record.filed),
      upheld: String(record.upheld),
      dismissed: String(record.dismissed),
    })}
  </p>`;
}

/**
 * An appeal, above everything else on the card.
 *
 * The author is answering a decision we made. That outranks a reader flagging
 * somebody else's words, so it sits at the top and is bordered like the report
 * block rather than tucked into a detail.
 *
 * There is no Uphold button: upholding is Restore, which already exists below.
 * Two controls that both restore would be two chances to forget one of them.
 */
function appealBlock(item: ModerationItem, locale: Locale, csrf: string): Raw {
  const tr = (k: Parameters<typeof t>[0]) => t(k, locale);
  const appeal = item.appeal!;

  return html`
    <div style="border:2px solid var(--color-text);padding:14px;margin-top:16px">
      <p class="kicker">${tr('appealHeading')}
        <span class="muted"> · ${formatDateTime(appeal.createdAt, locale)}</span></p>
      <p style="margin-top:8px;white-space:pre-wrap">${appeal.message}</p>
      <p class="muted" style="margin-top:10px;font-size:12px">${tr('appealRestoreHint')}</p>
      <form method="post" action="/console/reviews/${item.id}/appeal/decline"
            style="margin-top:12px">
        <input type="hidden" name="csrf" value="${csrf}">
        <button class="btn" type="submit">${tr('appealDecline')}</button>
      </form>
    </div>
  `;
}

const ACTION_LABEL: Record<string, Parameters<typeof t>[0]> = {
  hide: 'actionHide',
  restore: 'actionRestore',
  dismiss: 'actionDismiss',
  appeal_declined: 'actionAppealDeclined',
};

/**
 * The audit log.
 *
 * Separate from the queue because it answers a different question: not "what
 * needs deciding" but "what has been decided, by whom". A moderation desk with
 * no such page cannot answer a complaint about a moderator.
 */
export function auditLogPage(
  locale: Locale,
  hostName: string,
  reviewer: string | null,
  entries: LogEntry[],
  pendingCount: number,
  watch: ModeratorWatch[] = [],
  active: { moderator?: string; action?: string } = {},
): string {
  const tr = (k: Parameters<typeof t>[0]) => t(k, locale);
  return layout(
    {
      title: tr('auditLog'),
      locale, hostName, reviewer, signedIn: true,
      activeNav: 'moderation', pendingCount, canModerate: true,
      path: '/console/reviews/log',
    },
    html`
      <p><a href="/console/reviews">&larr; ${tr('moderationTitle')}</a></p>
      <h3>${tr('auditLog')}</h3>
      <p class="muted" style="max-width:72ch">${tr('auditBlurb')}</p>

      ${watchBlock(watch, locale, active)}

      ${
        entries.length === 0
          ? html`<p style="margin-top:28px"><strong>${tr('nothingLogged')}</strong></p>`
          : entries.map(
              (e) => html`
                <div class="row">
                  <div class="code" style="font-size:10px">
                    ${e.action === 'hide' ? 'DOWN' : e.action === 'restore' ? 'BACK' : 'SEEN'}
                  </div>
                  <div style="flex:1">
                    <p><strong>${t(ACTION_LABEL[e.action] ?? 'actionDismiss', locale)}</strong>
                      ${e.placeId ? html` · ${e.placeId}` : ''}</p>
                    <p class="muted" style="font-size:12px">
                      ${e.moderator} · ${formatDateTime(e.actedAt, locale)}
                      ${e.reasonKey ? html` · ${e.reasonKey}` : ''}
                    </p>
                    ${e.note ? html`<p class="muted" style="font-size:12px">${e.note}</p>` : ''}
                  </div>
                </div>
              `,
            )
      }
    `,
  );
}

/**
 * Who has been doing what, why anyone is flagged, and the filter row.
 *
 * Sits above the log because it is the summary the log is evidence for. A
 * moderator scanning two hundred rows will not notice that one name appears
 * in ninety of them; a count will tell them in a second.
 *
 * Every flag prints the rule that fired and the numbers behind it. A red mark
 * with no explanation is an accusation, and the reader cannot act on one.
 */
function watchBlock(
  watch: ModeratorWatch[],
  locale: Locale,
  active: { moderator?: string; action?: string },
): Raw {
  const tr = (k: Parameters<typeof t>[0]) => t(k, locale);
  if (watch.length === 0) return html``;
  const flagged = watch.filter((m) => m.reasons.length > 0);

  const link = (moderator?: string) =>
    `/console/reviews/log${moderator ? `?moderator=${encodeURIComponent(moderator)}` : ''}`;

  return html`
    <section style="margin-top:24px;border-top:2px solid var(--color-text);padding-top:16px">
      <p class="kicker">${tr('moderatorActivity')} · ${tr('watchHeading')}</p>
      <p class="muted" style="max-width:72ch;margin-top:6px;font-size:12px">
        ${tr('moderatorActivityBlurb')}
      </p>

      <nav class="nav" style="margin-top:14px;flex-wrap:wrap">
        <a href="${link()}" class="${active.moderator ? '' : 'on'}">${tr('filterByModerator')}</a>
        ${watch.map(
          (m) => html`<a href="${link(m.moderator)}"
             class="${active.moderator === m.moderator ? 'on' : ''}"
             style="${m.reasons.length > 0 ? 'border-color:var(--color-accent);color:var(--color-accent-700)' : ''}"
            >${m.moderator} · ${m.recentHides}</a>`,
        )}
      </nav>

      ${flagged.map((m) => flagCard(m, locale))}

      ${watch.filter((m) => m.reasons.length === 0).map(
        (m) => html`
          <p class="muted" style="margin-top:8px;font-size:12px">
            ${m.moderator}: ${m.recentHides} · ${tr('watchNone')}
            ${m.baselineDays > 0
              ? html` (${tr('baselineLabel')} ${m.baselineMedian})`
              : html` (${tr('noBaselineLabel')})`}
          </p>
        `,
      )}
    </section>
  `;
}

/** One flagged moderator, with the numbers behind every rule that fired. */
function flagCard(m: ModeratorWatch, locale: Locale): Raw {
  const line = (reason: string): Raw => {
    if (reason === 'spike') {
      return html`${tf('watchSpike', locale, {
        baseline: String(m.baselineMedian), recent: String(m.recentHides),
      })}`;
    }
    if (reason === 'absolute') {
      return html`${tf('watchAbsolute', locale, { recent: String(m.recentHides) })}`;
    }
    if (reason === 'overturned') {
      return html`${tf('watchOverturned', locale, {
        overturned: String(m.overturned), total: String(m.totalHides),
      })}`;
    }
    return html`${t('watchNoBaseline', locale)}`;
  };

  return html`
    <div style="border:2px solid var(--color-accent);padding:12px;margin-top:12px">
      <p style="color:var(--color-accent-700)"><strong>${m.moderator}</strong></p>
      ${m.reasons.map(
        (r) => html`<p style="margin-top:4px;font-size:13px">${line(r)}</p>`,
      )}
    </div>
  `;
}


/**
 * Proposals waiting for a second pair of eyes.
 *
 * Its own page rather than a lens on the desk, because it asks a different
 * question: not "should this come down" but "do I agree with what somebody
 * else decided". Mixing the two invites approving on the way past.
 */
export function batchesPage(
  locale: Locale,
  hostName: string,
  reviewer: string | null,
  batches: { batch: ReviewBatch; preview: BatchPreviewRow[] }[],
  csrf: string,
  pendingCount: number,
): string {
  const tr = (k: Parameters<typeof t>[0]) => t(k, locale);

  return layout(
    {
      title: tr('filterBatches'),
      locale, hostName, reviewer, signedIn: true,
      activeNav: 'moderation', pendingCount, canModerate: true,
      path: '/console/reviews/batches',
    },
    html`
      <p><a href="/console/reviews">&larr; ${tr('moderationTitle')}</a></p>
      <h3>${tr('filterBatches')}</h3>
      <p class="muted" style="max-width:72ch">${tr('batchBlurb')}</p>
      <p class="muted" style="max-width:72ch;margin-top:8px;font-size:12px">
        ${tr('batchHonesty')}
      </p>

      ${
        batches.length === 0
          ? html`<p style="margin-top:28px"><strong>${tr('nothingAwaiting')}</strong></p>`
          : batches.map((b) => batchCard(b.batch, b.preview, locale, reviewer, csrf))
      }
    `,
  );
}

function batchCard(
  batch: ReviewBatch,
  preview: BatchPreviewRow[],
  locale: Locale,
  reviewer: string | null,
  csrf: string,
): Raw {
  const tr = (k: Parameters<typeof t>[0]) => t(k, locale);
  const isOwn = batch.proposedBy === (reviewer ?? '');

  return html`
    <article style="border:2px solid var(--color-text);padding:18px;margin-top:18px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:16px">
        <div>
          <span class="kicker">${MODERATION_REASONS[batch.reasonKey][locale]}</span>
          <h4 style="margin:2px 0 0">
            ${tf('batchCount', locale, { n: String(batch.reviewIds.length) })}
          </h4>
        </div>
        <div class="muted" style="font-size:12px;text-align:right">
          ${tr('batchProposedBy')} ${batch.proposedBy}<br>
          ${tr('batchExpires')} ${formatDateTime(batch.expiresAt, locale)}
        </div>
      </div>

      ${batch.note ? html`<p style="margin-top:10px">${batch.note}</p>` : ''}

      <p class="kicker" style="margin-top:16px">${tr('batchPreview')}</p>
      <p class="muted" style="font-size:12px">${tr('batchPreviewNote')}</p>
      ${preview.map(
        (r) => html`
          <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--color-neutral-300)">
            <p style="font-size:13px"><strong>${r.rating} / 5</strong> · ${r.placeName}</p>
            ${r.body ? html`<p class="muted" style="font-size:12px">${r.body}</p>` : ''}
          </div>
        `,
      )}

      <div style="display:flex;gap:10px;align-items:center;margin-top:16px">
        ${
          isOwn
            ? html`<p class="muted" style="font-size:13px">${tr('batchOwnProposal')}</p>`
            : html`
                <form method="post" action="/console/reviews/batches/${batch.id}/approve">
                  <input type="hidden" name="csrf" value="${csrf}">
                  <button class="btn btn-primary" type="submit">${tr('batchApprove')}</button>
                </form>
              `
        }
        <form method="post" action="/console/reviews/batches/${batch.id}/cancel">
          <input type="hidden" name="csrf" value="${csrf}">
          <button class="btn" type="submit">${tr('batchCancel')}</button>
        </form>
      </div>
    </article>
  `;
}

/**
 * The bar that turns a selection into a proposal.
 *
 * Sticky at the bottom of the form so a moderator working down a long wave can
 * still reach it. One reason for the whole batch — that is what makes it a
 * batch rather than a hundred separate judgements sharing a button.
 */
function batchBar(locale: Locale): Raw {
  const tr = (k: Parameters<typeof t>[0]) => t(k, locale);
  return html`
    <div style="position:sticky;bottom:0;background:var(--color-bg);
                border-top:2px solid var(--color-text);padding:14px 0;margin-top:20px">
      <p class="kicker">${tr('batchHeading')}</p>
      <p class="muted" style="max-width:72ch;margin-top:6px;font-size:12px">
        ${tr('batchBlurb')}
      </p>
      <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-top:12px">
        <div class="field" style="margin:0">
          <label for="batch-reason">${tr('takeDownReason')}</label>
          <select class="input" id="batch-reason" name="reason" required style="min-width:320px">
            <option value="">—</option>
            ${MODERATION_REASON_KEYS.map(
              (key) => html`<option value="${key}">${MODERATION_REASONS[key][locale]}</option>`,
            )}
          </select>
        </div>
        <div class="field" style="margin:0">
          <label for="batch-note">${tr('takeDownNote')}</label>
          <input class="input" type="text" id="batch-note" name="note" maxlength="500"
                 style="min-width:260px">
        </div>
        <button class="btn btn-primary" type="submit">${tr('batchPropose')}</button>
      </div>
    </div>
  `;
}
