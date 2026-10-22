/**
 * Where a business asks to list, and where somebody decides.
 *
 * TWO AUDIENCES, TWO PAGES, ONE FILE. The form is read by a stranger who has
 * never seen this product; the queue is read by a moderator who sees it every
 * day. They are together because they are two halves of one decision and the
 * wording has to match: what the form promises - a phone call, a look at the
 * licence - is what the queue has to make easy to do.
 *
 * BOTH LANGUAGES, TOGETHER. The console picks one language (see i18n.ts),
 * because its users are known staff working a queue. The form's reader is
 * not: they followed a link, they may be a trader at a pier or a hotel's
 * manager in Singapore, and asking them to find a switcher before they can
 * read the first field is asking too much. So this page carries Thai and
 * English the way the app does, Thai first.
 */

import {
  APPLICATION_NOT_A_YES, APPLICATION_STATE_LABEL, LICENCE_STATED,
  LISTING_KINDS, LISTING_KIND_LABEL,
  type Bilingual, type OperatorApplication,
} from '@chivago/core';
import { esc, html, layout, type Raw } from './html.ts';
import type { Locale } from './i18n.ts';

/*
  Boxes drawn with the tokens rather than with class names.

  `console/organisations.ts` reaches for `.panel`, `.lede` and `.flash`, and
  none of the three is in `public/modernist.css` - so the warning it means to
  set apart renders as an ordinary paragraph. Rather than inherit that, the
  two things on these pages that MUST stand out - "this is not an account"
  and a key shown once - carry their own borders. Adding the missing classes
  to the shared stylesheet would restyle a page nobody asked me to touch.
*/
const BOX = 'border:2px solid var(--color-text);padding:16px 18px;margin:24px 0';
const BOX_LOUD = 'border:3px solid var(--color-accent);padding:16px 18px;margin:24px 0';
const LEDE = 'font-size:16px;line-height:1.6;max-width:62ch';

/** Thai first, English under it, in the one shape every label on these pages uses. */
const both = (copy: Bilingual): Raw => html`<span lang="th">${copy.th}</span>
  <span class="muted" lang="en">${copy.en}</span>`;

const field = (args: {
  name: string;
  label: Bilingual;
  value?: string | null;
  type?: string;
  required?: boolean;
  hint?: Bilingual;
  maxLength: number;
}): Raw => html`
  <div class="field" style="margin-top:16px">
    <label for="${esc(args.name)}">${both(args.label)}${args.required ? ' *' : ''}</label>
    <input class="input" type="${esc(args.type ?? 'text')}" id="${esc(args.name)}"
           name="${esc(args.name)}" value="${esc(args.value ?? '')}"
           maxlength="${args.maxLength}" ${args.required ? html`required` : ''}
           style="width:100%">
    ${args.hint ? html`<p class="muted" style="margin:6px 0 0">${both(args.hint)}</p>` : ''}
  </div>`;

/**
 * The form.
 *
 * `values` is what they typed, handed back on a refusal. A public form that
 * clears itself when one field is wrong is a form a business owner fills in
 * twice and then gives up on.
 */
export function applyPage(args: {
  locale: Locale;
  problems?: readonly Bilingual[];
  values?: Record<string, string>;
}): string {
  const v = args.values ?? {};
  const problems = args.problems ?? [];

  const body = html`
    <h1>ลงทะเบียนผู้ประกอบการ · List your business</h1>
    <p style="${LEDE}">
      <span lang="th">ที่พัก ทัวร์ กิจกรรม หรือรถรับส่ง — ถ้าคุณรับนักเดินทางอยู่แล้ว
      คุณตอบคำถามพวกเขาในแอปนี้ได้</span>
      <span class="muted" lang="en">A stay, a tour, an experience or a transfer. If you
      already take travellers, you can answer their questions here.</span>
    </p>

    <!--
      Said before the fields, not after the button. What this form does is
      less than a sign-up form usually does, and somebody who thinks they are
      opening an account should find that out while they can still stop.
    -->
    <section style="${BOX}">
      <p style="margin:0">${both(APPLICATION_NOT_A_YES)}</p>
    </section>

    ${
      problems.length > 0
        ? html`<div style="${BOX_LOUD}">
            <p style="margin:0 0 8px"><strong><span lang="th">ยังส่งไม่ได้</span>
              <span lang="en">Not sent yet</span></strong></p>
            <ul style="margin:0;padding-left:20px">
              ${problems.map((p) => html`<li>${both(p)}</li>`)}
            </ul>
          </div>`
        : ''
    }

    <form method="post" action="/console/apply" style="max-width:560px;margin-top:24px">
      ${field({
        name: 'businessName', maxLength: 120, required: true,
        label: { th: 'ชื่อธุรกิจ', en: 'Business name' },
        value: v.businessName,
        hint: {
          th: 'เขียนตามที่คุณใช้จริง ภาษาไทยหรืออังกฤษก็ได้',
          en: 'However you write it yourself. Thai or English.',
        },
      })}

      <div class="field" style="margin-top:16px">
        <label for="kind">${both({ th: 'ประเภท', en: 'Kind' })} *</label>
        <select id="kind" name="kind" required style="width:100%">
          ${LISTING_KINDS.map((k) => html`<option value="${esc(k)}" ${v.kind === k ? html`selected` : ''}>${
            LISTING_KIND_LABEL[k].th} · ${LISTING_KIND_LABEL[k].en}</option>`)}
        </select>
      </div>

      ${field({
        name: 'whereLabel', maxLength: 120, required: true,
        label: { th: 'ให้บริการที่ไหน', en: 'Where you operate' },
        value: v.whereLabel,
        hint: { th: 'เช่น ท่าเรือท้องครุฏ, หาดเฉวง', en: 'For example: Thong Krut pier, Chaweng beach.' },
      })}

      ${field({
        name: 'contactName', maxLength: 120, required: true,
        label: { th: 'ชื่อผู้ติดต่อ', en: 'Who we should ask for' },
        value: v.contactName,
      })}

      ${field({
        name: 'contactPhone', maxLength: 40, required: true, type: 'tel',
        label: { th: 'เบอร์โทร', en: 'Phone' },
        value: v.contactPhone,
      })}

      ${field({
        name: 'contactEmail', maxLength: 160, type: 'email',
        label: { th: 'อีเมล (ถ้ามี)', en: 'Email, if you have one' },
        value: v.contactEmail,
      })}

      <!--
        Shown to everybody rather than revealed for tours only: a business
        that cannot state a licence should learn that a tour needs one before
        it picks the category, not after.
      -->
      ${field({
        name: 'licenceNo', maxLength: 60,
        label: { th: 'เลขใบอนุญาตนำเที่ยว (ทัวร์ต้องมี)', en: 'Tourism licence number — required for a tour' },
        value: v.licenceNo,
        hint: LICENCE_STATED,
      })}

      <div class="field" style="margin-top:16px">
        <label for="note">${both({ th: 'อยากบอกอะไรเพิ่ม', en: 'Anything else' })}</label>
        <textarea id="note" name="note" maxlength="600">${esc(v.note ?? '')}</textarea>
      </div>

      <button class="btn btn-primary btn-block" type="submit" style="margin-top:20px">
        <span lang="th">ส่งแบบฟอร์ม</span> · <span lang="en">Send</span>
      </button>
    </form>
  `;

  return layout(
    {
      title: 'ลงทะเบียนผู้ประกอบการ · List your business',
      locale: args.locale,
      hostName: 'ลงทะเบียนผู้ประกอบการ',
      publicPage: true,
    },
    body,
  );
}

/** What they see after sending. No account, no key - a reference and a wait. */
export function applySentPage(args: { locale: Locale; id: string }): string {
  return layout(
    {
      title: 'ส่งแล้ว · Sent',
      locale: args.locale,
      hostName: 'ส่งแล้ว · Sent',
      publicPage: true,
    },
    html`
      <h1><span lang="th">ได้รับแบบฟอร์มแล้ว</span> <span lang="en">· We have it</span></h1>
      <p style="${LEDE}">
        <span lang="th">จะมีคนโทรติดต่อคุณ ยังไม่มีอะไรของคุณขึ้นในแอป และยังไม่มีบัญชี
        จนกว่าจะคุยกันเสร็จ</span>
        <span class="muted" lang="en">Somebody will call you. Nothing of yours is in the app
        yet, and there is no account until we have spoken.</span>
      </p>
      <p>
        <span lang="th">เลขอ้างอิง</span> <span class="muted" lang="en">Reference</span><br>
        <code dir="ltr">${esc(args.id)}</code>
      </p>
      <p class="muted">
        <span lang="th">เก็บไว้อ้างอิงเวลาโทรคุย — เลขนี้ไม่ใช่รหัสเข้าใช้งาน</span>
        <span lang="en">Keep it for the call. It is not an access key and opens nothing.</span>
      </p>
    `,
  );
}

/* ------------------------------------------------------- the moderator's -- */

const detail = (label: Bilingual, value: string): Raw => html`
  <div style="margin-top:6px">${both(label)}: <strong>${esc(value)}</strong></div>`;

/**
 * One waiting application, with the two decisions beside it.
 *
 * THE ID IS TYPED, NOT GENERATED. It becomes the operator's id for good, is
 * read aloud when the key is handed over, and a transliteration this code
 * guessed is not the owner's. Prefilled with nothing on purpose.
 */
function pendingRow(app: OperatorApplication, csrf: string): Raw {
  return html`
    <section style="${BOX}">
      <h3 style="margin:0">${esc(app.businessName)}</h3>
      <p class="muted" style="margin:4px 0 12px">
        ${LISTING_KIND_LABEL[app.kind].th} · ${LISTING_KIND_LABEL[app.kind].en}
        — ${esc(app.whereLabel)} — ${esc(app.submittedAt.slice(0, 10))}
      </p>

      ${detail({ th: 'ผู้ติดต่อ', en: 'Contact' }, app.contactName)}
      ${detail({ th: 'โทร', en: 'Phone' }, app.contactPhone)}
      ${app.contactEmail ? detail({ th: 'อีเมล', en: 'Email' }, app.contactEmail) : ''}
      ${app.licenceNo ? detail({ th: 'เลขใบอนุญาต', en: 'Licence' }, app.licenceNo) : ''}
      ${app.licenceNo ? html`<p class="muted" style="margin:4px 0 0">${both(LICENCE_STATED)}</p>` : ''}
      ${app.note ? html`<p style="margin-top:12px">${esc(app.note)}</p>` : ''}

      <!--
        The two steps no software can do, printed where the decision is made
        rather than left in docs/62 for somebody to remember.
      -->
      <p class="muted" style="margin-top:16px">
        <span lang="th">ก่อนกดอนุมัติ: โทรคุยกับเจ้าของให้แล้ว และถ้าเป็นทัวร์ ขอดูใบอนุญาตด้วยตาตัวเอง</span>
        <span lang="en">Before approving: you have spoken to the owner, and for a tour you have
        seen the licence yourself.</span>
      </p>

      <div class="actions">
        <form method="post" action="/console/applications/${esc(app.id)}/approve">
          <input type="hidden" name="csrf" value="${esc(csrf)}">
          <input name="hostId" type="text" required pattern="op-[a-z0-9-]+"
                 placeholder="op-thong-krut-boats" dir="ltr" style="width:220px">
          <button type="submit"><span lang="th">อนุมัติ</span> · Approve</button>
        </form>
        <form method="post" action="/console/applications/${esc(app.id)}/reject">
          <input type="hidden" name="csrf" value="${esc(csrf)}">
          <input name="reason" type="text" required placeholder="เหตุผล · reason" style="width:220px">
          <button type="submit" class="danger"><span lang="th">ไม่รับ</span> · Decline</button>
        </form>
      </div>
    </section>`;
}

export function applicationsPage(args: {
  locale: Locale;
  hostName: string;
  reviewer: string | null;
  csrf: string;
  pending: OperatorApplication[];
  decided: OperatorApplication[];
  /** A key just issued. Rendered once, never stored, never shown again. */
  issued?: { businessName: string; hostId: string; key: string } | null;
  error?: string | null;
}): string {
  const body = html`
    <h1>ผู้ประกอบการที่ขอลงทะเบียน · Operators asking to list</h1>
    <p style="${LEDE}">
      <span lang="th">แบบฟอร์มจาก /console/apply ทุกช่องเป็นสิ่งที่ผู้สมัครกรอกเอง
      ยังไม่มีใครตรวจ</span>
      <span class="muted" lang="en">From the form at /console/apply. Every field is typed by
      the applicant and checked by nobody.</span>
    </p>

    ${args.error ? html`<p style="${BOX_LOUD}">${esc(args.error)}</p>` : ''}

    ${
      args.issued
        ? html`
          <!--
            The one time this key exists anywhere readable. Only its scrypt
            hash is stored, so reloading this page does not bring it back -
            which is the point, and is why the page says so beside it.
          -->
          <section style="${BOX_LOUD}">
            <h3 style="margin:0">${esc(args.issued.businessName)} —
              <span lang="th">เปิดบัญชีแล้ว</span> <span lang="en">account created</span></h3>
            <p style="margin:8px 0 4px">
              <span lang="th">รหัสเข้าใช้งาน แสดงครั้งเดียวเท่านั้น</span>
              <span class="muted" lang="en">Access key — shown once and never again.</span>
            </p>
            <p class="stat" dir="ltr" style="user-select:all">${esc(args.issued.key)}</p>
            <p class="muted" style="margin:0">
              <span lang="th">ส่งมอบด้วยมือหรือช่องทางที่คุณไว้ใจเท่ากับรหัสผ่าน
              ถ้าหาย ต้องออกใหม่ ไม่มีใครกู้คืนได้ (docs/62)</span>
              <span lang="en">Hand it over in person, or by whatever channel you would trust
              with a password. A lost key is reissued, never recovered (docs/62).</span>
            </p>
            <p class="muted" style="margin:8px 0 0" dir="ltr">id: ${esc(args.issued.hostId)}</p>
          </section>`
        : ''
    }

    ${
      args.pending.length === 0
        ? html`<p class="empty muted">
            <span lang="th">ไม่มีใบสมัครรอพิจารณา</span>
            <span lang="en">Nothing waiting.</span>
          </p>`
        : args.pending.map((app) => pendingRow(app, args.csrf))
    }

    ${
      args.decided.length > 0
        ? html`
          <h2 style="margin-top:40px"><span lang="th">ตัดสินแล้ว</span> <span lang="en">Decided</span></h2>
          <table>
            <tbody>
              ${args.decided.map((app) => html`
                <tr>
                  <td>${esc(app.businessName)}</td>
                  <td>${APPLICATION_STATE_LABEL[app.state].th} ·
                      ${APPLICATION_STATE_LABEL[app.state].en}</td>
                  <td class="muted">${esc(app.decidedAt?.slice(0, 10) ?? '')}</td>
                  <td class="muted">${esc(app.decidedBy ?? '')}</td>
                  <td class="muted" dir="ltr">${esc(app.hostId ?? '')}</td>
                  <td class="muted">${esc(app.reason ?? '')}</td>
                </tr>`)}
            </tbody>
          </table>`
        : ''
    }
  `;

  return layout(
    {
      title: 'ผู้ประกอบการ · Operators',
      locale: args.locale,
      hostName: args.hostName,
      reviewer: args.reviewer,
      signedIn: true,
      canModerate: true,
      activeNav: 'applications',
      path: '/console/applications',
    },
    body,
  );
}
