import type {
  AdventureArc, AdventureChapter, AdventureNode, AdventureOverview, AdventureStatus,
  AdventureVerification,
} from '@chivago/core';
import { rows, type DB } from './db.ts';
import { notReversed } from './ledger-sql.ts';

interface AdventureRow {
  arc_id: string;
  area_key: string;
  arc_status: AdventureStatus;
  arc_title_en: string;
  arc_title_th: string;
  arc_title_zh: string;
  arc_summary_en: string;
  arc_summary_th: string;
  arc_summary_zh: string;
  cover_place_id: string | null;
  chapter_id: string;
  chapter_position: number;
  chapter_title_en: string;
  chapter_title_th: string;
  chapter_title_zh: string;
  chapter_summary_en: string;
  chapter_summary_th: string;
  chapter_summary_zh: string;
  node_id: string;
  node_position: number;
  node_title_en: string;
  node_title_th: string;
  node_title_zh: string;
  story_en: string;
  story_th: string;
  story_zh: string;
  instruction_en: string;
  instruction_th: string;
  instruction_zh: string;
  verification_kind: AdventureVerification;
  quest_id: string | null;
  optional: number;
  place_id: string;
  place_name_en: string;
  place_name_th: string;
  lat: number;
  lng: number;
  photo_url: string | null;
  policy_requires_gps: number | null;
  policy_requires_qr: number | null;
  policy_requires_evidence: number | null;
  policy_requires_host: number | null;
  policy_geofence_radius_m: number | null;
}

interface CompletionRow {
  node_id: string;
  completed_at: string;
  source: 'checkin' | 'unlock';
}

const percent = (done: number, total: number): number =>
  total === 0 ? 0 : Math.round((done / total) * 100);

/**
 * Read a published narrative using the existing evidence stores.
 *
 * Check-in nodes are completed only by standing, non-reversed check-in ledger
 * rows. QR, host and quest nodes use the auditable adventure_unlocks bridge.
 * The client receives a projection and cannot set any of these states itself.
 */
export function adventureOverviewFor(
  db: DB,
  userId: string,
  areaKey = 'koh-sichang',
): AdventureOverview {
  const content = rows<AdventureRow>(db.prepare(
    `SELECT
       a.id AS arc_id, a.area_key, a.status AS arc_status,
       a.title_en AS arc_title_en, a.title_th AS arc_title_th, a.title_zh AS arc_title_zh,
       a.summary_en AS arc_summary_en, a.summary_th AS arc_summary_th, a.summary_zh AS arc_summary_zh,
       a.cover_place_id,
       c.id AS chapter_id, c.position AS chapter_position,
       c.title_en AS chapter_title_en, c.title_th AS chapter_title_th, c.title_zh AS chapter_title_zh,
       c.summary_en AS chapter_summary_en, c.summary_th AS chapter_summary_th, c.summary_zh AS chapter_summary_zh,
       n.id AS node_id, n.position AS node_position,
       n.title_en AS node_title_en, n.title_th AS node_title_th, n.title_zh AS node_title_zh,
       n.story_en, n.story_th, n.story_zh,
       n.instruction_en, n.instruction_th, n.instruction_zh,
       n.verification_kind, n.quest_id, n.optional,
       p.id AS place_id, p.name_en AS place_name_en, p.name_th AS place_name_th,
       p.lat, p.lng, p.photo_url,
       vp.requires_gps AS policy_requires_gps,
       vp.requires_qr AS policy_requires_qr,
       vp.requires_evidence AS policy_requires_evidence,
       vp.requires_host AS policy_requires_host,
       vp.geofence_radius_m AS policy_geofence_radius_m
     FROM adventure_arcs a
     JOIN adventure_chapters c ON c.arc_id = a.id
     JOIN adventure_nodes n ON n.chapter_id = c.id
     JOIN places p ON p.id = n.place_id
     LEFT JOIN adventure_verification_policies vp ON vp.node_id = n.id
     WHERE a.id = (
       SELECT id FROM adventure_arcs
       WHERE area_key = ? AND status = 'published'
       ORDER BY published_at DESC, created_at DESC LIMIT 1
     )
     ORDER BY c.position, n.position`,
  ).all(areaKey));
  if (content.length === 0) return { adventure: null };

  const checkins = rows<CompletionRow>(db.prepare(
    `SELECT n.id AS node_id, MIN(l.occurred_at) AS completed_at, 'checkin' AS source
     FROM adventure_nodes n
     JOIN adventure_chapters c ON c.id = n.chapter_id
     JOIN adventure_arcs a ON a.id = c.arc_id
     JOIN ledger l
       ON l.user_id = ?
      AND l.kind = 'checkin'
      AND l.source_ref LIKE 'checkin:' || n.place_id || ':user:%'
      AND ${notReversed('l')}
     WHERE a.id = ? AND n.verification_kind = 'checkin'
     GROUP BY n.id`,
  ).all(userId, content[0].arc_id));
  const unlocks = rows<CompletionRow>(db.prepare(
    `SELECT u.node_id, u.unlocked_at AS completed_at, 'unlock' AS source
     FROM adventure_unlocks u
     JOIN adventure_nodes n ON n.id = u.node_id
     JOIN adventure_chapters c ON c.id = n.chapter_id
     WHERE u.user_id = ? AND c.arc_id = ? AND u.invalidated_at IS NULL`,
  ).all(userId, content[0].arc_id));
  const completions = new Map(
    [...checkins, ...unlocks].map((completion) => [completion.node_id, completion]),
  );

  const flatNodes: AdventureNode[] = content.map((item) => {
    const completion = completions.get(item.node_id);
    return {
      id: item.node_id,
      chapterId: item.chapter_id,
      position: item.node_position,
      place: {
        id: item.place_id,
        name: { en: item.place_name_en, th: item.place_name_th },
        lat: item.lat,
        lng: item.lng,
        photoUrl: item.photo_url,
      },
      title: { en: item.node_title_en, th: item.node_title_th, zh: item.node_title_zh },
      story: { en: item.story_en, th: item.story_th, zh: item.story_zh },
      instruction: { en: item.instruction_en, th: item.instruction_th, zh: item.instruction_zh },
      verification: item.verification_kind,
      questId: item.quest_id,
      optional: item.optional === 1,
      // Candidate evidence is applied in story order below. A verified visit
      // to a later stop is still a real visit, but it cannot skip the clues
      // that make that stop part of this narrative.
      state: 'locked',
      completedAt: null,
      completionSource: null,
      policy: {
        nodeId: item.node_id,
        requiresGps: item.policy_requires_gps === null
          ? item.verification_kind !== 'quest'
          : item.policy_requires_gps === 1,
        requiresQr: item.policy_requires_qr === null
          ? item.verification_kind === 'qr'
          : item.policy_requires_qr === 1,
        requiresEvidence: item.policy_requires_evidence === null
          ? item.verification_kind === 'host'
          : item.policy_requires_evidence === 1,
        requiresHost: item.policy_requires_host === null
          ? item.verification_kind === 'host'
          : item.policy_requires_host === 1,
        geofenceRadiusM: item.policy_geofence_radius_m ?? 150,
      },
    };
  });

  let storyBlocked = false;
  let previousRequiredAt: string | null = null;
  for (const node of flatNodes) {
    const completion = completions.get(node.id);
    const afterPrevious = !previousRequiredAt
      || (completion !== undefined && completion.completed_at >= previousRequiredAt);
    if (!storyBlocked && completion && afterPrevious) {
      node.state = 'completed';
      node.completedAt = completion.completed_at;
      node.completionSource = completion.source;
      if (!node.optional) previousRequiredAt = completion.completed_at;
    } else if (!node.optional) {
      storyBlocked = true;
    }
  }

  const firstRequired = flatNodes.find((node) => node.state !== 'completed' && !node.optional);
  if (firstRequired) firstRequired.state = 'available';
  const currentIndex = firstRequired ? flatNodes.indexOf(firstRequired) : flatNodes.length;
  for (const [index, node] of flatNodes.entries()) {
    if (node.optional && node.state !== 'completed' && index <= currentIndex) {
      node.state = 'available';
    }
  }

  const chapters: AdventureChapter[] = [];
  for (const item of content) {
    let chapter = chapters.find((entry) => entry.id === item.chapter_id);
    if (!chapter) {
      chapter = {
        id: item.chapter_id,
        position: item.chapter_position,
        title: { en: item.chapter_title_en, th: item.chapter_title_th, zh: item.chapter_title_zh },
        summary: { en: item.chapter_summary_en, th: item.chapter_summary_th, zh: item.chapter_summary_zh },
        nodes: [],
        completedNodes: 0,
        totalNodes: 0,
        progressPercent: 0,
      };
      chapters.push(chapter);
    }
    chapter.nodes.push(flatNodes.find((node) => node.id === item.node_id)!);
  }
  for (const chapter of chapters) {
    chapter.totalNodes = chapter.nodes.length;
    chapter.completedNodes = chapter.nodes.filter((node) => node.state === 'completed').length;
    chapter.progressPercent = percent(chapter.completedNodes, chapter.totalNodes);
  }

  const first = content[0];
  const completedNodes = flatNodes.filter((node) => node.state === 'completed').length;
  const adventure: AdventureArc = {
    id: first.arc_id,
    areaKey: first.area_key,
    status: first.arc_status,
    title: { en: first.arc_title_en, th: first.arc_title_th, zh: first.arc_title_zh },
    summary: { en: first.arc_summary_en, th: first.arc_summary_th, zh: first.arc_summary_zh },
    coverPlaceId: first.cover_place_id,
    chapters,
    completedNodes,
    totalNodes: flatNodes.length,
    progressPercent: percent(completedNodes, flatNodes.length),
    currentNodeId: flatNodes.find((node) => node.state === 'available')?.id ?? null,
  };
  return { adventure };
}
