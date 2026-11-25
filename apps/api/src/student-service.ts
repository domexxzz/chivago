/** A self-declared faculty and year, and the counts made from it. See core's student.ts. */

import {
  STUDENT_CONSENT_VERSION, hideSmallGroups, isStudentProfile, type ShownCount, type StudentProfile,
} from '@chivago/core';
import { row, rows, type DB } from './db.ts';

export class InvalidStudent extends Error {
  constructor() {
    super('A student profile needs a listed faculty, a year and the current consent.');
    this.name = 'InvalidStudent';
  }
}

export function studentOf(db: DB, userId: string): StudentProfile | null {
  const r = row<{ university: string; faculty: string; year: string }>(
    db.prepare('SELECT university, faculty, year FROM student_profiles WHERE user_id = ?').get(userId),
  );
  // A faculty that has since left the list reads as not said, rather than as a key.
  return isStudentProfile(r) ? { university: r.university, faculty: r.faculty, year: r.year } : null;
}

/** Kept only with the words that are current: an older app's consent is not this one. */
export function saveStudent(
  db: DB, userId: string, profile: unknown, consentVersion: unknown, now = new Date(),
): StudentProfile {
  if (!isStudentProfile(profile) || consentVersion !== STUDENT_CONSENT_VERSION) throw new InvalidStudent();
  db.prepare(
    `INSERT INTO student_profiles (user_id, university, faculty, year, consent_version, consented_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET university = excluded.university, faculty = excluded.faculty,
       year = excluded.year, consent_version = excluded.consent_version, consented_at = excluded.consented_at`,
  ).run(userId, profile.university, profile.faculty, profile.year, consentVersion, now.toISOString());
  return studentOf(db, userId)!;
}

export function forgetStudent(db: DB, userId: string): void {
  db.prepare('DELETE FROM student_profiles WHERE user_id = ?').run(userId);
}

/** People who joined a host's own activities and said nothing about a faculty. */
export const FACULTY_NOT_SAID = 'not-said';

/**
 * Who took part in a host's activities, by faculty, as counts only.
 *
 * Over everything the host has run and not per activity: an activity of twenty
 * people split twelve ways is twenty people.
 */
export function participationByFaculty(db: DB, hostId: string): ShownCount[] {
  const found = rows<{ faculty: string | null; n: number }>(
    db.prepare(
      `SELECT sp.faculty AS faculty, COUNT(DISTINCT qp.user_id) AS n
         FROM quest_progress qp
         JOIN host_quests hq ON hq.id = qp.quest_id AND hq.host_id = ?
         LEFT JOIN student_profiles sp ON sp.user_id = qp.user_id AND sp.university = hq.area
        GROUP BY sp.faculty`,
    ).all(hostId),
  );
  return hideSmallGroups(found.map((f) => ({ key: f.faculty ?? FACULTY_NOT_SAID, count: f.n })));
}
