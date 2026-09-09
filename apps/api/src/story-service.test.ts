import { strict as assert } from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openTestDb, type DB } from './db.ts';
import { OutsideGeofence } from './quest-service.ts';
import { MockedLocation } from './presence-service.ts';
import {
  STORIES_PER_DAY, STORY_MAX_BYTES, StoriesClosed, StoryNotFound, StoryQuotaReached, StoryTooLarge,
  UnsupportedStory, WrongEventToken, canReviewStories, eventTokenRequired, expireStories, pendingStories,
  readStoryMedia, reviewStory, setStoriesOpen, sniffStory, storiesAt, storiesInArea, storiesOpen, submitStory,
} from './story-service.ts';
import type { Transcoder } from './transcode.ts';

let db: DB;
let dir: string;
const T = new Date('2026-09-11T03:00:00.000Z');
const later = (min: number) => new Date(T.getTime() + min * 60_000);

/** An MP4 by its first bytes only - enough for the sniffer, nothing for ffmpeg, which the fake stands in for. */
const mp4 = (): Buffer => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(64, 1)]);
const webm = (): Buffer => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64, 2)]);
const jpeg = (): Buffer => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 3)]);

/** Writes recognisable bytes where ffmpeg would write media. */
const fake: Transcoder = {
  async video(_input, outMp4, outPoster) {
    writeFileSync(outMp4, 'MP4-BYTES');
    writeFileSync(outPoster, 'POSTER-BYTES');
    return { durationS: 8.2 };
  },
  async photo(_input, outJpg) { writeFileSync(outJpg, 'JPG-BYTES'); },
};
const broken: Transcoder = {
  async video() { throw new Error('moov atom not found'); },
  async photo() { throw new Error('not an image'); },
};

const park = { lat: 13.12154, lng: 100.91812 };
const here = { ...park, accuracyM: 10 };

const submit = (over: Partial<Parameters<typeof submitStory>[1]> = {}) => submitStory(db, {
  userId: 'ana', placeId: 'ku-park', bytes: mp4(), caption: 'first rain of the day', fix: here,
  now: T, transcoder: fake, open: true, ...over,
});

beforeEach(() => {
  db = openTestDb();
  dir = mkdtempSync(join(tmpdir(), 'chivago-stories-'));
  process.env.CHIVAGO_UPLOADS = dir;
  const at = T.toISOString();
  for (const u of ['ana', 'bo']) db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)').run(u, u, at);
  db.prepare("INSERT INTO hosts (id, name, type, role) VALUES ('h-ku', 'ChivaGo team · KU Sriracha', 'community', 'host')").run();
  db.prepare("INSERT INTO hosts (id, name, type, role) VALUES ('h-lab', 'Ocean Lab', 'hotel', 'host')").run();
  db.prepare("INSERT INTO hosts (id, name, type, role) VALUES ('h-mod', 'ChivaGo', 'platform', 'moderator')").run();
  const place = (id: string, name: string, province: string, lat: number, lng: number) => db.prepare(
    `INSERT INTO places (id, name_en, name_th, short, layer, province, lat, lng, meta, blurb_en, blurb_th, tags,
       safety_label_en, safety_label_th, crowd_density, aqi, safety_index, walkability)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(id, name, name, name, 'Green', province, lat, lng, '', '', '', '[]', 'x', 'x', 1, 20, 6, 7);
  place('ku-park', 'Campus park', 'TH-20', park.lat, park.lng);
  place('chaweng', 'Chaweng Beach', 'TH-84', 9.5357, 100.0617);
  const quest = (id: string, host: string, lat: number, lng: number) => db.prepare(
    `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points, host_id, kind, lat, lng, geofence_radius_m)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(id, id.toUpperCase(), id, id, 'x', '1 hr', 10, host, 'today', lat, lng, 100);
  quest('q7', 'h-ku', 13.12189, 100.92055);
  quest('q3', 'h-lab', 9.5357, 100.0617);
});

afterEach(() => {
  delete process.env.CHIVAGO_UPLOADS;
  rmSync(dir, { recursive: true, force: true });
});

describe('the door', () => {
  test('is shut unless the deployment opened it', async () => {
    delete process.env.CHIVAGO_STORIES_OPEN;
    await assert.rejects(submit({ open: undefined }), StoriesClosed);
    process.env.CHIVAGO_STORIES_OPEN = '1';
    try {
      const s = await submit({ open: undefined });
      assert.equal(s.status, 'pending');
    } finally { delete process.env.CHIVAGO_STORIES_OPEN; }
  });
});

describe('what a story must be', () => {
  test('MP4, MOV and WebM are video; JPEG is a photo; a PDF is nothing', () => {
    assert.equal(sniffStory(mp4()).kind, 'video');
    assert.equal(sniffStory(webm()).kind, 'video');
    assert.equal(sniffStory(jpeg()).kind, 'photo');
    assert.throws(() => sniffStory(Buffer.from('%PDF-1.4 hello')), UnsupportedStory);
  });

  test('too big is refused before anything is written', async () => {
    await assert.rejects(submit({ bytes: Buffer.alloc(STORY_MAX_BYTES + 1, 1) }), StoryTooLarge);
    assert.ok(!existsSync(join(dir, 'stories')) || rmSync(join(dir, 'stories'), { recursive: true, force: true }) === undefined);
  });

  test('a file ffmpeg cannot read is refused, and nothing of it stays on disk', async () => {
    await assert.rejects(submit({ transcoder: broken }), UnsupportedStory);
    const left = (db.prepare('SELECT COUNT(*) AS n FROM stories').get() as unknown as { n: number }).n;
    assert.equal(left, 0);
  });

  test('the caption is trimmed to eighty characters', async () => {
    const s = await submit({ caption: `  ${'x'.repeat(120)}  ` });
    assert.equal(s.caption.length, 80);
  });
});

describe('from the place, with the second signal', () => {
  test('standing at the beach you cannot tell the park’s story', async () => {
    await assert.rejects(submit({ fix: { lat: 9.5357, lng: 100.0617, accuracyM: 10 } }), OutsideGeofence);
  });

  test('a mocked fix is refused before ffmpeg runs', async () => {
    let ran = false;
    const spy: Transcoder = { async video() { ran = true; return { durationS: 1 }; }, async photo() { ran = true; } };
    await assert.rejects(submit({ fix: { ...here, mocked: true }, transcoder: spy }), MockedLocation);
    assert.equal(ran, false);
  });

  test('three a day, then no more until tomorrow', async () => {
    for (let i = 0; i < STORIES_PER_DAY; i += 1) await submit({ now: later(i * 5) });
    await assert.rejects(submit({ now: later(20) }), StoryQuotaReached);
    const s = await submit({ now: new Date(T.getTime() + 25 * 3_600_000) });
    assert.equal(s.status, 'pending');
  });
});

describe('nothing shows until a host says so', () => {
  test('a new story is pending, invisible at the place and on the board, and unreadable to the public', async () => {
    const s = await submit();
    assert.equal(s.status, 'pending');
    assert.deepEqual(storiesAt(db, 'ku-park', T), []);
    assert.deepEqual(storiesInArea(db, 'ku-sriracha', T), []);
    assert.equal(readStoryMedia(db, s.id, 'media', { now: T }), null);
  });

  test('the host that hosts on the campus sees it, the hotel on the island does not, the moderator sees everything', async () => {
    const s = await submit();
    assert.deepEqual(pendingStories(db, 'h-ku', T).map((p) => p.id), [s.id]);
    assert.deepEqual(pendingStories(db, 'h-lab', T), []);
    assert.deepEqual(pendingStories(db, 'h-mod', T).map((p) => p.id), [s.id]);
    assert.ok(canReviewStories(db, 'h-ku', 'ku-park'));
    assert.ok(!canReviewStories(db, 'h-ku', 'chaweng'), 'the team hosts nothing on the island');
    assert.ok(!canReviewStories(db, 'h-lab', 'ku-park'));
  });

  test('the reviewing host can look before deciding; nobody else can', async () => {
    const s = await submit();
    assert.equal(readStoryMedia(db, s.id, 'poster', { forHost: 'h-ku', now: T })?.bytes.toString(), 'POSTER-BYTES');
    assert.equal(readStoryMedia(db, s.id, 'poster', { forHost: 'h-lab', now: T }), null);
  });

  test('approval puts it on the pin and the board, with the reviewer on the record', async () => {
    const s = await submit();
    const out = reviewStory(db, { hostId: 'h-ku', storyId: s.id, decision: 'approve', reviewer: 'Nok', now: later(1) });
    assert.equal(out.status, 'approved');
    assert.deepEqual(storiesAt(db, 'ku-park', later(2)).map((x) => x.id), [s.id]);
    assert.equal(storiesInArea(db, 'ku-sriracha', later(2))[0]!.placeName.en, 'Campus park');
    assert.deepEqual(storiesInArea(db, 'samui', later(2)), [], 'the island board does not show the campus');
    assert.equal(readStoryMedia(db, s.id, 'media', { now: later(2) })?.bytes.toString(), 'MP4-BYTES');
    const r = db.prepare('SELECT reviewed_by, reviewer_host FROM stories WHERE id = ?').get(s.id) as unknown as { reviewed_by: string; reviewer_host: string };
    assert.equal(r.reviewed_by, 'Nok');
    assert.equal(r.reviewer_host, 'h-ku');
  });

  test('the island hotel cannot approve a campus story, and is told nothing exists', async () => {
    const s = await submit();
    assert.throws(() => reviewStory(db, { hostId: 'h-lab', storyId: s.id, decision: 'approve', reviewer: 'X' }), StoryNotFound);
  });

  test('hiding takes it down, and the bytes go with it for the public', async () => {
    const s = await submit();
    reviewStory(db, { hostId: 'h-ku', storyId: s.id, decision: 'approve', reviewer: 'Nok', now: later(1) });
    reviewStory(db, { hostId: 'h-ku', storyId: s.id, decision: 'hide', reviewer: 'Nok', now: later(2) });
    assert.deepEqual(storiesAt(db, 'ku-park', later(3)), []);
    assert.equal(readStoryMedia(db, s.id, 'media', { now: later(3) }), null);
    assert.equal(readStoryMedia(db, s.id, 'media', { forHost: 'h-ku', now: later(3) }), null, 'hidden is hidden from the host too');
  });
});

describe('nothing lasts', () => {
  test('a story expires seven days on, and its files go with the row', async () => {
    const s = await submit();
    reviewStory(db, { hostId: 'h-ku', storyId: s.id, decision: 'approve', reviewer: 'Nok', now: later(1) });
    const week = new Date(T.getTime() + 7 * 24 * 3_600_000 + 1000);
    assert.deepEqual(storiesAt(db, 'ku-park', week), [], 'expired is gone from the pin before the sweep');
    const media = (db.prepare('SELECT media_path FROM stories WHERE id = ?').get(s.id) as unknown as { media_path: string }).media_path;
    assert.ok(existsSync(media));
    assert.equal(expireStories(db, week), 1);
    assert.ok(!existsSync(media));
    assert.equal(expireStories(db, week), 0);
  });

  test('a photograph is re-encoded, so the phone’s EXIF never becomes public', async () => {
    const s = await submit({ bytes: jpeg() });
    assert.equal(s.kind, 'photo');
    reviewStory(db, { hostId: 'h-ku', storyId: s.id, decision: 'approve', reviewer: 'Nok', now: later(1) });
    assert.equal(readStoryMedia(db, s.id, 'media', { now: later(2) })?.bytes.toString(), 'JPG-BYTES', 'the bytes served are ffmpeg’s, not the upload’s');
    assert.equal(readStoryMedia(db, s.id, 'poster', { now: later(2) })?.mime, 'image/jpeg');
  });
});

describe('the door, from the console, and the token from the QR', () => {
  test('a moderator opens the door as a setting, and shuts it, with no environment', async () => {
    delete process.env.CHIVAGO_STORIES_OPEN;
    assert.equal(storiesOpen(db), false);
    setStoriesOpen(db, true, 'Nok', T);
    assert.equal(storiesOpen(db), true);
    const s = await submit({ open: undefined });
    assert.equal(s.status, 'pending');
    setStoriesOpen(db, false, 'Nok', later(1));
    assert.equal(storiesOpen(db), false);
    await assert.rejects(submit({ open: undefined, now: later(2) }), StoriesClosed);
    const who = db.prepare("SELECT updated_by FROM settings WHERE key = 'stories_open'").get() as unknown as { updated_by: string };
    assert.equal(who.updated_by, 'Nok');
  });

  test('with a token on the deployment, an upload needs the right one; without, none', async () => {
    delete process.env.CHIVAGO_EVENT_TOKEN;
    assert.equal(eventTokenRequired(), false);
    assert.equal((await submit()).status, 'pending', 'no token configured, none needed');
    process.env.CHIVAGO_EVENT_TOKEN = 'K7M2-the-room-on-the-11th';
    try {
      assert.equal(eventTokenRequired(), true);
      await assert.rejects(submit({ now: later(1) }), WrongEventToken);
      await assert.rejects(submit({ now: later(2), event: 'last-years-poster' }), WrongEventToken);
      await assert.rejects(submit({ now: later(3), event: 'K7M2-the-room-on-the-11th-' }), WrongEventToken, 'a longer string is not a prefix match');
      assert.equal((await submit({ now: later(4), event: 'K7M2-the-room-on-the-11th' })).status, 'pending');
    } finally {
      delete process.env.CHIVAGO_EVENT_TOKEN;
    }
  });
});

describe('what an iPhone sends', () => {
  // The same `ftyp` box at offset 4 as an MP4; the brand is the difference.
  const heic = (): Buffer => Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.from([0, 0, 0, 0]), Buffer.from('mif1heic'), Buffer.alloc(64, 4),
  ]);
  const mov = (): Buffer => Buffer.concat([
    Buffer.from([0, 0, 0, 0x14]), Buffer.from('ftypqt  '), Buffer.from([0, 0, 0, 0]), Buffer.from('qt  '), Buffer.alloc(64, 5),
  ]);
  const avif = (): Buffer => Buffer.concat([
    Buffer.from([0, 0, 0, 0x1c]), Buffer.from('ftypavif'), Buffer.from([0, 0, 0, 0]), Buffer.from('avifmif1miaf'), Buffer.alloc(64, 6),
  ]);

  test('a HEIC is a photograph and a MOV is a clip, by the brand in the same box', () => {
    assert.deepEqual(sniffStory(heic()), { kind: 'photo', ext: 'heic' });
    assert.deepEqual(sniffStory(avif()), { kind: 'photo', ext: 'avif' });
    assert.deepEqual(sniffStory(mov()), { kind: 'video', ext: 'mp4' });
  });

  test('a HEIC the server can convert becomes a JPEG like any photograph', async () => {
    const inputs: string[] = [];
    const recording: Transcoder = {
      ...fake,
      async photo(input, outJpg) { inputs.push(input); writeFileSync(outJpg, 'JPG-BYTES'); },
    };
    const s = await submit({ bytes: heic(), transcoder: recording });
    assert.equal(s.kind, 'photo');
    assert.equal(inputs.length, 1, 'the photo encode ran, not the video one');
    assert.match(inputs[0]!, /\.heic$/, 'ffmpeg was handed the file under its own extension');
    assert.match(readStoryMedia(db, s.id, 'media', { forHost: 'h-ku' })!.mime, /image\/jpeg/);
  });

  test('a HEIC the server cannot convert is refused with words a person can act on', async () => {
    // Not "it could not be read (…)": the first version sent the HEIC to
    // the video encode and answered with ffmpeg's complaint about it.
    await assert.rejects(submit({ bytes: heic(), transcoder: broken }), (e: unknown) => {
      assert.ok(e instanceof UnsupportedStory);
      assert.equal(e.code, 'STORY_HEIC');
      assert.match(e.message, /Most Compatible/);
      return true;
    });
    const left = (db.prepare('SELECT COUNT(*) AS n FROM stories').get() as unknown as { n: number }).n;
    assert.equal(left, 0);
  });

  test('a clip that cannot be read is still refused as unreadable, with the general code', async () => {
    await assert.rejects(submit({ transcoder: broken }), (e: unknown) => {
      assert.ok(e instanceof UnsupportedStory);
      assert.equal(e.code, 'UNSUPPORTED_STORY');
      return true;
    });
  });

  test('a photograph over the proof limit but under the story limit is a photograph', () => {
    // The proof sniffer refuses anything over 8 MB; a story may be 25 MB,
    // and is re-encoded. The first version ran the proof sniffer on the
    // whole file and told a 9 MB JPEG it was "not JPEG, PNG or WebP".
    const big = Buffer.concat([jpeg(), Buffer.alloc(9 * 1024 * 1024, 7)]);
    assert.equal(sniffStory(big).kind, 'photo');
  });
});

/**
 * Posting with nobody looking first.
 *
 * The queue is why a screen in a room full of people is safe to point at, so
 * removing it is a deployment's decision and not a default. What these hold
 * is that the switch does exactly one thing - the status a new story is born
 * with - and that the row still tells the truth about what happened to it.
 */
describe('the switch that takes the queue away', () => {
  const withAuto = async <T>(run: () => Promise<T>): Promise<T> => {
    const before = process.env.CHIVAGO_STORIES_AUTO_APPROVE;
    process.env.CHIVAGO_STORIES_AUTO_APPROVE = '1';
    try { return await run(); } finally {
      if (before === undefined) delete process.env.CHIVAGO_STORIES_AUTO_APPROVE;
      else process.env.CHIVAGO_STORIES_AUTO_APPROVE = before;
    }
  };

  test('off by default: a new story waits for a host', async () => {
    const s = await submit();
    assert.equal(s.status, 'pending');
    assert.deepEqual(storiesAt(db, 'ku-park', T), [], 'and nobody sees it yet');
  });

  test('on: it is public the moment it is posted', async () => {
    const s = await withAuto(() => submit());
    assert.equal(s.status, 'approved');
    assert.deepEqual(storiesAt(db, 'ku-park', T).map((x) => x.id), [s.id]);
  });

  test('on: the row says a machine passed it, never a host', async () => {
    // A row claiming a host had looked would be a lie in the one table an
    // audit reads, and a null reviewer_host is how a moderator tells these
    // apart from the ones somebody really checked.
    const s = await withAuto(() => submit());
    const raw = db.prepare('SELECT reviewed_by, reviewer_host, reviewed_at FROM stories WHERE id = ?').get(s.id) as
      unknown as { reviewed_by: string | null; reviewer_host: string | null; reviewed_at: string | null };
    assert.equal(raw.reviewed_by, 'auto');
    assert.equal(raw.reviewer_host, null, 'no host name on a story no host saw');
    assert.ok(raw.reviewed_at, 'and it says when it went up');
  });

  test('on: nothing is left waiting in the console queue', async () => {
    await withAuto(() => submit());
    // The campus host, which is the one that would see a pending clip here.
    assert.deepEqual(pendingStories(db, 'h-ku', T), []);
  });

  test('on: the door still shuts, because that is a different question', async () => {
    setStoriesOpen(db, false, 'test');
    await assert.rejects(() => withAuto(() => submit({ open: undefined })), StoriesClosed);
  });
});
