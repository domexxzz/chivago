/**
 * Stories: a short clip or a photograph, pinned on a place by someone who
 * was standing there.
 *
 * Built for one day - the pitch at the Si Racha campus (docs/42) - and kept
 * honest the way everything else here is:
 *
 *   CLOSED UNLESS OPENED. Uploads are refused unless the deployment says
 *   `CHIVAGO_STORIES_OPEN=1`. The switch is thrown at the door on the day
 *   and back after the talk; a QR code photographed and shared a week later
 *   finds the door shut.
 *
 *   FROM THE PLACE. The same 250 m fence a check-in uses, and the second
 *   signal under it (docs/30): a mocked or coarse fix is refused, and the
 *   fix is remembered like any other.
 *
 *   NOTHING SHOWS UNTIL A HOST SAYS SO. A story is `pending` until a host
 *   who hosts in that area approves it, on the console, on stage. The big
 *   screen never shows an unreviewed clip - one stranger with one clip is
 *   how a pitch ends.
 *
 *   NOBODY IS NAMED, AND NOTHING LASTS. No display name exists to show.
 *   The media is re-encoded, which strips the phone's EXIF, position
 *   included. Every story expires seven days after it was made and the
 *   file goes with the row.
 */

import { randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHECKIN_RADIUS_M, areaByKey, areaOfProvince, inArea, isAreaKey, metresBetween,
  type AreaKey, type Bilingual, type Fix,
} from '@chivago/core';
import { row, rows, type DB } from './db.ts';
import { OutsideGeofence } from './quest-service.ts';
import { assertPresence, recordFix } from './presence-service.ts';
import { fenceOff, storiesAutoApprove } from './fence.ts';
import { UnsupportedUpload, sniff, uploadRoot } from './uploads.ts';
import { ffmpegTranscoder, type Transcoder } from './transcode.ts';

export const STORY_MAX_BYTES = 25 * 1024 * 1024;
/**
 * The ceiling on the whole multipart request: the file, plus the caption,
 * the position and the boundaries around them. Checked at the route before
 * the body is read (`boundedForm`), so an oversize is refused from its
 * `content-length` or cut as it streams, never buffered whole.
 */
export const STORY_FORM_MAX_BYTES = STORY_MAX_BYTES + 64 * 1024;
export const STORY_CAPTION_MAX = 80;
/** Three a day. Enough to tell a story, not enough to paper a pin. */
export const STORIES_PER_DAY = 3;
export const STORY_TTL_DAYS = 7;
export const STORY_RADIUS_M = CHECKIN_RADIUS_M;

export type StoryKind = 'video' | 'photo';
export type StoryStatus = 'pending' | 'approved' | 'hidden';

export class StoriesClosed extends Error {
  constructor() {
    super('Stories are not open right now. They open at the event, at the place.');
    this.name = 'StoriesClosed';
  }
}
export class WrongEventToken extends Error {
  constructor() {
    super('This is not the event this door is open for. Scan the code in the room.');
    this.name = 'WrongEventToken';
  }
}
export class StoryQuotaReached extends Error {
  constructor() {
    super(`That is ${STORIES_PER_DAY} stories today already. Tomorrow is another day.`);
    this.name = 'StoryQuotaReached';
  }
}
export class StoryTooLarge extends Error {
  constructor() {
    super(`A story must be under ${Math.floor(STORY_MAX_BYTES / 1024 / 1024)} MB. Ten seconds is plenty.`);
    this.name = 'StoryTooLarge';
  }
}
export class UnsupportedStory extends Error {
  /**
   * `UNSUPPORTED_STORY` for most refusals; `STORY_HEIC` when the file was an
   * iPhone HEIC photograph this server's ffmpeg could not read, which the
   * app answers with its own words (Settings › Camera › Most Compatible).
   */
  readonly code: 'UNSUPPORTED_STORY' | 'STORY_HEIC';
  constructor(detail: string, code: 'UNSUPPORTED_STORY' | 'STORY_HEIC' = 'UNSUPPORTED_STORY') {
    super(`That file could not be used as a story: ${detail}.`);
    this.name = 'UnsupportedStory';
    this.code = code;
  }
}
export class StoryNotFound extends Error {
  constructor() {
    super('No story has that id, or it is not yours to review.');
    this.name = 'StoryNotFound';
  }
}
export class UnknownPlace extends Error {
  constructor(id: string) {
    super(`No place has the id ${id}.`);
    this.name = 'UnknownPlace';
  }
}

/**
 * The door (docs/46). Two handles: a moderator's switch in the console, kept
 * in `settings` so it takes effect on the next request with no restart; or
 * `CHIVAGO_STORIES_OPEN=1` in the environment, for a rehearsal. Read at
 * each upload.
 */
export function storiesOpen(db: DB): boolean {
  if (process.env.CHIVAGO_STORIES_OPEN === '1') return true;
  const r = row<{ value: string }>(db.prepare("SELECT value FROM settings WHERE key = 'stories_open'").get());
  return r?.value === '1';
}

/** Open or shut the door, and remember who did. */
export function setStoriesOpen(db: DB, open: boolean, by: string | null, now = new Date()): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('stories_open', ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  ).run(open ? '1' : '0', now.toISOString(), by);
}

/**
 * The token the QR codes carry (docs/46). Set on the deployment for the day,
 * it must come with every upload; unset, nothing is required - the dev
 * server and the tests. Compared in constant time, like any secret.
 */
export const eventTokenRequired = (): boolean => (process.env.CHIVAGO_EVENT_TOKEN ?? '') !== '';

export function eventTokenOk(given: string | null): boolean {
  const want = process.env.CHIVAGO_EVENT_TOKEN ?? '';
  if (want === '') return true;
  if (!given) return false;
  const a = Buffer.from(want);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The `ftyp` brands that mean a still picture in an ISO container. An
 * iPhone's HEIC has the same `ftyp` box at offset 4 as an MP4 or a MOV; the
 * brand is the difference. AVIF is the same box with an AV1 picture in it.
 */
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

/** The major brand of an `ftyp` box, and the compatible brands after it. */
function ftypBrands(bytes: Buffer): string[] {
  const size = bytes.readUInt32BE(0);
  const end = Math.min(bytes.length, size >= 16 ? size : 32);
  const brands: string[] = [];
  // The major brand at 8; a minor version at 12; compatible brands from 16.
  for (let at = 8; at + 4 <= end; at += at === 8 ? 8 : 4) brands.push(bytes.subarray(at, at + 4).toString('ascii'));
  return brands;
}

/** How much of a file the photograph signatures need. */
const SNIFF_BYTES = 64;

/**
 * What the bytes are, from the bytes. MP4 and MOV both open with an `ftyp`
 * box at offset 4 - and so does an iPhone's HEIC, which is a photograph and
 * goes to the photo encode, not the video one. WebM is Matroska's EBML
 * header. Everything else goes through the proof sniffer's JPEG, PNG and
 * WebP signatures, on a prefix only: the proof sniffer's own size ceiling
 * is a proof's, and a story's is checked before it gets here. The declared
 * content type is not consulted.
 */
export function sniffStory(bytes: Buffer): { kind: StoryKind; ext: string } {
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brands = ftypBrands(bytes);
    // AVIF first: an AVIF lists `mif1` among its compatible brands, a HEIC
    // never lists `avif`.
    if (brands.some((b) => AVIF_BRANDS.has(b))) return { kind: 'photo', ext: 'avif' };
    if (brands.some((b) => HEIF_BRANDS.has(b))) return { kind: 'photo', ext: 'heic' };
    return { kind: 'video', ext: 'mp4' };
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { kind: 'video', ext: 'webm' };
  }
  try {
    return { kind: 'photo', ext: sniff(bytes.subarray(0, SNIFF_BYTES)).ext };
  } catch (e) {
    if (e instanceof UnsupportedUpload) throw new UnsupportedStory('only MP4, MOV, WebM, HEIC, JPEG, PNG and WebP are accepted');
    throw e;
  }
}

export interface Story {
  id: string;
  placeId: string;
  kind: StoryKind;
  caption: string;
  status: StoryStatus;
  createdAt: string;
  expiresAt: string;
  durationS: number | null;
  /** Relative to the API. The client prefixes its base. */
  media: string;
  poster: string;
}

interface StoryRow {
  id: string; place_id: string; user_id: string; kind: StoryKind; caption: string;
  media_path: string; media_mime: string; poster_path: string | null; duration_s: number | null;
  status: StoryStatus; created_at: string; expires_at: string;
  reviewed_at: string | null; reviewed_by: string | null; reviewer_host: string | null;
}

const SELECT = `SELECT id, place_id, user_id, kind, caption, media_path, media_mime, poster_path, duration_s,
  status, created_at, expires_at, reviewed_at, reviewed_by, reviewer_host FROM stories`;

const toStory = (r: StoryRow): Story => ({
  id: r.id,
  placeId: r.place_id,
  kind: r.kind,
  caption: r.caption,
  status: r.status,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  durationS: r.duration_s,
  media: `/stories/${r.id}/media`,
  poster: `/stories/${r.id}/poster`,
});

const storiesDir = (): string => {
  const dir = join(uploadRoot(), 'stories');
  mkdirSync(dir, { recursive: true });
  return dir;
};

interface PlaceRef { id: string; lat: number; lng: number; province: string | null; name_en: string; name_th: string }

const placeRef = (db: DB, id: string): PlaceRef => {
  const p = row<PlaceRef>(db.prepare('SELECT id, lat, lng, province, name_en, name_th FROM places WHERE id = ?').get(id));
  if (!p) throw new UnknownPlace(id);
  return p;
};

const areaOfPlace = (p: PlaceRef): AreaKey => areaOfProvince(p.province ?? 'TH-84');

/**
 * Take a story. The order is the cheapest refusal first: the door, the size,
 * the bytes, the place, the fence, the second signal, the quota - and only
 * then ffmpeg, which is the expensive step and the one that writes to disk.
 */
export async function submitStory(
  db: DB,
  args: {
    userId: string;
    placeId: string;
    bytes: Buffer;
    caption: string;
    fix: Fix;
    now?: Date;
    /** Tests hand in a transcoder that writes bytes; production runs ffmpeg. */
    transcoder?: Transcoder;
    /** Tests open the door without an env var. */
    open?: boolean;
    /** The event token from the QR code, when the deployment set one. */
    event?: string | null;
  },
): Promise<Story> {
  const now = args.now ?? new Date();
  if (!(args.open ?? storiesOpen(db))) throw new StoriesClosed();
  if (!eventTokenOk(args.event ?? null)) throw new WrongEventToken();
  if (args.bytes.length > STORY_MAX_BYTES) throw new StoryTooLarge();
  if (args.bytes.length === 0) throw new UnsupportedStory('the file is empty');
  const caption = args.caption.trim().slice(0, STORY_CAPTION_MAX);
  const { kind, ext } = sniffStory(args.bytes);

  const place = placeRef(db, args.placeId);
  const distance = metresBetween(args.fix, place);
  if (!fenceOff()) {
    if (distance > STORY_RADIUS_M) throw new OutsideGeofence(distance, STORY_RADIUS_M);
    assertPresence(db, { userId: args.userId, fix: args.fix, radiusM: STORY_RADIUS_M, now });
  }

  const since = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const today = row<{ n: number }>(
    db.prepare('SELECT COUNT(*) AS n FROM stories WHERE user_id = ? AND created_at >= ?').get(args.userId, since),
  )?.n ?? 0;
  if (today >= STORIES_PER_DAY) throw new StoryQuotaReached();

  const id = randomUUID();
  const dir = storiesDir();
  const input = join(dir, `${id}.in.${ext}`);
  const media = join(dir, kind === 'video' ? `${id}.mp4` : `${id}.jpg`);
  const poster = kind === 'video' ? join(dir, `${id}.poster.jpg`) : media;
  writeFileSync(input, args.bytes);

  const transcoder = args.transcoder ?? ffmpegTranscoder;
  let durationS: number | null = null;
  try {
    if (kind === 'video') durationS = (await transcoder.video(input, media, poster)).durationS;
    else await transcoder.photo(input, media);
  } catch (e) {
    for (const f of [input, media, poster]) rmSync(f, { force: true });
    // An iPhone photograph on a server whose ffmpeg predates HEIF is the one
    // refusal a person can do something about from where they stand.
    if (ext === 'heic') {
      throw new UnsupportedStory(
        'an iPhone HEIC photograph could not be converted here - set Settings › Camera › Formats to Most Compatible, or send it as a JPEG',
        'STORY_HEIC',
      );
    }
    throw new UnsupportedStory(`it could not be read (${(e as Error).message})`);
  } finally {
    rmSync(input, { force: true });
  }

  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + STORY_TTL_DAYS * 24 * 3_600_000).toISOString();
  /*
    Straight to approved when this deployment has turned the queue off.

    The reviewer columns are filled in with what actually happened rather
    than left null or, worse, stamped with a host's name. A row that said a
    host had passed it would be a lie in the one table an audit would read,
    and `reviewer_host: null` next to `status: approved` is exactly the
    signal a moderator needs to tell these apart from the reviewed ones.
  */
  const auto = storiesAutoApprove();
  db.prepare(
    `INSERT INTO stories (id, place_id, user_id, kind, caption, media_path, media_mime, poster_path,
       duration_s, status, created_at, expires_at, reviewed_at, reviewed_by, reviewer_host)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id, place.id, args.userId, kind, caption, media, kind === 'video' ? 'video/mp4' : 'image/jpeg',
    poster, durationS, auto ? 'approved' : 'pending', createdAt, expiresAt,
    auto ? createdAt : null, auto ? 'auto' : null, null,
  );
  recordFix(db, args.userId, args.fix, now);

  return toStory(row<StoryRow>(db.prepare(`${SELECT} WHERE id = ?`).get(id))!);
}

/** What anyone sees at a place: approved, unexpired, newest first. */
export function storiesAt(db: DB, placeId: string, now = new Date()): Story[] {
  return rows<StoryRow>(
    db.prepare(`${SELECT} WHERE place_id = ? AND status = 'approved' AND expires_at > ? ORDER BY created_at DESC`)
      .all(placeId, now.toISOString()),
  ).map(toStory);
}

export interface AreaStory extends Story {
  placeName: Bilingual;
}

/** The board's feed: every approved story in an area, newest first. */
export function storiesInArea(db: DB, areaKey: string, now = new Date()): AreaStory[] {
  if (!isAreaKey(areaKey)) return [];
  const area = areaByKey(areaKey);
  return rows<StoryRow & { name_en: string; name_th: string; lat: number; lng: number }>(
    db.prepare(
      `SELECT s.*, p.name_en, p.name_th, p.lat, p.lng FROM stories s JOIN places p ON p.id = s.place_id
       WHERE s.status = 'approved' AND s.expires_at > ? ORDER BY s.created_at DESC`,
    ).all(now.toISOString()),
  )
    .filter((r) => inArea(area, r))
    .map((r) => ({ ...toStory(r), placeName: { en: r.name_en, th: r.name_th } }));
}

/**
 * A host reviews where it hosts. A moderator reviews anywhere; any other
 * host may review stories at places in an area where it has a quest - the
 * team on the campus, the municipality on the island. A hotel with one quest
 * on the island cannot touch a story on the campus.
 */
export function canReviewStories(db: DB, hostId: string, placeId: string): boolean {
  const host = row<{ role: string }>(db.prepare('SELECT role FROM hosts WHERE id = ?').get(hostId));
  if (!host) return false;
  if (host.role === 'moderator') return true;
  const place = row<PlaceRef>(db.prepare('SELECT id, lat, lng, province, name_en, name_th FROM places WHERE id = ?').get(placeId));
  if (!place) return false;
  const area = areaByKey(areaOfPlace(place));
  const quests = rows<{ lat: number; lng: number }>(db.prepare('SELECT lat, lng FROM quests WHERE host_id = ?').all(hostId));
  return quests.some((q) => inArea(area, q));
}

export interface PendingStory extends Story {
  placeName: Bilingual;
}

/** What a host has waiting: pending, unexpired, in the areas it hosts, oldest first. */
export function pendingStories(db: DB, hostId: string, now = new Date()): PendingStory[] {
  return rows<StoryRow & { name_en: string; name_th: string }>(
    db.prepare(
      `SELECT s.*, p.name_en, p.name_th FROM stories s JOIN places p ON p.id = s.place_id
       WHERE s.status = 'pending' AND s.expires_at > ? ORDER BY s.created_at ASC`,
    ).all(now.toISOString()),
  )
    .filter((r) => canReviewStories(db, hostId, r.place_id))
    .map((r) => ({ ...toStory(r), placeName: { en: r.name_en, th: r.name_th } }));
}

/** The host's decision, recorded with the reviewer's name. Approve, or hide - and either can be undone by the other. */
export function reviewStory(
  db: DB,
  args: { hostId: string; storyId: string; decision: 'approve' | 'hide'; reviewer: string | null; now?: Date },
): Story {
  const r = row<StoryRow>(db.prepare(`${SELECT} WHERE id = ?`).get(args.storyId));
  if (!r || !canReviewStories(db, args.hostId, r.place_id)) throw new StoryNotFound();
  const status: StoryStatus = args.decision === 'approve' ? 'approved' : 'hidden';
  db.prepare('UPDATE stories SET status = ?, reviewed_at = ?, reviewed_by = ?, reviewer_host = ? WHERE id = ?')
    .run(status, (args.now ?? new Date()).toISOString(), args.reviewer, args.hostId, args.storyId);
  return toStory(row<StoryRow>(db.prepare(`${SELECT} WHERE id = ?`).get(args.storyId))!);
}

export interface StoryBlob { bytes: Buffer; mime: string }

/**
 * The bytes. Public only once approved and unexpired; a host that may review
 * the story reads it while it is pending, to decide. Never a hidden one.
 */
export function readStoryMedia(
  db: DB, storyId: string, which: 'media' | 'poster', opts: { forHost?: string; now?: Date } = {},
): StoryBlob | null {
  const r = row<StoryRow>(db.prepare(`${SELECT} WHERE id = ?`).get(storyId));
  if (!r) return null;
  const now = opts.now ?? new Date();
  const live = r.status === 'approved' && r.expires_at > now.toISOString();
  const reviewing = opts.forHost !== undefined && r.status !== 'hidden' && canReviewStories(db, opts.forHost, r.place_id);
  if (!live && !reviewing) return null;
  const path = which === 'poster' ? (r.poster_path ?? r.media_path) : r.media_path;
  if (!existsSync(path)) return null;
  return { bytes: readFileSync(path), mime: which === 'poster' ? 'image/jpeg' : r.media_mime };
}

/**
 * The public media route's validator: a tag for a live story's bytes, null
 * for anything the public may not have. The bytes never change while a
 * story is live, so the id and the side are the whole tag; a browser's
 * `if-none-match` is answered from the row alone, without reading the file,
 * and a hidden or expired story stops answering at all.
 */
export function storyEtag(db: DB, storyId: string, which: 'media' | 'poster', now = new Date()): string | null {
  const r = row<{ status: StoryStatus; expires_at: string }>(
    db.prepare('SELECT status, expires_at FROM stories WHERE id = ?').get(storyId),
  );
  if (!r || r.status !== 'approved' || r.expires_at <= now.toISOString()) return null;
  return `"${storyId}-${which}"`;
}

/** Seven days on, the row and its files go. Returns how many went. */
export function expireStories(db: DB, now = new Date()): number {
  const gone = rows<StoryRow>(db.prepare(`${SELECT} WHERE expires_at <= ?`).all(now.toISOString()));
  for (const r of gone) {
    rmSync(r.media_path, { force: true });
    if (r.poster_path) rmSync(r.poster_path, { force: true });
    db.prepare('DELETE FROM stories WHERE id = ?').run(r.id);
  }
  return gone.length;
}
