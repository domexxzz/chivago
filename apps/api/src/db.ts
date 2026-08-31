/**
 * Persistence. Uses node:sqlite (built into Node 22+), so the API has no native
 * build step and runs anywhere Node runs - including a Windows dev machine and
 * a small VPS on the island.
 *
 * SQLite is the right call for the pilot: single-region, read-heavy, a few
 * thousand users. The schema is deliberately plain SQL so the move to Postgres
 * later is a dump-and-load, not a rewrite.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { migrate } from './migrations.ts';

export type DB = DatabaseSync;

/**
 * Schema.
 *
 * Design notes that matter:
 *  - `wallets.trip_points` / `wallets.green_points` are the ONLY places a point
 *    total lives. Never derived on the client, never written by the client.
 *  - `ledger.source_ref` is UNIQUE. That is what makes the reward award
 *    idempotent: a retried verification callback hits the constraint and does
 *    nothing rather than paying twice.
 *  - `quest_progress` is keyed (user, quest) so re-joining is a no-op.
 *  - Times are ISO-8601 UTC strings. SQLite has no date type and storing text
 *    keeps the dumps human-readable.
 */
const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  locale        TEXT NOT NULL DEFAULT 'en',
  created_at    TEXT NOT NULL
);

-- The wellness profile from onboarding. Weights the Healthy Score.
CREATE TABLE IF NOT EXISTS profiles (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  purposes      TEXT NOT NULL DEFAULT '[]',
  activity      TEXT,
  watch         TEXT NOT NULL DEFAULT '[]',
  completed_at  TEXT,
  -- PDPA: consent is specific, logged and timestamped. Storing the notice
  -- version means we can prove WHAT the user agreed to, not just that they did.
  consent_version TEXT,
  consented_at  TEXT
);

CREATE TABLE IF NOT EXISTS places (
  id            TEXT PRIMARY KEY,
  name_en       TEXT NOT NULL,
  name_th       TEXT NOT NULL,
  short         TEXT NOT NULL,
  layer         TEXT NOT NULL,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  meta          TEXT NOT NULL,
  blurb_en      TEXT NOT NULL,
  blurb_th      TEXT NOT NULL,
  tags          TEXT NOT NULL DEFAULT '[]',
  photo_url     TEXT,
  -- The terms the photograph arrived under. Nullable together with the url:
  -- a photo with no credit is one we cannot legally publish.
  photo_credit  TEXT,
  photo_licence TEXT,
  photo_source  TEXT,
  safety_label_en TEXT NOT NULL,
  safety_label_th TEXT NOT NULL,
  -- Baseline metrics. AQI is overwritten by the live feed on read.
  crowd_density REAL NOT NULL,
  aqi           REAL NOT NULL,
  safety_index  REAL NOT NULL,
  walkability   REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_places_bbox ON places(lat, lng);

CREATE TABLE IF NOT EXISTS hosts (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  type  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quests (
  id                TEXT PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,
  name_en           TEXT NOT NULL,
  name_th           TEXT NOT NULL,
  where_label       TEXT NOT NULL,
  duration          TEXT NOT NULL,
  reward_points     INTEGER NOT NULL CHECK (reward_points >= 0),
  reward_currency   TEXT NOT NULL DEFAULT 'green' CHECK (reward_currency IN ('trip','green')),
  host_id           TEXT NOT NULL REFERENCES hosts(id),
  kind              TEXT NOT NULL,
  lat               REAL NOT NULL,
  lng               REAL NOT NULL,
  geofence_radius_m INTEGER NOT NULL
);
`;

const SCHEMA_2 = `
-- Server-owned quest state. The client can request a transition; only the
-- server decides whether it happened.
CREATE TABLE IF NOT EXISTS quest_progress (
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quest_id           TEXT NOT NULL REFERENCES quests(id),
  stage              TEXT NOT NULL,
  joined_at          TEXT,
  arrived_at         TEXT,
  proof_submitted_at TEXT,
  verified_at        TEXT,
  rejected_at        TEXT,
  rejection_reason   TEXT,
  PRIMARY KEY (user_id, quest_id)
);

CREATE TABLE IF NOT EXISTS proofs (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quest_id      TEXT NOT NULL REFERENCES quests(id),
  photos        TEXT NOT NULL DEFAULT '[]',
  weight_kg     REAL,
  submitted_at  TEXT NOT NULL,
  -- Host review outcome. NULL while pending.
  reviewed_at   TEXT,
  approved      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_proofs_pending ON proofs(reviewed_at) WHERE reviewed_at IS NULL;

-- The single source of truth for a point balance.
CREATE TABLE IF NOT EXISTS wallets (
  user_id  TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Two spendable currencies, never one. See @chivago/core types.ts: they
  -- differ in EVIDENCE, and merging them would put self-reported check-ins
  -- into the same total an ESG auditor is asked to trust.
  trip_points  INTEGER NOT NULL DEFAULT 0 CHECK (trip_points >= 0),
  green_points INTEGER NOT NULL DEFAULT 0 CHECK (green_points >= 0),
  -- Lifetime EXP. MONOTONIC: nothing in the codebase may subtract from it.
  -- Progress that a purchase can take away is not progress.
  exp          INTEGER NOT NULL DEFAULT 0 CHECK (exp >= 0)
);

CREATE TABLE IF NOT EXISTS ledger (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  occurred_at  TEXT NOT NULL,
  host         TEXT NOT NULL,
  amount       INTEGER NOT NULL,
  kind         TEXT NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'green' CHECK (currency IN ('trip','green')),
  -- EXP granted by this row; 0 on debits. Stored per row so lifetime EXP is
  -- always reconstructible from the ledger alone if a wallet is ever doubted.
  -- Signed like amount: a REVERSAL of an award takes back the EXP it gave.
  exp          INTEGER NOT NULL DEFAULT 0,
  -- Idempotency. A retried award hits this constraint and pays nothing extra.
  source_ref   TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger(user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS offers (
  id             TEXT PRIMARY KEY,
  category       TEXT NOT NULL,
  name           TEXT NOT NULL,
  merchant       TEXT NOT NULL,
  merchant_short TEXT NOT NULL,
  cost_points    INTEGER NOT NULL CHECK (cost_points > 0),
  currency       TEXT NOT NULL DEFAULT 'green' CHECK (currency IN ('trip','green')),
  image_url      TEXT,
  available      INTEGER NOT NULL DEFAULT 1
);

-- Handoff open question 4: a redemption produces a real voucher, not a toast.
CREATE TABLE IF NOT EXISTS vouchers (
  id           TEXT PRIMARY KEY,
  offer_id     TEXT NOT NULL REFERENCES offers(id),
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merchant     TEXT NOT NULL,
  code         TEXT NOT NULL UNIQUE,
  cost_points  INTEGER NOT NULL,
  issued_at    TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  redeemed_at  TEXT,
  status       TEXT NOT NULL DEFAULT 'active'
);
CREATE INDEX IF NOT EXISTS idx_vouchers_user ON vouchers(user_id, issued_at DESC);

-- Community impact. actual is summed from verified activity; target comes from
-- the ESG owner. The bars are ALWAYS actual/target, never hard-coded.
CREATE TABLE IF NOT EXISTS community_metrics (
  key      TEXT PRIMARY KEY,
  label_en TEXT NOT NULL,
  label_th TEXT NOT NULL,
  actual   REAL NOT NULL DEFAULT 0,
  target   REAL NOT NULL,
  unit     TEXT NOT NULL,
  year     INTEGER NOT NULL
);

-- A live SOS persists across navigation and app restarts (handoff Q5, resolved
-- against the prototype). Storing it server-side is what makes that true.
CREATE TABLE IF NOT EXISTS sos_alerts (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status             TEXT NOT NULL,
  lat                REAL NOT NULL,
  lng                REAL NOT NULL,
  location_label     TEXT NOT NULL,
  fired_at           TEXT NOT NULL,
  resolved_at        TEXT,
  nearest_hospital   TEXT NOT NULL,
  contacts_notified  INTEGER NOT NULL DEFAULT 0,
  interpreter_joining INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sos_active ON sos_alerts(user_id, status);

-- Cache for the per-coordinate air feed, so a map pan does not fan out into
-- dozens of upstream calls. See air.ts.
CREATE TABLE IF NOT EXISTS air_cache (
  grid_key   TEXT PRIMARY KEY,
  aqi        REAL NOT NULL,
  pm25       REAL,
  fetched_at TEXT NOT NULL
);
`;

let instance: DB | null = null;

/** Open (and migrate) the database. Idempotent. */
export function openDb(path = process.env.CHIVAGO_DB ?? './data/chivago.db'): DB {
  if (instance) return instance;
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  db.exec(SCHEMA_2);
  const applied = migrate(db);
  if (applied.length > 0) console.log('[chivago] migrated:', applied.join(', '));
  instance = db;
  return db;
}

/** Fresh in-memory database, for tests. Never memoised. */
export function openTestDb(): DB {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  db.exec(SCHEMA_2);
  migrate(db);
  return db;
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}

/**
 * Nesting depth per database handle. SQLite has no nested BEGIN, so an inner
 * `transact` must join the outer one rather than starting its own.
 */
const depth = new WeakMap<DB, number>();

/**
 * Run `fn` inside a transaction, rolling back on any throw.
 *
 * Point movements MUST go through this - a debit without its ledger row, or a
 * ledger row without its debit, is a support ticket nobody can reconcile.
 *
 * RE-ENTRANT. Services compose: redeeming an offer wraps `spendOnVoucher`,
 * which transacts internally. The outermost call owns BEGIN/COMMIT; inner calls
 * use SAVEPOINTs, so an inner failure rolls back only its own work and an outer
 * failure still discards everything. A plain BEGIN here would throw
 * "cannot start a transaction within a transaction" the moment two services
 * compose - which is exactly what happened the first time this ran.
 */
export function transact<T>(db: DB, fn: () => T): T {
  const level = depth.get(db) ?? 0;
  const nested = level > 0;
  const savepoint = `sp_${level}`;

  db.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE');
  depth.set(db, level + 1);
  try {
    const out = fn();
    db.exec(nested ? `RELEASE ${savepoint}` : 'COMMIT');
    return out;
  } catch (err) {
    db.exec(nested ? `ROLLBACK TO ${savepoint}` : 'ROLLBACK');
    if (nested) db.exec(`RELEASE ${savepoint}`);
    throw err;
  } finally {
    depth.set(db, level);
  }
}

/**
 * Row-type helpers for the node:sqlite boundary.
 *
 * The driver returns `Record<string, SQLOutputValue>`, which does not overlap
 * with a named row interface, so a cast is unavoidable where SQL meets types.
 * It is centralised here rather than repeated at twenty call sites, and it
 * gives one place to add runtime validation if a schema drift ever bites.
 */
export const rows = <T>(result: unknown): T[] => result as T[];
export const row = <T>(result: unknown): T | undefined => result as T | undefined;
