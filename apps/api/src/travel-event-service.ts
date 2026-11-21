import { randomUUID } from 'node:crypto';
import {
  SPECIES,
  type JournalVisibility,
  type LayerKey,
  type PetMemory,
  type PetMemoryType,
  type TravelCycleResult,
  type TravelEvent,
  type TravelEventType,
  type TravelJournalEntry,
  type TravelJournalEntryKind,
} from '@chivago/core';
import { row, rows, transact, type DB } from './db.ts';
import { adventureOverviewFor } from './adventure-service.ts';
import { notReversed } from './ledger-sql.ts';
import { applyTravelEventToSeasons, invalidateSeasonProgressForTravelEvent } from './season-service.ts';

interface EventRow {
  id: string;
  type: TravelEventType;
  source_kind: string;
  source_ref: string;
  place_id: string | null;
  quest_id: string | null;
  party_id: string | null;
  occurred_at: string;
  payload_json: string;
  invalidated_at: string | null;
}

const parseObject = (value: string): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const toEvent = (found: EventRow): TravelEvent => ({
  id: found.id,
  type: found.type,
  sourceKind: found.source_kind,
  sourceRef: found.source_ref,
  placeId: found.place_id,
  questId: found.quest_id,
  partyId: found.party_id,
  occurredAt: found.occurred_at,
  invalidatedAt: found.invalidated_at,
  metadata: parseObject(found.payload_json),
});

/**
 * Store one server-authored event. The natural key names the verified source,
 * so retries return the same event instead of creating another consequence.
 */
export function recordTravelEvent(
  db: DB,
  args: {
    userId: string;
    type: TravelEventType;
    sourceKind: string;
    sourceRef: string;
    occurredAt: string;
    placeId?: string | null;
    questId?: string | null;
    partyId?: string | null;
    metadata?: Record<string, unknown>;
  },
): { event: TravelEvent; created: boolean } {
  const existing = row<EventRow>(db.prepare(
    `SELECT id,type,source_kind,source_ref,place_id,quest_id,party_id,occurred_at,payload_json,invalidated_at
     FROM travel_events
     WHERE user_id = ? AND type = ? AND source_kind = ? AND source_ref = ?`,
  ).get(args.userId, args.type, args.sourceKind, args.sourceRef));
  if (existing) return { event: toEvent(existing), created: false };

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO travel_events
       (id,user_id,type,source_kind,source_ref,place_id,quest_id,party_id,
        occurred_at,payload_json,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id, args.userId, args.type, args.sourceKind, args.sourceRef,
    args.placeId ?? null, args.questId ?? null, args.partyId ?? null,
    args.occurredAt, JSON.stringify(args.metadata ?? {}), createdAt,
  );
  applyTravelEventToSeasons(db, {
    id, userId: args.userId, type: args.type, questId: args.questId ?? null, occurredAt: args.occurredAt,
  });
  return {
    event: {
      id,
      type: args.type,
      sourceKind: args.sourceKind,
      sourceRef: args.sourceRef,
      placeId: args.placeId ?? null,
      questId: args.questId ?? null,
      partyId: args.partyId ?? null,
      occurredAt: args.occurredAt,
      invalidatedAt: null,
      metadata: args.metadata ?? {},
    },
    created: true,
  };
}

function addJournalEntry(
  db: DB,
  args: {
    userId: string; eventId: string; placeId?: string | null;
    kind: TravelJournalEntryKind; occurredAt: string;
  },
): string {
  const existing = row<{ id: string }>(db.prepare(
    `SELECT id FROM travel_journal_entries
     WHERE user_id = ? AND travel_event_id = ? AND kind = ?`,
  ).get(args.userId, args.eventId, args.kind));
  if (existing) return existing.id;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO travel_journal_entries
       (id,user_id,travel_event_id,place_id,kind,note,visibility,created_at,updated_at)
     VALUES (?,?,?,?,?,NULL,'private',?,?)`,
  ).run(id, args.userId, args.eventId, args.placeId ?? null, args.kind, args.occurredAt, args.occurredAt);
  return id;
}

function addPetMemory(
  db: DB,
  args: {
    userId: string; eventId: string; companionKey: string; memoryType: PetMemoryType;
    placeId?: string | null; occurredAt: string;
  },
): string {
  const existing = row<{ id: string }>(db.prepare(
    `SELECT id FROM pet_memories
     WHERE user_id = ? AND travel_event_id = ? AND companion_key = ? AND memory_type = ?`,
  ).get(args.userId, args.eventId, args.companionKey, args.memoryType));
  if (existing) return existing.id;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO pet_memories
       (id,user_id,travel_event_id,companion_key,memory_type,place_id,occurred_at,created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    id, args.userId, args.eventId, args.companionKey, args.memoryType,
    args.placeId ?? null, args.occurredAt, new Date().toISOString(),
  );
  return id;
}

/** A story memory is its own auditable consequence of a verified unlock. */
function addStoryPetMemory(
  db: DB,
  args: { userId: string; story: TravelEvent; layer: string; placeId: string; questId?: string | null },
): TravelEvent | null {
  const species = SPECIES[args.layer as LayerKey];
  if (!species) return null;
  const memory = recordTravelEvent(db, {
    userId: args.userId,
    type: 'PET_MEMORY_CREATED',
    sourceKind: 'travel_event',
    sourceRef: `companion:${species.key}:${args.story.id}`,
    placeId: args.placeId,
    questId: args.questId ?? null,
    occurredAt: args.story.occurredAt,
    metadata: { companionKey: species.key, memoryType: 'story_unlock', storyEventId: args.story.id },
  }).event;
  addPetMemory(db, {
    userId: args.userId, eventId: memory.id, companionKey: species.key,
    memoryType: 'story_unlock', placeId: args.placeId, occurredAt: args.story.occurredAt,
  });
  return memory;
}

/**
 * Materialise the verified consequences of a standing check-in ledger row.
 * The caller may safely invoke this on a retry; every write has a natural
 * unique key and returns the original record.
 */
export function recordCheckinTravelCycle(
  db: DB,
  args: { userId: string; placeId: string; ledgerSourceRef: string },
): TravelCycleResult {
  return transact(db, () => {
    const place = row<{ id: string; layer: string }>(
      db.prepare('SELECT id, layer FROM places WHERE id = ?').get(args.placeId),
    );
    if (!place) throw new Error(`unknown place: ${args.placeId}`);
    const ledger = row<{ occurred_at: string }>(db.prepare(
      `SELECT l.occurred_at FROM ledger l
       WHERE l.user_id = ? AND l.kind = 'checkin' AND l.source_ref = ?
         AND ${notReversed('l')}`,
    ).get(args.userId, args.ledgerSourceRef));
    const expectedPrefix = `checkin:${place.id}:user:${args.userId}:`;
    if (!ledger || !args.ledgerSourceRef.startsWith(expectedPrefix)) {
      throw new Error('a standing check-in ledger row is required');
    }
    const occurredAt = ledger.occurred_at;

    const events: TravelEvent[] = [];
    const journalEntryIds: string[] = [];
    const storyNodeIds: string[] = [];

    const checkin = recordTravelEvent(db, {
      userId: args.userId,
      type: 'CHECK_IN_VERIFIED',
      sourceKind: 'ledger',
      sourceRef: args.ledgerSourceRef,
      placeId: place.id,
      occurredAt,
    }).event;
    events.push(checkin);
    events.push(recordTravelEvent(db, {
      userId: args.userId,
      type: 'LOCATION_VISITED',
      sourceKind: 'ledger',
      sourceRef: args.ledgerSourceRef,
      placeId: place.id,
      occurredAt,
    }).event);
    journalEntryIds.push(addJournalEntry(db, {
      userId: args.userId,
      eventId: checkin.id,
      placeId: place.id,
      kind: 'verified_visit',
      occurredAt,
    }));

    // Only the node whose evidence first completed it at this exact moment is
    // unlocked. adventureOverviewFor also enforces preceding clue order.
    const overview = adventureOverviewFor(db, args.userId).adventure;
    for (const node of overview?.chapters.flatMap((chapter) => chapter.nodes) ?? []) {
      if (node.place.id !== place.id || node.state !== 'completed' || node.completedAt !== occurredAt) continue;
      const story = recordTravelEvent(db, {
        userId: args.userId,
        type: 'STORY_UNLOCKED',
        sourceKind: 'adventure',
        sourceRef: `node:${node.id}:${args.ledgerSourceRef}`,
        placeId: place.id,
        occurredAt,
        metadata: { nodeId: node.id, chapterId: node.chapterId },
      }).event;
      events.push(story);
      const storyMemory = addStoryPetMemory(db, {
        userId: args.userId, story, layer: place.layer, placeId: place.id,
      });
      if (storyMemory) events.push(storyMemory);
      storyNodeIds.push(node.id);
      journalEntryIds.push(addJournalEntry(db, {
        userId: args.userId,
        eventId: story.id,
        placeId: place.id,
        kind: 'story_unlock',
        occurredAt,
      }));
    }

    const species = SPECIES[place.layer as LayerKey];
    if (species) {
      const memoryEvent = recordTravelEvent(db, {
        userId: args.userId,
        type: 'PET_MEMORY_CREATED',
        sourceKind: 'travel_event',
        sourceRef: `companion:${species.key}:${checkin.id}`,
        placeId: place.id,
        occurredAt,
        metadata: { companionKey: species.key, memoryType: 'verified_visit' },
      }).event;
      events.push(memoryEvent);
      addPetMemory(db, {
        userId: args.userId,
        eventId: memoryEvent.id,
        companionKey: species.key,
        memoryType: 'verified_visit',
        placeId: place.id,
        occurredAt,
      });
    }

    return {
      events,
      storyNodeIds,
      petMemories: petMemoriesFor(db, args.userId).filter((memory) => memory.occurredAt === occurredAt),
      journalEntryIds,
    };
  });
}

/**
 * Verified quest counterpart of the check-in cycle. The reward ledger is the
 * authority: a quest_progress flag without its settled ledger row cannot
 * create memories, unlock narrative content or enter the journal.
 */
export function recordQuestTravelCycle(
  db: DB,
  args: { userId: string; questId: string; ledgerSourceRef: string },
): TravelCycleResult {
  return transact(db, () => {
    const ledger = row<{ occurred_at: string }>(db.prepare(
      `SELECT l.occurred_at FROM ledger l
       JOIN quest_progress qp ON qp.user_id = l.user_id AND qp.quest_id = ?
       WHERE l.user_id = ? AND l.kind = 'quest_reward' AND l.source_ref = ?
         AND qp.stage = 'complete' AND ${notReversed('l')}`,
    ).get(args.questId, args.userId, args.ledgerSourceRef));
    const expected = `quest:${args.questId}:user:${args.userId}`;
    if (!ledger || args.ledgerSourceRef !== expected) {
      throw new Error('a standing verified quest ledger row is required');
    }
    const quest = row<{ lat: number; lng: number }>(
      db.prepare('SELECT lat, lng FROM quests WHERE id = ?').get(args.questId),
    );
    if (!quest) throw new Error(`unknown quest: ${args.questId}`);
    const place = row<{ id: string; layer: string }>(
      db.prepare('SELECT id, layer FROM places WHERE lat = ? AND lng = ? LIMIT 1').get(quest.lat, quest.lng),
    ) ?? null;

    const events: TravelEvent[] = [];
    const journalEntryIds: string[] = [];
    const storyNodeIds: string[] = [];
    const completed = recordTravelEvent(db, {
      userId: args.userId,
      type: 'QUEST_COMPLETED',
      sourceKind: 'ledger',
      sourceRef: args.ledgerSourceRef,
      placeId: place?.id ?? null,
      questId: args.questId,
      occurredAt: ledger.occurred_at,
    }).event;
    events.push(completed);
    journalEntryIds.push(addJournalEntry(db, {
      userId: args.userId,
      eventId: completed.id,
      placeId: place?.id ?? null,
      kind: 'verified_quest',
      occurredAt: ledger.occurred_at,
    }));

    const candidates = rows<{ node_id: string; area_key: string }>(db.prepare(
      `SELECT n.id AS node_id,a.area_key
       FROM adventure_nodes n
       JOIN adventure_chapters c ON c.id = n.chapter_id
       JOIN adventure_arcs a ON a.id = c.arc_id
       WHERE n.quest_id = ? AND n.verification_kind = 'quest' AND a.status = 'published'`,
    ).all(args.questId));
    for (const candidate of candidates) {
      const before = adventureOverviewFor(db, args.userId, candidate.area_key).adventure;
      const node = before?.chapters.flatMap((chapter) => chapter.nodes)
        .find((entry) => entry.id === candidate.node_id);
      if (!node || node.state !== 'available') continue;
      const unlockRef = `${args.ledgerSourceRef}:node:${node.id}`;
      db.prepare(
        `INSERT OR IGNORE INTO adventure_unlocks
           (user_id,node_id,source_kind,source_ref,unlocked_at)
         VALUES (?,?,'quest',?,?)`,
      ).run(args.userId, node.id, unlockRef, ledger.occurred_at);
      const story = recordTravelEvent(db, {
        userId: args.userId,
        type: 'STORY_UNLOCKED',
        sourceKind: 'adventure',
        sourceRef: unlockRef,
        placeId: node.place.id,
        questId: args.questId,
        occurredAt: ledger.occurred_at,
        metadata: { nodeId: node.id, chapterId: node.chapterId },
      }).event;
      events.push(story);
      const storyPlace = row<{ layer: string }>(db.prepare('SELECT layer FROM places WHERE id = ?').get(node.place.id));
      const storyMemory = storyPlace ? addStoryPetMemory(db, {
        userId: args.userId, story, layer: storyPlace.layer, placeId: node.place.id, questId: args.questId,
      }) : null;
      if (storyMemory) events.push(storyMemory);
      storyNodeIds.push(node.id);
      journalEntryIds.push(addJournalEntry(db, {
        userId: args.userId,
        eventId: story.id,
        placeId: node.place.id,
        kind: 'story_unlock',
        occurredAt: ledger.occurred_at,
      }));
    }

    if (place) {
      const species = SPECIES[place.layer as LayerKey];
      if (species) {
        const memoryEvent = recordTravelEvent(db, {
          userId: args.userId,
          type: 'PET_MEMORY_CREATED',
          sourceKind: 'travel_event',
          sourceRef: `companion:${species.key}:${completed.id}`,
          placeId: place.id,
          questId: args.questId,
          occurredAt: ledger.occurred_at,
          metadata: { companionKey: species.key, memoryType: 'verified_quest' },
        }).event;
        events.push(memoryEvent);
        addPetMemory(db, {
          userId: args.userId,
          eventId: memoryEvent.id,
          companionKey: species.key,
          memoryType: 'verified_quest',
          placeId: place.id,
          occurredAt: ledger.occurred_at,
        });
      }
    }

    return {
      events,
      storyNodeIds,
      petMemories: petMemoriesFor(db, args.userId)
        .filter((memory) => memory.occurredAt === ledger.occurred_at),
      journalEntryIds,
    };
  });
}

/**
 * Materialise a completed QR/evidence/host activity from its standing Ledger
 * row. The verification row proves policy completion; the Ledger remains the
 * reward and reversal authority.
 */
export function recordActivityTravelCycle(
  db: DB,
  args: { userId: string; nodeId: string; ledgerSourceRef: string },
): TravelCycleResult {
  return transact(db, () => {
    const expected = `activity:${args.nodeId}:user:${args.userId}`;
    const verified = row<{
      verified_at: string; place_id: string; evidence_id: string | null;
      quest_id: string | null; layer: string; chapter_id: string;
    }>(db.prepare(
      `SELECT v.verified_at,v.place_id,v.evidence_id,n.quest_id,n.chapter_id,p.layer
       FROM activity_verifications v
       JOIN adventure_nodes n ON n.id = v.node_id
       JOIN places p ON p.id = v.place_id
       JOIN ledger l ON l.user_id = v.user_id AND l.source_ref = v.ledger_source_ref
       WHERE v.user_id = ? AND v.node_id = ? AND v.invalidated_at IS NULL
         AND l.kind = 'activity_reward' AND l.source_ref = ? AND ${notReversed('l')}`,
    ).get(args.userId, args.nodeId, args.ledgerSourceRef));
    if (!verified || args.ledgerSourceRef !== expected) {
      throw new Error('a standing verified activity ledger row is required');
    }

    const events: TravelEvent[] = [];
    const journalEntryIds: string[] = [];
    const storyNodeIds: string[] = [];
    const activity = recordTravelEvent(db, {
      userId: args.userId,
      type: 'SHOP_ACTIVITY_VERIFIED',
      sourceKind: 'ledger',
      sourceRef: args.ledgerSourceRef,
      placeId: verified.place_id,
      questId: verified.quest_id,
      occurredAt: verified.verified_at,
      metadata: { nodeId: args.nodeId, evidenceId: verified.evidence_id },
    }).event;
    events.push(activity);
    journalEntryIds.push(addJournalEntry(db, {
      userId: args.userId,
      eventId: activity.id,
      placeId: verified.place_id,
      kind: 'verified_visit',
      occurredAt: verified.verified_at,
    }));

    db.prepare(
      `INSERT OR IGNORE INTO adventure_unlocks
         (user_id,node_id,source_kind,source_ref,unlocked_at)
       VALUES (?,?,'activity',?,?)`,
    ).run(args.userId, args.nodeId, args.ledgerSourceRef, verified.verified_at);
    const story = recordTravelEvent(db, {
      userId: args.userId,
      type: 'STORY_UNLOCKED',
      sourceKind: 'adventure',
      sourceRef: `${args.ledgerSourceRef}:node:${args.nodeId}`,
      placeId: verified.place_id,
      questId: verified.quest_id,
      occurredAt: verified.verified_at,
      metadata: { nodeId: args.nodeId, chapterId: verified.chapter_id },
    }).event;
    events.push(story);
    const storyMemory = addStoryPetMemory(db, {
      userId: args.userId, story, layer: verified.layer, placeId: verified.place_id, questId: verified.quest_id,
    });
    if (storyMemory) events.push(storyMemory);
    storyNodeIds.push(args.nodeId);
    journalEntryIds.push(addJournalEntry(db, {
      userId: args.userId,
      eventId: story.id,
      placeId: verified.place_id,
      kind: 'story_unlock',
      occurredAt: verified.verified_at,
    }));

    const species = SPECIES[verified.layer as LayerKey];
    if (species) {
      const memory = recordTravelEvent(db, {
        userId: args.userId,
        type: 'PET_MEMORY_CREATED',
        sourceKind: 'travel_event',
        sourceRef: `companion:${species.key}:${activity.id}`,
        placeId: verified.place_id,
        occurredAt: verified.verified_at,
        metadata: { companionKey: species.key, memoryType: 'verified_visit' },
      }).event;
      events.push(memory);
      addPetMemory(db, {
        userId: args.userId,
        eventId: memory.id,
        companionKey: species.key,
        memoryType: 'verified_visit',
        placeId: verified.place_id,
        occurredAt: verified.verified_at,
      });
    }

    return {
      events,
      storyNodeIds,
      petMemories: petMemoriesFor(db, args.userId)
        .filter((memory) => memory.occurredAt === verified.verified_at),
      journalEntryIds,
    };
  });
}

export function travelEventsFor(db: DB, userId: string, limit = 50): TravelEvent[] {
  return rows<EventRow>(db.prepare(
    `SELECT id,type,source_kind,source_ref,place_id,quest_id,party_id,occurred_at,payload_json,invalidated_at
     FROM travel_events WHERE user_id = ? ORDER BY occurred_at DESC, id DESC LIMIT ?`,
  ).all(userId, Math.max(1, Math.min(100, limit)))).map(toEvent);
}

export function petMemoriesFor(db: DB, userId: string): PetMemory[] {
  return rows<{
    id: string; travel_event_id: string; companion_key: string; memory_type: PetMemoryType;
    place_id: string | null; place_name_en: string | null; place_name_th: string | null; occurred_at: string;
  }>(db.prepare(
    `SELECT m.id,m.travel_event_id,m.companion_key,m.memory_type,m.place_id,m.occurred_at,
            p.name_en AS place_name_en,p.name_th AS place_name_th
     FROM pet_memories m
     JOIN travel_events e ON e.id = m.travel_event_id AND e.invalidated_at IS NULL
     LEFT JOIN places p ON p.id = m.place_id
     WHERE m.user_id = ? ORDER BY m.occurred_at DESC, m.id DESC`,
  ).all(userId)).map((found) => ({
    id: found.id,
    eventId: found.travel_event_id,
    companionKey: found.companion_key,
    memoryType: found.memory_type,
    place: found.place_id && found.place_name_en && found.place_name_th
      ? { id: found.place_id, name: { en: found.place_name_en, th: found.place_name_th } }
      : null,
    occurredAt: found.occurred_at,
  }));
}

export function travelJournalFor(db: DB, userId: string, limit = 50, tripId?: string): TravelJournalEntry[] {
  return rows<{
    id: string; kind: TravelJournalEntryKind; note: string | null; visibility: JournalVisibility;
    created_at: string; updated_at: string; place_id: string | null; place_name_en: string | null;
    place_name_th: string | null; photo_url: string | null;
    event_id: string; type: TravelEventType; source_kind: string; source_ref: string;
    quest_id: string | null; party_id: string | null; occurred_at: string; payload_json: string;
  }>(db.prepare(
    `SELECT j.id,j.kind,j.note,j.visibility,j.created_at,j.updated_at,j.place_id,
            p.name_en AS place_name_en,p.name_th AS place_name_th,p.photo_url,
            e.id AS event_id,e.type,e.source_kind,e.source_ref,e.quest_id,e.party_id,
            e.occurred_at,e.payload_json
     FROM travel_journal_entries j
     ${tripId ? 'JOIN travel_trip_entries te ON te.journal_entry_id=j.id AND te.trip_id=?' : ''}
     JOIN travel_events e ON e.id = j.travel_event_id
     LEFT JOIN places p ON p.id = j.place_id
     WHERE j.user_id = ? AND e.invalidated_at IS NULL
     ORDER BY j.created_at DESC, j.id DESC LIMIT ?`,
  ).all(...(tripId ? [tripId, userId, Math.max(1, Math.min(100, limit))] : [userId, Math.max(1, Math.min(100, limit))]))).map((found) => ({
    id: found.id,
    kind: found.kind,
    note: found.note,
    visibility: found.visibility,
    createdAt: found.created_at,
    updatedAt: found.updated_at,
    event: {
      id: found.event_id,
      type: found.type,
      sourceKind: found.source_kind,
      sourceRef: found.source_ref,
      placeId: found.place_id,
      questId: found.quest_id,
      partyId: found.party_id,
      occurredAt: found.occurred_at,
      invalidatedAt: null,
      metadata: parseObject(found.payload_json),
    },
    place: found.place_id && found.place_name_en && found.place_name_th
      ? {
          id: found.place_id,
          name: { en: found.place_name_en, th: found.place_name_th },
          photoUrl: found.photo_url,
        }
      : null,
  }));
}

/**
 * Preserve the audit rows but withdraw their user-facing consequences when
 * the ledger source that justified them is reversed.
 */
export function invalidateTravelEventsForLedgerSource(
  db: DB,
  userId: string,
  sourceRef: string,
  invalidatedAt = new Date().toISOString(),
): void {
  const direct = rows<{ id: string }>(db.prepare(
    `SELECT id FROM travel_events
     WHERE user_id = ? AND (
       (source_kind = 'ledger' AND source_ref = ?) OR
       (source_kind = 'adventure' AND source_ref LIKE ?)
     )`,
  ).all(userId, sourceRef, `%${sourceRef}%`));
  db.prepare(
    `UPDATE travel_events SET invalidated_at = ?
     WHERE user_id = ? AND source_kind = 'ledger' AND source_ref = ? AND invalidated_at IS NULL`,
  ).run(invalidatedAt, userId, sourceRef);
  db.prepare(
    `UPDATE travel_events SET invalidated_at = ?
     WHERE user_id = ? AND source_kind = 'adventure' AND source_ref LIKE ? AND invalidated_at IS NULL`,
  ).run(invalidatedAt, userId, `%${sourceRef}%`);
  db.prepare(
    `UPDATE adventure_unlocks SET invalidated_at = ?
     WHERE user_id = ? AND source_ref LIKE ? AND invalidated_at IS NULL`,
  ).run(invalidatedAt, userId, `${sourceRef}%`);
  db.prepare(
    `UPDATE activity_verifications SET invalidated_at = ?
     WHERE user_id = ? AND ledger_source_ref = ? AND invalidated_at IS NULL`,
  ).run(invalidatedAt, userId, sourceRef);
  for (const event of direct) {
    invalidateSeasonProgressForTravelEvent(db, event.id, new Date(invalidatedAt));
    const children = rows<{ id: string }>(db.prepare(
      `SELECT id FROM travel_events WHERE user_id=? AND source_kind='travel_event' AND source_ref LIKE ?`,
    ).all(userId, `%:${event.id}`));
    for (const child of children) invalidateSeasonProgressForTravelEvent(db, child.id, new Date(invalidatedAt));
    db.prepare(
      `UPDATE travel_events SET invalidated_at = ?
       WHERE user_id = ? AND source_kind = 'travel_event' AND source_ref LIKE ? AND invalidated_at IS NULL`,
    ).run(invalidatedAt, userId, `%:${event.id}`);
  }
}

export function updateTravelJournalEntry(
  db: DB,
  userId: string,
  entryId: string,
  patch: { note?: string | null; visibility?: JournalVisibility },
): TravelJournalEntry | null {
  const owned = row<{ id: string }>(
    db.prepare('SELECT id FROM travel_journal_entries WHERE id = ? AND user_id = ?').get(entryId, userId),
  );
  if (!owned) return null;
  const current = row<{ note: string | null; visibility: JournalVisibility }>(db.prepare(
    'SELECT note, visibility FROM travel_journal_entries WHERE id = ?',
  ).get(entryId))!;
  const note = patch.note === undefined ? current.note : patch.note?.trim().slice(0, 1000) || null;
  const visibility = patch.visibility ?? current.visibility;
  db.prepare(
    `UPDATE travel_journal_entries SET note = ?, visibility = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
  ).run(note, visibility, new Date().toISOString(), entryId, userId);
  return travelJournalFor(db, userId, 100).find((entry) => entry.id === entryId) ?? null;
}
