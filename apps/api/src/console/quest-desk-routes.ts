/** The routes behind `quest-desk.ts`. Mounted by `routes.ts`, behind its session check. */

import type { Context, Hono } from 'hono';
import { AREAS, inArea, type Bilingual, type HostQuestInput } from '@chivago/core';
import { row, rows, type DB } from '../db.ts';
import type { HostSession } from '../host-auth.ts';
import {
  HostQuestRefused, closeHostQuest, createHostQuest, discardHostQuest, editHostQuest, hostQuestById,
  hostQuestsOf, hostQuestsToReview, publishHostQuest, returnHostQuest, submitHostQuest,
} from '../host-quest-service.ts';
import { participationByFaculty } from '../student-service.ts';
import type { Locale } from './i18n.ts';
import { EMPTY_QUEST_FORM, formOf, fromLocalInput, questDeskPage, type DeskPlace, type QuestForm } from './quest-desk.ts';
import { messagePage } from './views.ts';

interface Deps {
  db: DB;
  currentSession: (c: Context) => HostSession | null;
  localeFor: (c: Context) => Locale;
  canModerate: (s: HostSession) => boolean;
  csrfFor: (s: HostSession) => string;
  csrfValid: (s: HostSession, submitted: unknown) => boolean;
}

const DESK = '/console/quest-desk';
const universities = AREAS.filter((a) => a.university);

interface PlaceRow { id: string; name_en: string; name_th: string; lat: number; lng: number }

function campusPlaces(db: DB): DeskPlace[] {
  const found = rows<PlaceRow>(
    db.prepare('SELECT id, name_en, name_th, lat, lng FROM places WHERE admin_hidden_at IS NULL ORDER BY name_en').all(),
  );
  return universities.flatMap((area) => found
    .filter((p) => inArea(area, p) && p.lat >= area.bbox.minLat && p.lat <= area.bbox.maxLat
      && p.lng >= area.bbox.minLng && p.lng <= area.bbox.maxLng)
    .map((p) => ({ id: p.id, areaName: area.name, nameEn: p.name_en, nameTh: p.name_th })));
}

function readForm(body: Record<string, unknown>): QuestForm {
  const text = (key: keyof QuestForm): string => String(body[key] ?? '').slice(0, 200);
  return Object.fromEntries(
    (Object.keys(EMPTY_QUEST_FORM) as (keyof QuestForm)[]).map((key) => [key, text(key)]),
  ) as unknown as QuestForm;
}

/** An empty number box is not a zero: `Number('')` is, and 0,0 is in the sea. */
const number = (value: string): number => (value.trim() === '' ? Number.NaN : Number(value));

function toInput(db: DB, form: QuestForm): HostQuestInput {
  const place = form.placeId === ''
    ? undefined
    : row<{ lat: number; lng: number }>(db.prepare('SELECT lat, lng FROM places WHERE id = ?').get(form.placeId));
  return {
    area: form.area,
    nameEn: form.nameEn, nameTh: form.nameTh, whereEn: form.whereEn, whereTh: form.whereTh,
    minutes: number(form.minutes), rewardPoints: number(form.rewardPoints), rewardCurrency: form.rewardCurrency,
    lat: place?.lat ?? number(form.lat), lng: place?.lng ?? number(form.lng),
    radiusM: number(form.radiusM), seats: number(form.seats),
    startsAt: fromLocalInput(form.startsAt), endsAt: fromLocalInput(form.endsAt),
  };
}

export function mountQuestDesk(app: Hono, deps: Deps): void {
  const { db, currentSession, localeFor, canModerate, csrfFor, csrfValid } = deps;

  const draw = (c: Context, session: HostSession, shown: { form?: QuestForm; editId?: string; problems?: Bilingual[] }) => {
    const wanted = shown.editId ? hostQuestById(db, shown.editId) : null;
    const editing = wanted && wanted.hostId === session.hostId && (wanted.status === 'draft' || wanted.status === 'returned')
      ? wanted : null;
    const problems = shown.problems ?? [];
    return c.html(questDeskPage({
      locale: localeFor(c), hostName: session.hostName, canModerate: canModerate(session), csrf: csrfFor(session),
      own: hostQuestsOf(db, session.hostId),
      toReview: canModerate(session) ? hostQuestsToReview(db, session.hostId) : [],
      editing,
      form: shown.form ?? (editing ? formOf(editing) : { ...EMPTY_QUEST_FORM, area: universities[0]?.key ?? '' }),
      areas: universities, places: campusPlaces(db), problems,
      faculties: participationByFaculty(db, session.hostId),
    }), problems.length > 0 ? 400 : 200);
  };

  /** Session, CSRF, then the act; a refusal is redrawn in the writer's words. */
  const act = (
    path: string,
    run: (args: { session: HostSession; id: string; body: Record<string, unknown>; form: QuestForm }) => void,
    opts: { reviewer?: boolean; keepForm?: boolean } = {},
  ) => app.post(path, async (c) => {
    const session = currentSession(c)!;
    if (opts.reviewer && !canModerate(session)) return c.text('Not found', 404);
    const body = await c.req.parseBody();
    if (!csrfValid(session, body.csrf)) {
      return c.html(messagePage(localeFor(c), 'sessionExpired', 'signInAgain', DESK), 403);
    }
    const id = c.req.param('id') ?? '';
    const form = readForm(body);
    try {
      run({ session, id, body, form });
    } catch (err) {
      if (!(err instanceof HostQuestRefused)) throw err;
      return draw(c, session, { problems: err.problems, ...(opts.keepForm ? { form, editId: id } : {}) });
    }
    return c.redirect(DESK, 303);
  });

  app.get('/quest-desk', (c) => draw(c, currentSession(c)!, { editId: c.req.query('edit') }));

  act('/quest-desk', ({ session, form }) => {
    createHostQuest(db, session.hostId, session.reviewer, toInput(db, form));
  }, { keepForm: true });
  act('/quest-desk/:id/edit', ({ session, id, form }) => {
    editHostQuest(db, session.hostId, id, toInput(db, form));
  }, { keepForm: true });
  act('/quest-desk/:id/submit', ({ session, id }) => { submitHostQuest(db, session.hostId, id); });
  act('/quest-desk/:id/discard', ({ session, id }) => { discardHostQuest(db, session.hostId, id); });
  act('/quest-desk/:id/close', ({ session, id }) => { closeHostQuest(db, session.hostId, id); });
  act('/quest-desk/:id/publish', ({ session, id }) => {
    publishHostQuest(db, { hostId: session.hostId, name: session.reviewer }, id);
  }, { reviewer: true });
  act('/quest-desk/:id/return', ({ session, id, body }) => {
    returnHostQuest(db, { hostId: session.hostId, name: session.reviewer }, id, String(body.reason ?? ''));
  }, { reviewer: true });
}
