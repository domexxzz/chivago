/**
 * The page a verifier opens from an invitation link (host-invite-service.ts).
 *
 * Three states, each said plainly: the invitation (what they are asked to
 * verify, and a name to type), the welcome (signed in, with the key shown
 * this once so another device can sign in later), and a link that no longer
 * works (used, expired or wrong), which tells them who to ask.
 */
import { html, layout } from './html.ts';
import type { Locale } from './i18n.ts';
import type { OpenInvite } from '../host-invite-service.ts';

const say = (locale: Locale, th: string, en: string): string => (locale === 'th' ? th : en);

export function invitePage(locale: Locale, invite: OpenInvite, nameMissing = false): string {
  return layout(
    { title: say(locale, 'คำเชิญเป็นผู้รับรอง', 'Invitation to verify'), locale, path: '/console/login', publicPage: true },
    html`
      <h3>${say(locale, `${invite.hostName} ได้รับเชิญให้เป็นผู้รับรองกิจกรรม`, `${invite.hostName} is invited to verify activities`)}</h3>
      <p class="muted" style="max-width:60ch">${say(locale,
        'เมื่อนักท่องเที่ยวทำภารกิจด้านล่างเสร็จ หลักฐาน (รูปถ่ายและน้ำหนัก) จะส่งมาให้คุณตรวจ แต้มและตัวเลขผลกระทบจะนับก็ต่อเมื่อคุณอนุมัติเท่านั้น',
        'When a traveller completes a quest below, their evidence (photos and weight) comes to you. Points and impact figures count only once you approve it.')}</p>
      <ul>${invite.quests.map((q) => html`<li><strong>${locale === 'th' && q.nameTh ? q.nameTh : q.nameEn}</strong></li>`)}</ul>
      ${nameMissing ? html`<p style="color:var(--color-accent-700)"><strong>${say(locale, 'กรุณากรอกชื่อผู้ตรวจ', 'Enter the reviewer\'s name.')}</strong></p>` : ''}
      <form method="post" style="max-width:420px;margin-top:20px">
        <div class="field">
          <label for="reviewer">${say(locale, 'ชื่อผู้ตรวจ', 'Reviewer\'s name')}</label>
          <input class="input" type="text" id="reviewer" name="reviewer" required maxlength="80" autocomplete="name" style="width:100%">
          <p class="muted">${say(locale, 'บันทึกไว้กับทุกการตัดสิน เพื่อให้รู้ว่าใครเป็นผู้รับรอง', 'Recorded against every decision, so everyone can see who verified it.')}</p>
        </div>
        <button class="btn btn-primary btn-block" type="submit" style="margin-top:16px">
          ${say(locale, 'รับคำเชิญและเข้าสู่ระบบ', 'Accept and sign in')}
        </button>
      </form>
      <p class="muted" style="margin-top:16px">${say(locale, 'ลิงก์นี้ใช้ได้ครั้งเดียว หมดอายุ', 'This link works once and expires')} ${invite.expiresAt.slice(0, 10)}</p>
    `,
  );
}

export function inviteWelcomePage(locale: Locale, hostName: string, key: string): string {
  return layout(
    { title: say(locale, 'ยินดีต้อนรับ', 'Welcome'), locale, path: '/console/login', publicPage: true },
    html`
      <h3>${say(locale, `ยินดีต้อนรับ ${hostName}`, `Welcome, ${hostName}`)}</h3>
      <p>${say(locale, 'คุณเข้าสู่ระบบแล้ว ด้านล่างคือรหัสเข้าใช้งาน (Access Key) ของหน่วยงาน ใช้เข้าสู่ระบบจากเครื่องอื่นได้', 'You are signed in. Below is your organisation\'s access key, for signing in on another device.')}</p>
      <p style="font-family:monospace;font-size:18px;padding:12px;border:2px solid var(--color-text);word-break:break-all" dir="ltr">${key}</p>
      <p style="color:var(--color-accent-700)"><strong>${say(locale, 'รหัสนี้แสดงครั้งเดียว กรุณาบันทึกไว้ในที่ปลอดภัย และอย่าส่งต่อในกลุ่มแชท', 'This key is shown once. Keep it somewhere safe and do not post it in a group chat.')}</strong></p>
      <p><a class="btn btn-primary" href="/console">${say(locale, 'ไปที่คิวรอตรวจ', 'Go to the review queue')}</a></p>
    `,
  );
}

export function inviteClosedPage(locale: Locale, state: 'used' | 'expired' | 'unknown'): string {
  const why = state === 'used'
    ? say(locale, 'ลิงก์นี้ถูกใช้ไปแล้ว', 'This link has already been used.')
    : state === 'expired'
      ? say(locale, 'ลิงก์นี้หมดอายุแล้ว', 'This link has expired.')
      : say(locale, 'ไม่พบคำเชิญนี้', 'This invitation does not exist.');
  return layout(
    { title: say(locale, 'ลิงก์ใช้ไม่ได้', 'Link not valid'), locale, path: '/console/login', publicPage: true },
    html`<h3>${why}</h3><p class="muted">${say(locale, 'ติดต่อทีม ChivarGo เพื่อขอลิงก์ใหม่', 'Ask the ChivarGo team for a new link.')}</p>`,
  );
}
