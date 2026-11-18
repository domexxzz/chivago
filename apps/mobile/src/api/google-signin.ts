/**
 * Signing in with Google, on the web build.
 *
 * The same round trip as line-signin.ts - READ IT - with its own fragment key
 * (`#google=`) so a LINE return and a Google return can never be mistaken for
 * each other. What comes back is the same single-use link code, claimed
 * through `/account/claim` like every other second way in.
 *
 * ONE THING GOOGLE DOES THAT LINE DOES NOT: it refuses to sign anybody in
 * from inside another app's browser - LINE's, Facebook's, Instagram's - with a
 * `disallowed_useragent` page. On this island most links arrive in a LINE
 * chat, so that is not an edge case. `insideAppBrowser` catches it before the
 * traveller is sent to a refusal, and the screen tells them to open the site
 * in Safari or Chrome instead.
 */

import { Platform } from 'react-native';
import type { Localised } from '@chivago/core';
import { API_BASE, api } from './client.ts';
import { adoptKey } from './account.ts';

/** Only the web build can run a redirect sign-in today. */
export const googleSignInAvailable = (): boolean =>
  Platform.OS === 'web' && typeof window !== 'undefined';

/**
 * Is this page open inside another app's built-in browser?
 *
 * By user agent, which is the only signal there is. LINE's in-app browser says
 * `Line/<version>`; Facebook and Messenger say FBAN/FBAV/FB_IAB; Instagram and
 * TikTok name themselves. A browser this misses still works - Google shows its
 * own refusal - so the cost of a miss is a worse message, not a broken login.
 */
export function insideAppBrowser(ua: string | undefined = typeof navigator === 'undefined' ? undefined : navigator.userAgent): boolean {
  if (!ua) return false;
  return /\bLine\/\d/i.test(ua) || /FBAN|FBAV|FB_IAB|Instagram|musical_ly|BytedanceWebview/i.test(ua);
}

/** Send the browser to Google, by way of our own API. */
export function startGoogleSignIn(): void {
  if (!googleSignInAvailable()) return;
  const next = window.location.pathname || '/';
  window.location.assign(`${API_BASE.replace(/\/$/, '')}/auth/google?next=${encodeURIComponent(next)}`);
}

export type GoogleReturn =
  | { kind: 'none' }
  | { kind: 'signed-in'; outcome: string }
  | { kind: 'cancelled' }
  | { kind: 'clash' }
  | { kind: 'unavailable' }
  | { kind: 'failed' };

/** Read the fragment the callback left, and clear it so a reload cannot replay it. */
function takeFragment(): string | null {
  if (typeof window === 'undefined') return null;
  const m = /^#google=(.+)$/.exec(window.location.hash);
  if (!m) return null;
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch { /* a browser that refuses is not a reason to drop the sign-in */ }
  return decodeURIComponent(m[1]!);
}

/** Finish a sign-in that is coming back from Google, if one is. */
export async function finishGoogleSignIn(): Promise<GoogleReturn> {
  const value = takeFragment();
  if (value === null) return { kind: 'none' };
  if (value === 'cancelled') return { kind: 'cancelled' };
  if (value === 'clash') return { kind: 'clash' };
  if (value === 'unavailable') return { kind: 'unavailable' };
  if (!value.startsWith('ok.')) return { kind: 'failed' };

  const [, code, outcome] = value.split('.');
  if (!code) return { kind: 'failed' };
  try {
    const res = await api.claimLink(code, 'Google');
    if (!res.ok) return { kind: 'failed' };
    await adoptKey(res.data.deviceKey);
    return { kind: 'signed-in', outcome: outcome ?? 'signed-in' };
  } catch {
    return { kind: 'failed' };
  }
}

/** What a screen says when Google cannot be used from where the traveller is. */
export const GOOGLE_IN_APP_NOTICE: Localised = {
  en: 'Google does not allow signing in from inside the LINE app or other in-app browsers. Open chivargo.com in Safari or Chrome, then sign in with Google.',
  th: 'Google ไม่อนุญาตให้เข้าสู่ระบบจากเบราว์เซอร์ภายในแอป LINE หรือแอปอื่น กรุณาเปิด chivargo.com ใน Safari หรือ Chrome แล้วเข้าสู่ระบบด้วย Google',
  zh: 'Google 不允许在 LINE 或其他应用的内置浏览器中登录。请在 Safari 或 Chrome 中打开 chivargo.com，再使用 Google 登录。',
};

export const GOOGLE_WEB_ONLY_NOTICE: Localised = {
  en: 'Google sign-in works on the web version at chivargo.com.',
  th: 'การเข้าสู่ระบบด้วย Google ใช้งานได้บนเว็บที่ chivargo.com',
  zh: 'Google 登录可在网页版 chivargo.com 上使用。',
};

/** The message for a return that did not sign anybody in. */
export function googleFailureMessage(kind: Exclude<GoogleReturn['kind'], 'none' | 'signed-in'>): Localised {
  switch (kind) {
    case 'clash':
      return {
        en: 'That Google account already belongs to another ChivarGo account, and this phone has points of its own. Signing in would have to merge them, which is not possible yet — so nothing was changed.',
        th: 'บัญชี Google นี้ผูกกับบัญชี ChivarGo อื่นอยู่แล้ว และเครื่องนี้ก็มีแต้มของตัวเอง การเข้าสู่ระบบจะต้องรวมสองบัญชี ซึ่งยังทำไม่ได้ — จึงยังไม่มีอะไรเปลี่ยน',
        zh: '该 Google 账户已绑定另一个 ChivarGo 账户，而本机也有自己的积分。登录需要合并两个账户，目前尚不支持，因此未做任何更改。',
      };
    case 'cancelled':
      return { en: 'Google sign-in was cancelled.', th: 'ยกเลิกการเข้าสู่ระบบด้วย Google แล้ว', zh: '已取消 Google 登录。' };
    case 'unavailable':
      return { en: 'Google sign-in is not switched on yet. Please use another way to sign in.', th: 'ยังไม่ได้เปิดใช้งานการเข้าสู่ระบบด้วย Google กรุณาใช้วิธีอื่นไปก่อน', zh: 'Google 登录尚未开启，请先使用其他方式登录。' };
    default:
      return { en: 'Google sign-in did not finish. Please try again.', th: 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่', zh: 'Google 登录未完成，请重试。' };
  }
}
