/**
 * Persistence, the half that runs anywhere.
 *
 * The schema, `transact`, the row helpers, the `DB` type and the Durable
 * Object driver. NOTHING HERE IMPORTS A NODE BUILTIN, and that is the point:
 * `node:sqlite` does not exist on Cloudflare Workers and `nodejs_compat` does
 * not provide it, so a module holding both drivers would put it in the Workers
 * bundle and nothing would start. The file driver lives in `db-node.ts`, which
 * re-exports all of this.
 *
 * SQLite is still the right call for the pilot: single-region, read-heavy, a
 * few thousand users. The schema is deliberately plain SQL so the move to
 * Postgres later is a dump-and-load, not a rewrite.
 */

import { migrate } from './migrations.ts';
import {
  durableStorageFor,
  openDurableDb,
  registerDurable,
  type DurableStorage,
  type SyncDatabase,
} from './do-storage.ts';

/**
 * The database, as the codebase uses it: `prepare`, `exec`, `close`, and on a
 * statement `get`/`run`/`all`. Counted across `apps/api/src`, that is the
 * WHOLE surface - nothing calls anything else.
 *
 * It was `DatabaseSync` and is now the structural type `DatabaseSync` already
 * satisfies, so every existing call site and signature is unchanged while a
 * second driver (Durable Object storage, see `do-storage.ts`) can also be a
 * `DB`.
 */
export type DB = SyncDatabase;

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
export const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  locale        TEXT NOT NULL DEFAULT 'en',
  created_at    TEXT NOT NULL
);

-- Real database user credentials for login and registration
CREATE TABLE IF NOT EXISTS user_accounts (
  id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email         TEXT UNIQUE,
  phone         TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  account_type  TEXT NOT NULL DEFAULT 'traveller',
  business_name TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
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
  consented_at  TEXT,
  bio           TEXT,
  profile_photo_url TEXT
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

export const SCHEMA_2 = `
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
-- The monster map reads the ledger BY KIND, not by user.
--
-- monster-service.ts derives every monster from deeds instead of storing HP,
-- which is what stops anyone finding the request that decrements it. The cost
-- of deriving is that two queries sweep the ledger for kind = 'walk' and
-- kind = 'quest_reward' on every map load, and the index above starts with
-- user_id, so it could not serve either of them: SQLite answered both with
-- SCAN ledger. Invisible at twenty rows, fatal at a million.
--
-- (kind, occurred_at) and not (kind, currency, occurred_at): see the comment
-- over VERIFIED_QUEST_DEEDS_SQL for why the currency column stays out.
CREATE INDEX IF NOT EXISTS idx_ledger_kind_at ON ledger(kind, occurred_at);

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
  -- Nullable: a phone with no fix still gets to fire. See migrations.ts for
  -- the rebuild that relaxed this on databases created before it was.
  lat                REAL,
  lng                REAL,
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


/**
 * The shape of the schema, as a number somebody bumps.
 *
 * WHY THIS EXISTS, and it is not tidiness. On Node the schema is applied once
 * when the process starts and the process then runs for days. A Durable Object
 * has no such life: it is constructed, it serves, it hibernates, and the next
 * alarm constructs it again. The pilot's alarm fires every thirty seconds, so
 * that is 2,880 constructions a day - and each one was re-applying the whole
 * schema: 142 statements against 222 schema objects, measured, every time.
 *
 * Cloudflare charges Durable Object SQLite by ROWS READ, and a `CREATE TABLE
 * IF NOT EXISTS` reads the schema to find out that the table is there. On
 * 12 November 2026 that arithmetic exhausted the free tier's five million rows
 * in a single day and took the pilot down with `Exceeded allowed rows read`.
 * Almost none of it touched a row of actual data; the database is nearly
 * empty. It was the schema, re-checked 2,880 times.
 *
 * So the object records which version it has and skips the work when it
 * matches. BUMP THIS whenever `SCHEMA`, `SCHEMA_2` or `migrations.ts` changes,
 * or the new column will not exist on a database that already has the old
 * number. `db-schema-version.test.ts` fails when you forget, which is the only
 * reason this is safe to rely on.
 */
export const SCHEMA_VERSION = 1;

/**
 * Open the API's database on Durable Object storage, building the schema and
 * running the migrations exactly as the single-machine deployment does.
 *
 * A Durable Object calls this once from its constructor, inside
 * `blockConcurrencyWhile`, so no request is served against a half-built
 * schema. `migrate: false` leaves that to the caller - see `SCHEMA_VERSION`
 * for why the Worker does exactly that on every boot but the first.
 */
export function openDurableDatabase(
  storage: DurableStorage,
  opts: { migrate?: boolean } = {},
): DB {
  const db = openDurableDb(storage);
  registerDurable(db, storage);
  if (opts.migrate !== false) {
    db.exec(SCHEMA);
    db.exec(SCHEMA_2);
    const applied = migrate(db);
    if (applied.length > 0) console.log('[chivago] migrated:', applied.join(', '));
  }
  return db;
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
  /*
    Durable Object storage refuses BEGIN and SAVEPOINT as SQL and offers
    `transactionSync()` instead - which, measured against workerd, NESTS, and
    on an inner throw caught by the outer transaction discards only the inner
    work. That is the same guarantee the savepoints below give, so re-entrancy
    needs no special handling: hand the nesting to the runtime that owns it.
  */
  const storage = durableStorageFor(db);
  if (storage) return storage.transactionSync(fn);

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
