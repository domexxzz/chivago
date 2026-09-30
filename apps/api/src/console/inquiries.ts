/**
 * An operator's listings, and the questions waiting on them.
 *
 * Stage two of `docs/61`. A traveller's question is only worth sending if
 * somebody answers it, and the person who answers is an operator signed in
 * here - an ordinary host, scoped to their own listings like every other
 * write in this console.
 *
 * WHAT WAITS IS SHOWN FIRST, WITH ITS DEADLINE. An inquiry expires when its
 * window closes or its day ends, and once it has the traveller has been told
 * it went unanswered. So the page leads with what is still open and says how
 * long each has left - computed by `answerBy`, the same instant the rule
 * enforces, so the page cannot promise time the server will refuse.
 *
 * NOTHING HERE SAYS "BOOK" OR "CONFIRM". The operator answers a question. If
 * they and the traveller agree something, that happens between them, and the
 * reply form says so where the operator types.
 */

import {
  INQUIRY_IS_NOT_A_BOOKING, LICENCE_STATED, LISTING_KIND_LABEL, OPERATOR_PRIVACY, STATE_LABEL,
  answerBy,
  type Listing, type ListingKind,
} from '@chivago/core';
import type { InquiryView } from '../inquiry-service.ts';
import { esc, html, layout, type Raw } from './html.ts';
import { t, type Locale } from './i18n.ts';

const baht = (n: number): string => `${n.toLocaleString('en-US')} THB`;

/**
 * How long is left, in words an operator reads at a glance.
 *
 * Rounded DOWN to the hour, so the page never tells somebody they have an
 * hour when they have fifty-nine minutes.
 */
function timeLeft(i: InquiryView, now: Date, th: boolean): string {
  const ms = answerBy(i).getTime() - now.getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return th ? 'เหลือไม่ถึง 1 ชั่วโมง' : 'less than an hour left';
  if (hours < 48) return th ? `เหลืออีก ${hours} ชั่วโมง` : `${hours} ${hours === 1 ? 'hour' : 'hours'} left`;
  const days = Math.floor(hours / 24);
  return th ? `เหลืออีก ${days} วัน` : `${days} days left`;
}

function waitingCard(
  i: InquiryView, listing: Listing | undefined, csrf: string, now: Date, th: boolean,
): Raw {
  const title = listing ? (th ? listing.title.th : listing.title.en) : '—';
  // The left rule is the console's pattern for one item in a list - the same
  // one conclusions and declared uses use. The first version nested a
  // .panel here, and the console's panels are flat, so two waiting inquiries
  // ran together and an operator could type one traveller's answer into the
  // other's form.
  return html`
    <div style="border-left:6px solid var(--color-text);padding:8px 0 8px 16px;margin:24px 0">
      <p style="margin:0">
        <strong>${esc(title)}</strong>
        · ${esc(i.forDate)} · ${esc(String(i.partySize))} ${th ? 'คน' : (i.partySize === 1 ? 'person' : 'people')}
        · <strong>${esc(timeLeft(i, now, th))}</strong>
      </p>
      <blockquote style="margin:10px 0;white-space:pre-wrap">${esc(i.message)}</blockquote>
      <form method="post" action="/console/inquiries/${esc(i.id)}/answer">
        <input type="hidden" name="csrf" value="${esc(csrf)}">
        <p>
          <label>${th ? 'คำตอบของคุณ' : 'Your answer'}<br>
            <textarea name="answer" rows="3" required style="width:100%"></textarea></label>
        </p>
        <p>
          <label>${th ? 'ราคาที่เสนอ (บาท)' : 'Your quote, THB'}
            <span class="muted">${th ? '(ไม่บังคับ)' : '(optional)'}</span><br>
            <input name="quoteTHB" type="number" min="0" step="1" style="width:140px"></label>
        </p>
        <!--
          Said where the operator types, not in a footer. The one misreading
          that matters is an operator thinking their reply confirms something.
        -->
        <p class="note">${th
    ? 'การตอบไม่ใช่การยืนยันการจอง หากตกลงกันได้ เป็นเรื่องระหว่างคุณกับนักท่องเที่ยวโดยตรง'
    : 'Answering does not confirm a booking. If you agree something, that is between you and the traveller directly.'}</p>
        <p class="actions"><button type="submit">${th ? 'ส่งคำตอบ' : 'Send answer'}</button></p>
      </form>
      <form method="post" action="/console/inquiries/${esc(i.id)}/decline" style="margin-top:8px">
        <input type="hidden" name="csrf" value="${esc(csrf)}">
        <input name="reason" type="text" placeholder="${th ? 'เหตุผล (ไม่บังคับ)' : 'reason (optional)'}" style="width:220px">
        <button type="submit" class="danger">${th ? 'รับไม่ได้' : 'Can’t help'}</button>
      </form>
    </div>`;
}

export function inquiriesPage(args: {
  locale: Locale;
  hostName: string;
  reviewer: string | null;
  canModerate: boolean;
  /** An operator's account: this page is its whole console (docs/62). */
  marketplaceOnly?: boolean;
  /** A made-up operator, for walking the flow. Said here as well as to travellers. */
  example?: boolean;
  csrf: string;
  listings: Listing[];
  inquiries: InquiryView[];
  /** Median hours to answer, or null when there are too few answers to say. */
  responseHours: number | null;
  minAnswers: number;
  now: Date;
  error?: string | null;
}): string {
  const { locale, csrf, listings, inquiries, now } = args;
  const th = locale === 'th';
  const byId = new Map(listings.map((l) => [l.id, l]));
  const waiting = inquiries.filter((i) => i.now === 'sent')
    // Soonest deadline first: the one about to expire is the one to answer.
    .sort((a, b) => answerBy(a).getTime() - answerBy(b).getTime());
  const closed = inquiries.filter((i) => i.now !== 'sent');

  const body = html`
    <h1>${th ? 'คำสอบถาม' : 'Inquiries'} · ${th ? 'Inquiries' : 'คำสอบถาม'}</h1>
    <p class="muted">${esc(th ? INQUIRY_IS_NOT_A_BOOKING.th : INQUIRY_IS_NOT_A_BOOKING.en)}</p>
    <p class="note">${esc(th ? OPERATOR_PRIVACY.th : OPERATOR_PRIVACY.en)}</p>
    ${args.example
    ? html`<p class="note danger" style="padding:12px">${esc(th
      ? 'บัญชีนี้เป็นตัวอย่าง ไม่ใช่ธุรกิจจริง ทุกหน้าจอที่นักท่องเที่ยวเห็นรายการของบัญชีนี้ '
        + 'จะบอกไว้ว่าเป็นตัวอย่าง และจะไม่แสดงเวลาตอบเฉลี่ย'
      : 'This account is an EXAMPLE, not a real business. Every screen that shows its listings '
        + 'to a traveller says so, and it is shown no response time.')}</p>`
    : ''}
    ${args.error ? html`<p class="note danger" style="padding:12px">${esc(args.error)}</p>` : ''}

    ${args.example ? '' : html`<p>
      ${args.responseHours === null
    ? (th
      ? `ยังแสดงเวลาตอบเฉลี่ยไม่ได้ จนกว่าจะตอบครบ ${args.minAnswers} ครั้ง`
      : `Your usual response time shows once you have answered ${args.minAnswers} inquiries.`)
    : (th
      ? `ปกติคุณตอบภายใน ${args.responseHours} ชั่วโมง (ค่ากลาง)`
      : `You usually answer within ${args.responseHours} hours (median).`)}
    </p>`}

    <section class="panel">
      <h2>${th ? 'รอคุณตอบ' : 'Waiting on you'} · ${waiting.length}</h2>
      ${args.marketplaceOnly
    ? html`<p><button id="notify-me" type="button" class="btn" style="min-height:44px">${t('notifyMeQuestions', locale)}</button></p>`
    : ''}
      ${waiting.length === 0
    ? html`<p class="note">${th ? 'ไม่มีคำถามที่รอคำตอบ' : 'Nothing is waiting.'}</p>`
    : waiting.map((i) => waitingCard(i, byId.get(i.listingId), csrf, now, th))}
    </section>

    <section class="panel">
      <h2>${th ? 'รายการของคุณ' : 'Your listings'}</h2>
      ${listings.length === 0
    ? html`<p class="note">${th
      ? 'ยังไม่มีรายการ นักท่องเที่ยวจะส่งคำถามถึงคุณได้เมื่อมีรายการแล้ว'
      : 'No listings yet. Travellers can ask you questions once you have one.'}</p>`
    : html`
      <div class="scroll">
        <table>
          <thead><tr>
            <th>${th ? 'ประเภท' : 'Kind'}</th><th>${th ? 'ชื่อ' : 'Title'}</th>
            <th>${th ? 'ที่' : 'Where'}</th><th>${th ? 'ราคาเริ่มต้น' : 'From'}</th>
            <th>${th ? 'ใบอนุญาต' : 'Licence'}</th><th></th>
          </tr></thead>
          <tbody>
            ${listings.map((l) => html`
              <tr>
                <td>${esc(th ? LISTING_KIND_LABEL[l.kind].th : LISTING_KIND_LABEL[l.kind].en)}</td>
                <td>${esc(th ? l.title.th : l.title.en)}</td>
                <td>${esc(l.whereLabel)}</td>
                <td>${l.fromTHB === null ? html`<span class="muted">${th ? 'ไม่ได้ระบุ' : 'not stated'}</span>` : esc(baht(l.fromTHB))}</td>
                <td>${l.licenceNo === null ? html`<span class="muted">—</span>` : html`${esc(l.licenceNo)}<br><span class="muted">${esc(th ? 'ตามที่คุณระบุ' : 'as you stated')}</span>`}</td>
                <td>
                  <form method="post" action="/console/listings/${esc(l.id)}/active">
                    <input type="hidden" name="csrf" value="${esc(csrf)}">
                    <input type="hidden" name="active" value="${l.active ? '0' : '1'}">
                    <button type="submit">${l.active ? (th ? 'พักไว้' : 'Pause') : (th ? 'เปิดรับอีกครั้ง' : 'Resume')}</button>
                  </form>
                  ${l.active ? '' : html`<span class="muted">${th ? 'พักอยู่ ไม่รับคำถามใหม่' : 'paused — takes no new questions'}</span>`}
                </td>
              </tr>`)}
          </tbody>
        </table>
      </div>`}

      <h3>${th ? 'เพิ่มรายการ' : 'Add a listing'}</h3>
      <form method="post" action="/console/listings">
        <input type="hidden" name="csrf" value="${esc(csrf)}">
        <p>
          <label>${th ? 'ประเภท' : 'Kind'}<br>
            <select name="kind">
              ${(['stay', 'tour', 'experience', 'transfer'] as ListingKind[]).map((k) => html`
                <option value="${k}">${esc(th ? LISTING_KIND_LABEL[k].th : LISTING_KIND_LABEL[k].en)}</option>`)}
            </select></label>
        </p>
        <p><label>${th ? 'ชื่อ (ภาษาไทย)' : 'Title in Thai'}<br>
          <input name="titleTh" type="text" required style="width:100%"></label></p>
        <p><label>${th ? 'ชื่อ (ภาษาอังกฤษ)' : 'Title in English'}<br>
          <input name="titleEn" type="text" required style="width:100%"></label></p>
        <p><label>${th ? 'สถานที่' : 'Where'}<br>
          <input name="whereLabel" type="text" required placeholder="Thong Krut pier" style="width:100%"></label></p>
        <p><label>${th ? 'ราคาเริ่มต้น (บาท)' : '“From” price, THB'}
          <span class="muted">${th ? '(ไม่บังคับ — ว่างไว้ถ้ายังไม่ต้องการระบุ)' : '(optional — leave empty rather than guess)'}</span><br>
          <input name="fromTHB" type="number" min="0" step="1" style="width:140px"></label></p>
        <p><label>${th ? 'เลขใบอนุญาตประกอบธุรกิจนำเที่ยว' : 'Department of Tourism licence number'}
          <span class="muted">${th ? '(จำเป็นสำหรับทัวร์)' : '(required for a tour)'}</span><br>
          <input name="licenceNo" type="text" style="width:220px"></label></p>
        <p class="note">${esc(th ? LICENCE_STATED.th : LICENCE_STATED.en)}</p>
        <p class="actions"><button type="submit">${th ? 'เพิ่ม' : 'Add'}</button></p>
      </form>
    </section>

    ${closed.length === 0 ? '' : html`
    <section class="panel">
      <h2>${th ? 'ที่ปิดไปแล้ว' : 'Closed'}</h2>
      <div class="scroll">
        <table>
          <thead><tr>
            <th>${th ? 'รายการ' : 'Listing'}</th><th>${th ? 'วันที่ถาม' : 'For'}</th>
            <th>${th ? 'สถานะ' : 'Status'}</th><th>${th ? 'คำตอบ' : 'Answer'}</th>
          </tr></thead>
          <tbody>
            ${closed.map((i) => {
    const l = byId.get(i.listingId);
    return html`
              <tr>
                <td>${esc(l ? (th ? l.title.th : l.title.en) : '—')}</td>
                <td>${esc(i.forDate)}</td>
                <td>${esc(th ? STATE_LABEL[i.now].th : STATE_LABEL[i.now].en)}</td>
                <td>${i.answer ? esc(i.answer) : html`<span class="muted">—</span>`}${
  i.quoteTHB === null ? '' : html`<br><span class="muted">${esc(th ? 'เสนอ' : 'quoted')} ${esc(baht(i.quoteTHB))}</span>`}</td>
              </tr>`;
  })}
          </tbody>
        </table>
      </div>
    </section>`}`;

  return layout({
    title: 'Inquiries',
    locale,
    hostName: args.hostName,
    reviewer: args.reviewer,
    signedIn: true,
    activeNav: 'inquiries',
    canModerate: args.canModerate,
    marketplaceOnly: args.marketplaceOnly,
    // The badge an operator watches: questions waiting on them, not proofs.
    pendingCount: args.marketplaceOnly ? waiting.length : undefined,
    path: '/console/inquiries',
  }, body);
}
