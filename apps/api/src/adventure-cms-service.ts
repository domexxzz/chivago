import { randomUUID } from 'node:crypto';
import { row, rows, transact, type DB } from './db.ts';

export class AdventureCmsError extends Error {
  readonly code: string;
  constructor(message: string, code = 'ADVENTURE_CMS_INVALID') { super(message); this.code = code; }
}
export type AdventureCmsStatus = 'draft' | 'published' | 'archived';
export type AdventureCmsArc = {
  id: string; areaKey: string; status: AdventureCmsStatus; version: number;
  titleEn: string; titleTh: string; titleZh: string;
  summaryEn: string; summaryTh: string; summaryZh: string;
  coverPlaceId: string | null; createdAt: string; updatedAt: string; publishedAt: string | null;
  chapterCount: number; nodeCount: number;
};

type ArcRow = {
  id: string; area_key: string; status: AdventureCmsStatus; content_version: number;
  title_en: string; title_th: string; title_zh: string;
  summary_en: string; summary_th: string; summary_zh: string;
  cover_place_id: string | null; created_at: string; updated_at: string | null; published_at: string | null;
  chapter_count?: number; node_count?: number;
};
type ChapterRow = {
  id: string; arc_id: string; position: number;
  title_en: string; title_th: string; title_zh: string;
  summary_en: string; summary_th: string; summary_zh: string; created_at: string;
};
export type AdventureCmsDetail = { arc: AdventureCmsArc; chapters: Array<ChapterRow & { nodes: Array<Record<string, unknown>> }> };

const slug = (value: unknown, field: string): string => {
  const text = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(text)) throw new AdventureCmsError(`${field} must use letters, numbers and hyphens`);
  return text;
};
const required = (value: unknown, field: string, max = 2_000): string => {
  const text = String(value ?? '').trim();
  if (!text) throw new AdventureCmsError(`${field} is required`);
  if (text.length > max) throw new AdventureCmsError(`${field} is too long`);
  return text;
};
const position = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 10_000) throw new AdventureCmsError('position must be a non-negative integer');
  return n;
};

const mapArc = (a: ArcRow): AdventureCmsArc => ({
  id: a.id, areaKey: a.area_key, status: a.status, version: a.content_version,
  titleEn: a.title_en, titleTh: a.title_th, titleZh: a.title_zh,
  summaryEn: a.summary_en, summaryTh: a.summary_th, summaryZh: a.summary_zh,
  coverPlaceId: a.cover_place_id, createdAt: a.created_at, updatedAt: a.updated_at ?? a.created_at,
  publishedAt: a.published_at, chapterCount: Number(a.chapter_count ?? 0), nodeCount: Number(a.node_count ?? 0),
});

export function listAdventureContent(db: DB): AdventureCmsArc[] {
  return rows<ArcRow>(db.prepare(`SELECT a.*,
    (SELECT COUNT(*) FROM adventure_chapters c WHERE c.arc_id=a.id) chapter_count,
    (SELECT COUNT(*) FROM adventure_nodes n JOIN adventure_chapters c ON c.id=n.chapter_id WHERE c.arc_id=a.id) node_count
    FROM adventure_arcs a ORDER BY a.updated_at DESC,a.created_at DESC`).all()).map(mapArc);
}
export function adventureContentDetail(db: DB, arcId: string): AdventureCmsDetail {
  const arc = row<ArcRow>(db.prepare('SELECT * FROM adventure_arcs WHERE id=?').get(arcId));
  if (!arc) throw new AdventureCmsError('Adventure not found', 'ADVENTURE_NOT_FOUND');
  const chapters = rows<ChapterRow>(db.prepare('SELECT * FROM adventure_chapters WHERE arc_id=? ORDER BY position').all(arcId));
  return { arc: mapArc(arc), chapters: chapters.map((chapter) => ({
    ...chapter,
    nodes: rows<Record<string, unknown>>(db.prepare('SELECT * FROM adventure_nodes WHERE chapter_id=? ORDER BY position').all(chapter.id)),
  })) };
}
function snapshot(db: DB, arcId: string, actor: string, reason: string, now: Date): void {
  const content = adventureContentDetail(db, arcId);
  db.prepare(`INSERT INTO adventure_content_versions
    (id,arc_id,content_version,status,snapshot_json,changed_by,change_reason,created_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(), arcId, content.arc.version, content.arc.status,
    JSON.stringify(content), actor, reason.slice(0, 240), now.toISOString());
  db.prepare(`INSERT INTO admin_audit_log (id,admin_host_id,action,target_type,target_id,details_json,created_at)
    VALUES (?,?,?,?,?,?,?)`).run(randomUUID(), actor, `adventure.${reason}`, 'adventure', arcId,
    JSON.stringify({ version: content.arc.version, status: content.arc.status }), now.toISOString());
}
function requireDraft(db: DB, arcId: string): ArcRow {
  const arc = row<ArcRow>(db.prepare('SELECT * FROM adventure_arcs WHERE id=?').get(arcId));
  if (!arc) throw new AdventureCmsError('Adventure not found', 'ADVENTURE_NOT_FOUND');
  if (arc.status !== 'draft') throw new AdventureCmsError('Published content is immutable. Clone it to a new draft before editing.');
  return arc;
}
function touch(db: DB, arcId: string, now: Date): void {
  db.prepare('UPDATE adventure_arcs SET content_version=content_version+1,updated_at=? WHERE id=?').run(now.toISOString(), arcId);
}

export function createAdventureContent(db: DB, actor: string, input: Record<string, unknown>, now = new Date()): AdventureCmsArc {
  const id = slug(input.id, 'adventure id');
  const area = slug(input.areaKey, 'area key');
  const cover = String(input.coverPlaceId ?? '').trim() || null;
  if (cover && !row(db.prepare('SELECT id FROM places WHERE id=?').get(cover))) throw new AdventureCmsError('cover place does not exist');
  return transact(db, () => {
    try {
      db.prepare(`INSERT INTO adventure_arcs
        (id,area_key,status,title_en,title_th,title_zh,summary_en,summary_th,summary_zh,cover_place_id,created_at,updated_at,content_version)
        VALUES (?,?,'draft',?,?,?,?,?,?,?,?,?,1)`).run(id, area,
        required(input.titleEn, 'English title', 160), required(input.titleTh, 'Thai title', 160), required(input.titleZh, 'Chinese title', 160),
        required(input.summaryEn, 'English summary'), required(input.summaryTh, 'Thai summary'), required(input.summaryZh, 'Chinese summary'),
        cover, now.toISOString(), now.toISOString());
    } catch (error) {
      if (error instanceof Error && /UNIQUE|constraint/i.test(error.message)) throw new AdventureCmsError('adventure id already exists');
      throw error;
    }
    snapshot(db, id, actor, 'create', now);
    return listAdventureContent(db).find((arc) => arc.id === id)!;
  });
}

export function addAdventureChapter(db: DB, actor: string, arcId: string, input: Record<string, unknown>, now = new Date()): void {
  requireDraft(db, arcId);
  transact(db, () => {
    db.prepare(`INSERT INTO adventure_chapters
      (id,arc_id,position,title_en,title_th,title_zh,summary_en,summary_th,summary_zh,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(slug(input.id, 'chapter id'), arcId, position(input.position),
      required(input.titleEn, 'English title', 160), required(input.titleTh, 'Thai title', 160), required(input.titleZh, 'Chinese title', 160),
      required(input.summaryEn, 'English summary'), required(input.summaryTh, 'Thai summary'), required(input.summaryZh, 'Chinese summary'), now.toISOString());
    touch(db, arcId, now); snapshot(db, arcId, actor, 'chapter-create', now);
  });
}

export function addAdventureNode(db: DB, actor: string, arcId: string, chapterId: string, input: Record<string, unknown>, now = new Date()): void {
  requireDraft(db, arcId);
  const chapter = row<{ id: string }>(db.prepare('SELECT id FROM adventure_chapters WHERE id=? AND arc_id=?').get(chapterId, arcId));
  if (!chapter) throw new AdventureCmsError('Chapter not found');
  const placeId = String(input.placeId ?? '').trim();
  if (!row(db.prepare('SELECT id FROM places WHERE id=?').get(placeId))) throw new AdventureCmsError('Place not found');
  const verification = String(input.verificationKind ?? 'checkin');
  if (!['checkin', 'quest', 'qr', 'host'].includes(verification)) throw new AdventureCmsError('Invalid verification kind');
  const questId = String(input.questId ?? '').trim() || null;
  if (verification === 'quest' && (!questId || !row(db.prepare('SELECT id FROM quests WHERE id=?').get(questId)))) throw new AdventureCmsError('Quest verification requires an existing Quest');
  transact(db, () => {
    db.prepare(`INSERT INTO adventure_nodes
      (id,chapter_id,position,place_id,title_en,title_th,title_zh,story_en,story_th,story_zh,
       instruction_en,instruction_th,instruction_zh,verification_kind,quest_id,optional,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(slug(input.id, 'node id'), chapterId, position(input.position), placeId,
      required(input.titleEn, 'English title', 160), required(input.titleTh, 'Thai title', 160), required(input.titleZh, 'Chinese title', 160),
      required(input.storyEn, 'English story'), required(input.storyTh, 'Thai story'), required(input.storyZh, 'Chinese story'),
      required(input.instructionEn, 'English instruction'), required(input.instructionTh, 'Thai instruction'), required(input.instructionZh, 'Chinese instruction'),
      verification, questId, String(input.optional ?? '') === '1' ? 1 : 0, now.toISOString());
    touch(db, arcId, now); snapshot(db, arcId, actor, 'node-create', now);
  });
}

export function validateAdventureForPublish(db: DB, arcId: string): string[] {
  const detail = adventureContentDetail(db, arcId);
  const issues: string[] = [];
  if (!detail.arc.coverPlaceId) issues.push('Cover place is required.');
  if (detail.chapters.length === 0) issues.push('At least one chapter is required.');
  for (const chapter of detail.chapters) {
    const nodes = chapter.nodes as Array<Record<string, unknown>>;
    if (nodes.length === 0) issues.push(`Chapter ${String(chapter.id)} has no locations.`);
    for (const node of nodes) {
      const kind = String(node.verification_kind);
      if (kind === 'quest' && !node.quest_id) issues.push(`Node ${String(node.id)} has no Quest.`);
      if (kind === 'qr' || kind === 'host') {
        const policy = row<{ requires_qr: number; requires_host: number }>(db.prepare('SELECT requires_qr,requires_host FROM adventure_verification_policies WHERE node_id=?').get(node.id));
        if (!policy) issues.push(`Node ${String(node.id)} has no verification policy.`);
        if (kind === 'qr' && !row(db.prepare('SELECT id FROM activity_qr_codes WHERE node_id=? AND revoked_at IS NULL LIMIT 1').get(node.id))) issues.push(`Node ${String(node.id)} has no active QR.`);
      }
    }
  }
  return issues;
}

export function setAdventureContentStatus(db: DB, actor: string, arcId: string, status: AdventureCmsStatus, now = new Date()): void {
  const arc = row<ArcRow>(db.prepare('SELECT * FROM adventure_arcs WHERE id=?').get(arcId));
  if (!arc) throw new AdventureCmsError('Adventure not found');
  if (!['draft', 'published', 'archived'].includes(status)) throw new AdventureCmsError('Invalid status');
  if (status === 'published') {
    const issues = validateAdventureForPublish(db, arcId);
    if (issues.length) throw new AdventureCmsError(`Cannot publish: ${issues.join(' ')}`, 'ADVENTURE_PUBLISH_INVALID');
  }
  transact(db, () => {
    db.prepare(`UPDATE adventure_arcs SET status=?,published_at=CASE WHEN ?='published' THEN ? ELSE published_at END,
      content_version=content_version+1,updated_at=? WHERE id=?`).run(status, status, now.toISOString(), now.toISOString(), arcId);
    snapshot(db, arcId, actor, `status-${status}`, now);
  });
}

export function cloneAdventureToDraft(db: DB, actor: string, arcId: string, newIdInput: unknown, now = new Date()): AdventureCmsArc {
  const source = adventureContentDetail(db, arcId);
  const newId = slug(newIdInput, 'new adventure id');
  return transact(db, () => {
    const a = source.arc;
    db.prepare(`INSERT INTO adventure_arcs
      (id,area_key,status,title_en,title_th,title_zh,summary_en,summary_th,summary_zh,cover_place_id,created_at,updated_at,content_version)
      VALUES (?,?,'draft',?,?,?,?,?,?,?,?,?,1)`).run(newId, a.areaKey, a.titleEn, a.titleTh, a.titleZh,
      a.summaryEn, a.summaryTh, a.summaryZh, a.coverPlaceId, now.toISOString(), now.toISOString());
    for (const chapter of source.chapters) {
      const chapterId = `${newId}-c${Number(chapter.position) + 1}`;
      db.prepare(`INSERT INTO adventure_chapters
        (id,arc_id,position,title_en,title_th,title_zh,summary_en,summary_th,summary_zh,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(chapterId, newId, chapter.position, chapter.title_en, chapter.title_th, chapter.title_zh,
        chapter.summary_en, chapter.summary_th, chapter.summary_zh, now.toISOString());
      for (const node of chapter.nodes as Array<Record<string, unknown>>) {
        db.prepare(`INSERT INTO adventure_nodes
          (id,chapter_id,position,place_id,title_en,title_th,title_zh,story_en,story_th,story_zh,instruction_en,instruction_th,instruction_zh,verification_kind,quest_id,optional,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          `${newId}-c${Number(chapter.position) + 1}-n${Number(node.position) + 1}`,
          chapterId, node.position, node.place_id,
          node.title_en, node.title_th, node.title_zh, node.story_en, node.story_th, node.story_zh,
          node.instruction_en, node.instruction_th, node.instruction_zh, node.verification_kind, node.quest_id, node.optional, now.toISOString());
      }
    }
    snapshot(db, newId, actor, `clone-from-${arcId}`, now);
    return listAdventureContent(db).find((arc) => arc.id === newId)!;
  });
}
