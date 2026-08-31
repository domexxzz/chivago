/**
 * Proof photo storage.
 *
 * WHY THIS EXISTS
 * The mobile app captures photos and holds phone-local `file://` URIs. Those
 * are meaningless to anyone else, so before the console could show a reviewer
 * anything, the bytes had to actually arrive somewhere.
 *
 * Local disk is the right call for the pilot: one small VPS on the island, a
 * few hundred photos a week, and no object-store bill. `storagePath` is the
 * only thing that changes when this moves to S3/R2.
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { row, type DB } from './db.ts';

/**
 * 8 MB. A modern phone photo at reasonable quality is 2-4 MB; the app already
 * compresses to 0.7. Anything larger is a mistake or an attack, and a beach
 * site on one bar of signal cannot upload it anyway.
 */
export const MAX_BYTES = 8 * 1024 * 1024;

export const MAX_PHOTOS_PER_PROOF = 3;

/**
 * Allowed types, checked against the file's own magic bytes rather than the
 * declared Content-Type. A client can claim anything; the first bytes of the
 * file are harder to lie about.
 */
const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: 'png',
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

export class UnsupportedUpload extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedUpload';
  }
}

/** Identify a file by its magic bytes. Throws if it is not an image we accept. */
export function sniff(bytes: Buffer): { mime: string; ext: string } {
  if (bytes.length === 0) throw new UnsupportedUpload('The file is empty.');
  if (bytes.length > MAX_BYTES) {
    throw new UnsupportedUpload(`Photos must be under ${Math.floor(MAX_BYTES / 1024 / 1024)} MB.`);
  }
  const match = SIGNATURES.find((s) => s.test(bytes));
  if (!match) throw new UnsupportedUpload('Only JPEG, PNG and WebP photos are accepted.');
  return { mime: match.mime, ext: match.ext };
}

export const uploadRoot = (): string =>
  resolve(process.env.CHIVAGO_UPLOADS ?? './data/uploads');

export interface StoredPhoto {
  id: string;
  storagePath: string;
  mime: string;
  byteSize: number;
}

/**
 * Write one photo and record it against a proof.
 *
 * The stored filename is generated, never derived from the client's. A
 * user-supplied name is a path-traversal vector and carries no information the
 * database does not already hold.
 */
export function storePhoto(
  db: DB,
  args: {
    proofId: string;
    bytes: Buffer;
    lat: number | null;
    lng: number | null;
    takenAt: string | null;
  },
): StoredPhoto {
  const { mime, ext } = sniff(args.bytes);
  const id = randomUUID();

  // Shard by the proof id so one directory never accumulates every photo in
  // the pilot - some filesystems degrade badly past a few thousand entries.
  const dir = join(uploadRoot(), args.proofId.slice(0, 2));
  mkdirSync(dir, { recursive: true });
  const storagePath = join(dir, `${id}.${ext}`);
  writeFileSync(storagePath, args.bytes);

  db.prepare(
    `INSERT INTO proof_files
       (id, proof_id, storage_path, mime_type, byte_size, lat, lng, taken_at, uploaded_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    id, args.proofId, storagePath, mime, args.bytes.length,
    args.lat, args.lng, args.takenAt, new Date().toISOString(),
  );

  return { id, storagePath, mime, byteSize: args.bytes.length };
}

export interface PhotoBlob {
  bytes: Buffer;
  mime: string;
}

/**
 * Read a stored photo, but ONLY if it belongs to a quest this host posted.
 *
 * The authorisation lives in the SQL rather than in the route, so there is no
 * way to reach the bytes without passing through the ownership join. Photos of
 * volunteers are personal data under Thailand's PDPA - a guessable id must not
 * be enough to see one.
 */
export function readPhotoForHost(db: DB, hostId: string, photoId: string): PhotoBlob | null {
  const found = row<{ storage_path: string; mime_type: string }>(
    db
      .prepare(
        `SELECT f.storage_path, f.mime_type
         FROM proof_files f
         JOIN proofs p ON p.id = f.proof_id
         JOIN quests q ON q.id = p.quest_id
         WHERE f.id = ? AND q.host_id = ?`,
      )
      .get(photoId, hostId),
  );
  if (!found || !existsSync(found.storage_path)) return null;
  return { bytes: readFileSync(found.storage_path), mime: found.mime_type };
}
