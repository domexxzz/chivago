/**
 * Routes for the debris desk - see debris-desk-service.ts for who may see
 * what and why. Every state change carries the console's CSRF token, like the
 * SOS desk's: a forged "assign" would tell a reporter somebody is coming.
 */
import type { Context, Hono } from 'hono';
import type { DB } from '../db.ts';
import {
  DebrisDeskError, assignDebrisCase, closeDebrisCase, debrisCaseForDesk, debrisDesk, debrisDeskScope, dismissDebrisCase,
  readDebrisAfterPhotoForDesk, readDebrisPhotoForDesk, type DebrisDeskScope,
} from '../debris-desk-service.ts';
import type { HostSession } from '../host-auth.ts';
import { BodyTooLarge, boundedForm } from '../http.ts';
import { MAX_BYTES, UnsupportedUpload } from '../uploads.ts';
import { debrisCasePage, debrisDeskPage, debrisNotYoursPage } from './debris-desk.ts';
import type { Locale } from './i18n.ts';
import { messagePage } from './views.ts';

interface Deps {
  db: DB;
  currentSession: (c: Context) => HostSession | null;
  localeFor: (c: Context) => Locale;
  canModerate: (s: HostSession) => boolean;
  csrfFor: (s: HostSession) => string;
  csrfValid: (s: HostSession, submitted: unknown) => boolean;
}

const DESK = '/console/debris';

export function mountDebrisDesk(app: Hono, deps: Deps): void {
  const { db, currentSession, localeFor, canModerate, csrfFor, csrfValid } = deps;

  const chromeOf = (c: Context, s: HostSession) => ({
    locale: localeFor(c), hostName: s.hostName, reviewer: s.reviewer, canModerate: canModerate(s),
  });

  const casePage = (c: Context, s: HostSession, scope: DebrisDeskScope, caseId: string, problem?: string, status: 200 | 400 | 409 | 413 | 415 = 200) => {
    const detail = debrisCaseForDesk(db, scope, caseId);
    if (!detail) return c.html(messagePage(localeFor(c), 'notFound', 'notInYourQueue', DESK), 404);
    return c.html(debrisCasePage({ ...chromeOf(c, s), detail, csrf: csrfFor(s), problem }), status);
  };

  app.get('/debris', (c) => {
    const session = currentSession(c)!;
    const scope = debrisDeskScope(db, session);
    if (scope.length === 0) {
      return c.html(debrisNotYoursPage({ ...chromeOf(c, session), municipality: session.hostType === 'municipality' }), 403);
    }
    return c.html(debrisDeskPage({ ...chromeOf(c, session), desk: debrisDesk(db, scope) }));
  });

  // Registered before `/debris/:id` for the reader, though the segment count already keeps them apart.
  app.get('/debris/photo/:reportId', async (c) => {
    const session = currentSession(c)!;
    const photo = await readDebrisPhotoForDesk(db, debrisDeskScope(db, session), c.req.param('reportId'));
    if (!photo) return c.text('Not found', 404);
    return c.body(new Uint8Array(photo.bytes), 200, {
      'content-type': photo.mime,
      // A reporter's photograph: never in a shared cache, never kept after the tab closes.
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    });
  });

  app.get('/debris/:id', (c) => {
    const session = currentSession(c)!;
    return casePage(c, session, debrisDeskScope(db, session), c.req.param('id'));
  });

  const decision = (action: 'assign' | 'dismiss') => async (c: Context) => {
    const session = currentSession(c)!;
    const caseId = c.req.param('id') ?? '';
    const form = await c.req.parseBody();
    if (!csrfValid(session, form.csrf)) {
      return c.html(messagePage(localeFor(c), 'sessionExpired', 'signInAgain', `${DESK}/${caseId}`), 403);
    }
    const scope = debrisDeskScope(db, session);
    const actor = session.reviewer ?? session.hostName;
    try {
      if (action === 'assign') assignDebrisCase(db, scope, caseId, actor, String(form.note ?? ''));
      else dismissDebrisCase(db, scope, caseId, actor, String(form.reason ?? ''));
      return c.redirect(`${DESK}/${caseId}`, 303);
    } catch (err) {
      if (!(err instanceof DebrisDeskError)) throw err;
      if (err.code === 'NOT_FOUND') return c.html(messagePage(localeFor(c), 'notFound', 'notInYourQueue', DESK), 404);
      const locale = localeFor(c);
      const problem = err.code === 'REASON_REQUIRED'
        ? (locale === 'en' ? 'Say why it is being closed: the reporter is shown that it was closed.'
          : locale === 'zh' ? '请说明结案原因：报告人会看到已结案。'
            : 'กรุณาระบุเหตุผล ผู้รายงานจะเห็นว่าเคสถูกปิด')
        : (locale === 'en' ? 'This case has already been decided.' : locale === 'zh' ? '此案件已有决定。' : 'เคสนี้ตัดสินไปแล้ว');
      return casePage(c, session, scope, caseId, problem, err.code === 'REASON_REQUIRED' ? 400 : 409);
    }
  };

  app.post('/debris/:id/assign', decision('assign'));
  app.post('/debris/:id/dismiss', decision('dismiss'));

  /*
    Closing the job (F7). Multipart, because the after photo rides with it,
    and read with a ceiling like every other upload here. The token is in the
    form, so it is checked once the form is read and before anything is kept.
  */
  app.post('/debris/:id/close', async (c) => {
    const session = currentSession(c)!;
    const caseId = c.req.param('id');
    const locale = localeFor(c);
    const scope = debrisDeskScope(db, session);
    const said = (en: string, th: string, zh: string) => (locale === 'en' ? en : locale === 'zh' ? zh : th);
    let form: FormData;
    try {
      form = await boundedForm(c, MAX_BYTES + 64 * 1024);
    } catch (err) {
      if (!(err instanceof BodyTooLarge)) throw err;
      return casePage(c, session, scope, caseId, said('The photo is too large to send.', 'รูปใหญ่เกินกว่าจะส่งได้', '照片太大，无法发送。'), 413);
    }
    if (!csrfValid(session, form.get('csrf'))) {
      return c.html(messagePage(locale, 'sessionExpired', 'signInAgain', `${DESK}/${caseId}`), 403);
    }
    const photo = form.get('afterPhoto');
    // One answer on the form: 'none', or how much is left. Nothing else maps to an outcome.
    const left = form.get('left');
    const outcome = left === 'none' ? 'all' : typeof left === 'string' && left !== '' ? 'partial' : undefined;
    try {
      await closeDebrisCase(db, scope, caseId, session.reviewer ?? session.hostName, {
        weightKg: form.get('weightKg') ?? undefined,
        foundKinds: form.getAll('foundKinds'),
        outcome,
        leftAmount: outcome === 'partial' ? left : undefined,
        afterPhoto: photo instanceof File && photo.size > 0 ? Buffer.from(await photo.arrayBuffer()) : null,
      });
      return c.redirect(`${DESK}/${caseId}`, 303);
    } catch (err) {
      if (err instanceof UnsupportedUpload) {
        return casePage(c, session, scope, caseId, said('The after photo must be a JPEG, PNG or WebP.', 'รูปหลังเก็บต้องเป็น JPEG, PNG หรือ WebP', '清理后照片必须是 JPEG、PNG 或 WebP。'), 415);
      }
      if (!(err instanceof DebrisDeskError)) throw err;
      if (err.code === 'NOT_FOUND') return c.html(messagePage(locale, 'notFound', 'notInYourQueue', DESK), 404);
      const problem = {
        WEIGHT_REQUIRED: said('Weigh it first: the weight in kilograms, as the scale read.', 'ชั่งก่อน ใส่น้ำหนักเป็นกิโลกรัมตามที่ตาชั่งอ่านได้', '请先称重：填写秤上读数（公斤）。'),
        OUTCOME_REQUIRED: said('Say what is left on the sand: nothing, or how much.', 'ระบุว่าเหลืออะไรบนหาด ไม่เหลือ หรือเหลือมากแค่ไหน', '请说明沙滩上还剩什么：没有，或剩多少。'),
        LEFT_REQUIRED: said('Say how much is left, so the rest goes back on the queue.', 'ระบุว่าเหลือมากแค่ไหน ส่วนที่เหลือจะกลับเข้าคิว', '请说明剩余多少，以便重新排队。'),
        NOT_OPEN: said('This case has already been decided.', 'เคสนี้ตัดสินไปแล้ว', '此案件已有决定。'),
        REASON_REQUIRED: said('Say why.', 'กรุณาระบุเหตุผล', '请说明原因。'),
      }[err.code];
      return casePage(c, session, scope, caseId, problem, err.code === 'NOT_OPEN' ? 409 : 400);
    }
  });

  app.get('/debris/after/:caseId', async (c) => {
    const session = currentSession(c)!;
    const photo = await readDebrisAfterPhotoForDesk(db, debrisDeskScope(db, session), c.req.param('caseId'));
    if (!photo) return c.text('Not found', 404);
    return c.body(new Uint8Array(photo.bytes), 200, {
      'content-type': photo.mime, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
    });
  });
}
