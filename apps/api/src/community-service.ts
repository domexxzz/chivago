import { randomUUID } from 'node:crypto';

import { row, type DB } from './db.ts';

export const COMMUNITY_POST_MAX = 2_000;
export const COMMUNITY_COMMENT_MAX = 500;
export const COMMUNITY_MEDIA_MAX_BYTES = 25 * 1024 * 1024;

export type CommunityMediaKind = 'image' | 'video';

export class InvalidCommunityPost extends Error {}
export class CommunityPostNotFound extends Error {}
export class InvalidCommunityMedia extends Error {}

export interface CommunityAuthor {
  id: string;
  displayName: string;
  accountType: 'traveller' | 'operator';
  profilePhotoUrl: string | null;
}

export interface CommunityComment {
  id: string;
  body: string;
  createdAt: string;
  author: CommunityAuthor;
}

export interface CommunityPost {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: CommunityAuthor;
  media: { kind: CommunityMediaKind; url: string } | null;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  likedByMe: boolean;
  comments: CommunityComment[];
}

interface PostRow {
  id: string; body: string; created_at: string; updated_at: string; media_mime: string | null;
  share_count: number; author_id: string; display_name: string; account_type: string | null;
  profile_photo_url: string | null; like_count: number; comment_count: number; liked_by_me: number;
}

interface CommentRow {
  id: string; post_id: string; body: string; created_at: string; author_id: string;
  display_name: string; account_type: string | null; profile_photo_url: string | null;
}

const authorOf = (r: { author_id: string; display_name: string; account_type: string | null; profile_photo_url: string | null }): CommunityAuthor => ({
  id: r.author_id,
  displayName: r.display_name,
  accountType: r.account_type === 'operator' ? 'operator' : 'traveller',
  profilePhotoUrl: r.profile_photo_url,
});

const mediaKind = (mime: string): CommunityMediaKind => mime.startsWith('video/') ? 'video' : 'image';

export function communityMediaMime(bytes: Buffer): string {
  if (bytes.length > COMMUNITY_MEDIA_MAX_BYTES) throw new InvalidCommunityMedia('Media must be 25 MB or smaller.');
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4';
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'video/webm';
  throw new InvalidCommunityMedia('Use a JPG, PNG, WebP, MP4, MOV or WebM file.');
}

const clean = (value: string, max: number): string => value.trim().slice(0, max);

export function createCommunityPost(
  db: DB,
  authorId: string,
  input: { body: string; media?: Buffer | null },
  now = new Date(),
): CommunityPost {
  const body = clean(input.body, COMMUNITY_POST_MAX);
  const media = input.media && input.media.length > 0 ? input.media : null;
  if (!body && !media) throw new InvalidCommunityPost('Write something or attach a photo or video.');
  const mime = media ? communityMediaMime(media) : null;
  const id = randomUUID();
  const at = now.toISOString();
  db.prepare(`INSERT INTO community_posts
    (id,author_id,body,media_mime,media_bytes,share_count,created_at,updated_at)
    VALUES (?,?,?,?,?,0,?,?)`).run(id, authorId, body, mime, media, at, at);
  return communityPost(db, id, authorId)!;
}

export function listCommunityFeed(db: DB, viewerId: string, limit = 30): CommunityPost[] {
  const take = Math.max(1, Math.min(50, Math.trunc(limit)));
  const posts = db.prepare(`SELECT p.id,p.body,p.created_at,p.updated_at,p.media_mime,p.share_count,
      u.id AS author_id,u.display_name,ua.account_type,pr.profile_photo_url,
      (SELECT COUNT(*) FROM community_likes l WHERE l.post_id=p.id) AS like_count,
      (SELECT COUNT(*) FROM community_comments c WHERE c.post_id=p.id AND c.hidden_at IS NULL) AS comment_count,
      EXISTS(SELECT 1 FROM community_likes mine WHERE mine.post_id=p.id AND mine.user_id=?) AS liked_by_me
    FROM community_posts p
    JOIN users u ON u.id=p.author_id
    LEFT JOIN user_accounts ua ON ua.id=u.id
    LEFT JOIN profiles pr ON pr.user_id=u.id
    WHERE p.hidden_at IS NULL
    ORDER BY p.created_at DESC,p.id DESC LIMIT ?`).all(viewerId, take) as unknown as PostRow[];
  if (posts.length === 0) return [];
  const comments = db.prepare(`SELECT c.id,c.post_id,c.body,c.created_at,
      u.id AS author_id,u.display_name,ua.account_type,pr.profile_photo_url
    FROM community_comments c
    JOIN users u ON u.id=c.author_id
    LEFT JOIN user_accounts ua ON ua.id=u.id
    LEFT JOIN profiles pr ON pr.user_id=u.id
    WHERE c.hidden_at IS NULL AND c.post_id IN (${posts.map(() => '?').join(',')})
    ORDER BY c.created_at,c.id`).all(...posts.map((p) => p.id)) as unknown as CommentRow[];
  const byPost = new Map<string, CommunityComment[]>();
  for (const c of comments) {
    const list = byPost.get(c.post_id) ?? [];
    list.push({ id: c.id, body: c.body, createdAt: c.created_at, author: authorOf(c) });
    byPost.set(c.post_id, list);
  }
  return posts.map((p) => ({
    id: p.id,
    body: p.body,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    author: authorOf(p),
    media: p.media_mime ? { kind: mediaKind(p.media_mime), url: `/community/media/${p.id}` } : null,
    likeCount: Number(p.like_count),
    commentCount: Number(p.comment_count),
    shareCount: p.share_count,
    likedByMe: Boolean(p.liked_by_me),
    comments: byPost.get(p.id) ?? [],
  }));
}

export function communityPost(db: DB, id: string, viewerId: string): CommunityPost | null {
  return listCommunityFeed(db, viewerId, 50).find((post) => post.id === id) ?? null;
}

function requirePost(db: DB, id: string): void {
  if (!row(db.prepare('SELECT id FROM community_posts WHERE id=? AND hidden_at IS NULL').get(id))) {
    throw new CommunityPostNotFound('This post is no longer available.');
  }
}

export function toggleCommunityLike(db: DB, postId: string, userId: string, now = new Date()): { liked: boolean; likeCount: number } {
  requirePost(db, postId);
  const existing = row(db.prepare('SELECT 1 FROM community_likes WHERE post_id=? AND user_id=?').get(postId, userId));
  if (existing) db.prepare('DELETE FROM community_likes WHERE post_id=? AND user_id=?').run(postId, userId);
  else db.prepare('INSERT INTO community_likes(post_id,user_id,created_at) VALUES(?,?,?)').run(postId, userId, now.toISOString());
  const count = row<{ n: number }>(db.prepare('SELECT COUNT(*) AS n FROM community_likes WHERE post_id=?').get(postId))?.n ?? 0;
  return { liked: !existing, likeCount: count };
}

export function addCommunityComment(db: DB, postId: string, authorId: string, value: string, now = new Date()): CommunityComment {
  requirePost(db, postId);
  const body = clean(value, COMMUNITY_COMMENT_MAX);
  if (!body) throw new InvalidCommunityPost('Write a comment before posting.');
  const id = randomUUID();
  db.prepare('INSERT INTO community_comments(id,post_id,author_id,body,created_at) VALUES(?,?,?,?,?)')
    .run(id, postId, authorId, body, now.toISOString());
  const saved = row<CommentRow>(db.prepare(`SELECT c.id,c.post_id,c.body,c.created_at,
      u.id AS author_id,u.display_name,ua.account_type,pr.profile_photo_url
    FROM community_comments c
    JOIN users u ON u.id=c.author_id
    LEFT JOIN user_accounts ua ON ua.id=u.id
    LEFT JOIN profiles pr ON pr.user_id=u.id WHERE c.id=?`).get(id))!;
  return { id: saved.id, body: saved.body, createdAt: saved.created_at, author: authorOf(saved) };
}

export function recordCommunityShare(db: DB, postId: string): number {
  requirePost(db, postId);
  db.prepare('UPDATE community_posts SET share_count=share_count+1 WHERE id=?').run(postId);
  return row<{ n: number }>(db.prepare('SELECT share_count AS n FROM community_posts WHERE id=?').get(postId))?.n ?? 0;
}

export function readCommunityMedia(db: DB, postId: string): { mime: string; bytes: Uint8Array } | null {
  return row<{ mime: string; bytes: Uint8Array }>(db.prepare(
    'SELECT media_mime AS mime,media_bytes AS bytes FROM community_posts WHERE id=? AND hidden_at IS NULL AND media_bytes IS NOT NULL',
  ).get(postId)) ?? null;
}
