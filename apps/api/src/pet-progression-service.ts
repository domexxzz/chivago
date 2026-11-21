import {
  companionsFor, isPetGesture, petProgressionFor, type PetGesture, type PetMemory, type PetProgression,
} from '@chivago/core';
import { row, type DB } from './db.ts';
import { petMemoriesFor } from './travel-event-service.ts';
import { habitatEvidenceFor } from './wellness-service.ts';

export class PetProgressionError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message); this.name = 'PetProgressionError'; this.code = code; this.status = status;
  }
}

export interface PetProgressionView {
  progression: PetProgression;
  memories: PetMemory[];
  selectedGesture: PetGesture;
}

function ownedKeys(db: DB, userId: string): Set<string> {
  return new Set(companionsFor(habitatEvidenceFor(db, userId)).map((companion) => companion.species.key));
}

export function petProgressionForUser(db: DB, userId: string, companionKey: string): PetProgressionView {
  if (!ownedKeys(db, userId).has(companionKey)) {
    throw new PetProgressionError('PET_NOT_FOUND', 'This companion has not been discovered.', 404);
  }
  const memories = petMemoriesFor(db, userId).filter((memory) => memory.companionKey === companionKey);
  const progression = petProgressionFor(companionKey, memories);
  const preferred = row<{ selected_gesture: string }>(db.prepare(
    'SELECT selected_gesture FROM pet_preferences WHERE user_id=? AND companion_key=?',
  ).get(userId, companionKey))?.selected_gesture;
  const selectedGesture = isPetGesture(preferred) && progression.unlockedGestures.includes(preferred)
    ? preferred : (progression.unlockedGestures.includes('happy') ? 'happy' : progression.unlockedGestures[0]!);
  return { progression, memories, selectedGesture };
}

export function petProgressionsForUser(db: DB, userId: string): PetProgressionView[] {
  return [...ownedKeys(db, userId)].map((key) => petProgressionForUser(db, userId, key));
}

export function selectPetGesture(db: DB, userId: string, companionKey: string, gesture: unknown): PetProgressionView {
  if (!isPetGesture(gesture)) throw new PetProgressionError('GESTURE_INVALID', 'Unknown Pet gesture.');
  const view = petProgressionForUser(db, userId, companionKey);
  if (!view.progression.unlockedGestures.includes(gesture)) {
    throw new PetProgressionError('GESTURE_LOCKED', 'This gesture is not unlocked yet.', 409);
  }
  db.prepare(
    `INSERT INTO pet_preferences (user_id,companion_key,selected_gesture,updated_at)
     VALUES (?,?,?,?) ON CONFLICT(user_id,companion_key) DO UPDATE SET
       selected_gesture=excluded.selected_gesture,updated_at=excluded.updated_at`,
  ).run(userId, companionKey, gesture, new Date().toISOString());
  return { ...view, selectedGesture: gesture };
}
