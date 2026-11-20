/**
 * Schema migrations.
 *
 * Idempotent column adds, run at startup. SQLite has no `ADD COLUMN IF NOT
 * EXISTS`, so each is guarded by a PRAGMA check.
 *
 * Kept separate from the CREATE TABLE statements in db.ts because those only
 * fire on a fresh database: an operator upgrading a running pilot needs their
 * existing rows to gain the new columns, not to be told to start over.
 */

import type { DB } from './db.ts';

interface ColumnInfo {
  name: string;
}

function hasColumn(db: DB, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as ColumnInfo[];
  return cols.some((c) => c.name === column);
}

/**
 * Whether the table is there at all.
 *
 * Most of this file alters tables `db.ts` has created since the first commit,
 * so the question never came up. `offers` and `vouchers` are created by SCHEMA
 * too, but `migrate()` is also called on its own - the legacy fixture in
 * `migrations.test.ts` builds a partial database by hand - and an ALTER
 * against a table that is not there throws rather than being skipped.
 */
function hasTable(db: DB, table: string): boolean {
  const found = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .all(table) as unknown as { name: string }[];
  return found.length > 0;
}

function addColumn(db: DB, table: string, column: string, definition: string): boolean {
  if (hasColumn(db, table, column)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

/**
 * Apply every pending migration. Safe to call on every boot.
 * Returns the list of changes actually made, for the startup log.
 */
export function migrate(db: DB): string[] {
  const applied: string[] = [];

  // -- Host credentials -----------------------------------------------------
  // The console replaced a single CHIVAGO_HOST_SECRET shared by every host.
  // That secret let Samui Municipality approve Ocean Lab's submissions, which
  // is not a permissions nicety - the host is the party vouching for the work,
  // so cross-host approval breaks the entire trust model.
  if (addColumn(db, 'hosts', 'api_key_hash', 'TEXT')) applied.push('hosts.api_key_hash');
  if (addColumn(db, 'hosts', 'contact_email', 'TEXT')) applied.push('hosts.contact_email');
  if (addColumn(db, 'hosts', 'created_at', 'TEXT')) applied.push('hosts.created_at');

  // -- Review audit trail ---------------------------------------------------
  // Who decided, and what they were looking at when they did. A points award
  // that nobody can attribute is a points award nobody can defend.
  if (addColumn(db, 'proofs', 'reviewed_by', 'TEXT')) applied.push('proofs.reviewed_by');
  if (addColumn(db, 'proofs', 'review_note', 'TEXT')) applied.push('proofs.review_note');

  // -- Localisable rejection reason ----------------------------------------
  // The reason is stored as a KEY, not as the sentence the reviewer saw.
  // Thai municipal staff work in Thai; the volunteer may read only English.
  // Storing the reviewer's words would show the volunteer a language they may
  // not read, so the key is translated at render time for whoever is looking.
  // `review_note` stays free text - a human sentence cannot be keyed, and the
  // console warns the reviewer that it will not be translated.
  if (addColumn(db, 'proofs', 'reason_key', 'TEXT')) applied.push('proofs.reason_key');
  // Party members who were inside the fence when this proof was taken, as a
  // JSON list of user ids. One review pays all of them (docs/40).
  if (addColumn(db, 'proofs', 'party_present', 'TEXT')) applied.push('proofs.party_present');
  if (addColumn(db, 'quest_progress', 'rejection_reason_key', 'TEXT')) {
    applied.push('quest_progress.rejection_reason_key');
  }

  // -- Uploaded photo storage ----------------------------------------------
  // Proof photos arrive as phone-local file:// URIs, which no reviewer can
  // open. Uploaded copies live on disk and are referenced here.
  db.exec(`
    CREATE TABLE IF NOT EXISTS proof_files (
      id           TEXT PRIMARY KEY,
      proof_id     TEXT NOT NULL REFERENCES proofs(id) ON DELETE CASCADE,
      storage_path TEXT NOT NULL,
      mime_type    TEXT NOT NULL,
      byte_size    INTEGER NOT NULL,
      -- EXIF capture location, when the phone recorded one.
      lat          REAL,
      lng          REAL,
      taken_at     TEXT,
      uploaded_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_proof_files_proof ON proof_files(proof_id);
  `);

  // -- Console sessions -----------------------------------------------------
  // A reviewer at a municipal desk should not paste an API key on every page
  // load. They exchange it once for a session cookie.
  db.exec(`
    CREATE TABLE IF NOT EXISTS host_sessions (
      token       TEXT PRIMARY KEY,
      host_id     TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      -- Free-text label so an audit entry can name a person, not just a host.
      reviewer    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_host_sessions_expiry ON host_sessions(expires_at);
  `);

  // -- Push notifications ---------------------------------------------------
  db.exec(`
    -- One row per device. A user may have several (phone plus tablet), and a
    -- token can move between users on a shared device, so the token is the key.
    CREATE TABLE IF NOT EXISTS push_tokens (
      token        TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      -- The DEVICE's language, captured at registration. A push is read on a
      -- lock screen where there is no room for two languages, so unlike the
      -- app it commits to one - the one the phone is already set to.
      locale       TEXT NOT NULL DEFAULT 'en',
      platform     TEXT,
      created_at   TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      -- PDPA: a push token is personal data and consent is revocable. Set
      -- rather than deleted, so a re-grant does not look like a new device.
      disabled_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

    -- The OUTBOX, and also the in-app inbox.
    --
    -- Two jobs on purpose. A notification written only to a push service is a
    -- notification that can be lost - permission denied, token expired, phone
    -- in airplane mode for a day. Recording it durably first means the news
    -- survives even when delivery does not, and the app can show an inbox.
    CREATE TABLE IF NOT EXISTS notifications (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind         TEXT NOT NULL,
      -- Template parameters, rendered per reader at send time. Never a
      -- pre-rendered sentence - see NOTIFICATIONS in @chivago/core.
      params       TEXT NOT NULL DEFAULT '{}',
      -- Deep link target, e.g. { "screen": "quest", "questId": "q1" }.
      data         TEXT NOT NULL DEFAULT '{}',
      created_at   TEXT NOT NULL,
      sent_at      TEXT,
      read_at      TEXT,
      attempts     INTEGER NOT NULL DEFAULT 0,
      last_error   TEXT,
      -- Idempotency. A retried host callback must not notify twice.
      dedupe_key   TEXT NOT NULL UNIQUE
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user
      ON notifications(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_pending
      ON notifications(sent_at, attempts) WHERE sent_at IS NULL;
  `);

  // -- SOS dispatch ---------------------------------------------------------
  //
  // The prototype's dispatch panel states "Live location shared with 2
  // contacts" as a fixed string, and the first API kept that as a hard-coded
  // `contacts_notified = 2`. In a safety feature that is not a placeholder, it
  // is a false claim: it tells someone in trouble that help was reached when
  // nothing was sent. Everything below exists so the number is counted, not
  // asserted.
  db.exec(`
    CREATE TABLE IF NOT EXISTS emergency_contacts (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      -- E.164. Stored so a future SMS provider can be dropped in; today it is
      -- shown to the user so THEY can call, which needs no provider at all.
      phone         TEXT,
      relationship  TEXT,
      -- When the contact is also a ChivarGo user, they can be pushed directly.
      -- For a domestic traveller this is the fastest channel we have.
      linked_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_contacts_user ON emergency_contacts(user_id);

    -- One row per delivery ATTEMPT, per channel. This is what makes the
    -- dispatch panel able to say what actually happened rather than what was
    -- intended.
    CREATE TABLE IF NOT EXISTS sos_dispatch (
      id           TEXT PRIMARY KEY,
      alert_id     TEXT NOT NULL REFERENCES sos_alerts(id) ON DELETE CASCADE,
      channel      TEXT NOT NULL,
      -- Who or what was targeted: a contact id, an operator, a phone number.
      target       TEXT NOT NULL,
      target_label TEXT NOT NULL,
      status       TEXT NOT NULL,
      detail       TEXT,
      attempted_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dispatch_alert ON sos_dispatch(alert_id);
  `);

  // A public, unguessable, expiring link to the live location. This is the
  // channel that works with no provider account and no app install on the other
  // end: the person in trouble sends it through LINE, WhatsApp or SMS from
  // their own phone, and a family member abroad opens it in a browser.
  if (addColumn(db, 'sos_alerts', 'share_token', 'TEXT')) applied.push('sos_alerts.share_token');
  if (addColumn(db, 'sos_alerts', 'acknowledged_at', 'TEXT')) applied.push('sos_alerts.acknowledged_at');
  if (addColumn(db, 'sos_alerts', 'acknowledged_by', 'TEXT')) applied.push('sos_alerts.acknowledged_by');
  // The firing position is where it started. Someone in trouble may be moving.
  if (addColumn(db, 'sos_alerts', 'last_lat', 'REAL')) applied.push('sos_alerts.last_lat');
  if (addColumn(db, 'sos_alerts', 'last_lng', 'REAL')) applied.push('sos_alerts.last_lng');
  if (addColumn(db, 'sos_alerts', 'last_position_at', 'TEXT')) {
    applied.push('sos_alerts.last_position_at');
  }
  if (addColumn(db, 'sos_alerts', 'note', 'TEXT')) applied.push('sos_alerts.note');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sos_share ON sos_alerts(share_token)');

  // -- SOS escalation -------------------------------------------------------
  //
  // One row per rung of the ladder per alert, with a UNIQUE constraint doing
  // the idempotency. The ticker runs every 30 seconds; without this, a rung
  // due at T+120s would re-fire on every tick for the rest of the emergency,
  // and the person in trouble would be buried in identical notifications at
  // the worst possible moment.
  db.exec(`
    CREATE TABLE IF NOT EXISTS sos_escalations (
      id         TEXT PRIMARY KEY,
      alert_id   TEXT NOT NULL REFERENCES sos_alerts(id) ON DELETE CASCADE,
      rung       TEXT NOT NULL,
      fired_at   TEXT NOT NULL,
      -- What the rung actually managed to do, for the incident record.
      outcome    TEXT NOT NULL DEFAULT '{}',
      UNIQUE (alert_id, rung)
    );
    CREATE INDEX IF NOT EXISTS idx_escalations_alert ON sos_escalations(alert_id);
  `);

  // -- Position trail -------------------------------------------------------
  //
  // A single "last known position" is not enough to find someone. If a phone
  // dies mid-emergency, the last point tells you where they stopped
  // transmitting; the TRAIL tells you which way they were heading and how fast,
  // which is what a searcher actually needs.
  db.exec(`
    CREATE TABLE IF NOT EXISTS sos_positions (
      id          TEXT PRIMARY KEY,
      alert_id    TEXT NOT NULL REFERENCES sos_alerts(id) ON DELETE CASCADE,
      lat         REAL NOT NULL,
      lng         REAL NOT NULL,
      -- Metres. A 2 km fix is worse than useless if shown as a pin.
      accuracy_m  REAL,
      -- foreground | background | queued. A queued point arrived late, after
      -- the device regained signal, and must not be read as current.
      source      TEXT NOT NULL DEFAULT 'foreground',
      -- When the DEVICE recorded it, which is not when the server received it.
      recorded_at TEXT NOT NULL,
      received_at TEXT NOT NULL,
      UNIQUE (alert_id, recorded_at)
    );
    CREATE INDEX IF NOT EXISTS idx_positions_alert
      ON sos_positions(alert_id, recorded_at DESC);
  `);

  // -- Two currencies and EXP ----------------------------------------------
  //
  // A pilot database already holds real balances and a real ledger, so this
  // has to carry them across rather than start clean.
  //
  // Every historical point was awarded by `awardQuestReward` after a host
  // approved a geofenced photo. That is precisely the Green definition, so
  // the backfill puts the old balance in green_points and defaults every old
  // ledger row to green. Nothing existing becomes Trip by accident, which
  // matters because Trip is the currency deliberately excluded from any
  // impact claim.
  const ledgerCurrency = addColumn(db, 'ledger', 'currency',
    "TEXT NOT NULL DEFAULT 'green'");
  if (ledgerCurrency) applied.push('ledger.currency');
  if (addColumn(db, 'ledger', 'exp', 'INTEGER NOT NULL DEFAULT 0')) {
    applied.push('ledger.exp');
    // Credits earned EXP; debits never did and never will. Backfilling from
    // the ledger rather than from the balance means a user who has already
    // spent keeps the level they worked for.
    db.exec('UPDATE ledger SET exp = amount WHERE amount > 0');
  }
  if (addColumn(db, 'quests', 'reward_currency', "TEXT NOT NULL DEFAULT 'green'")) {
    applied.push('quests.reward_currency');
  }
  if (addColumn(db, 'quests', 'reward_exp', 'INTEGER')) {
    applied.push('quests.reward_exp');
  }
  if (addColumn(db, 'offers', 'currency', "TEXT NOT NULL DEFAULT 'green'")) {
    applied.push('offers.currency');
  }

  // wallets needs a rebuild, not an ALTER: the old CHECK (balance >= 0) names
  // a column we are removing, and SQLite refuses to drop a column a
  // constraint mentions.
  if (hasColumn(db, 'wallets', 'balance')) {
    db.exec(`
      ALTER TABLE wallets RENAME TO wallets_legacy;
      CREATE TABLE wallets (
        user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        trip_points  INTEGER NOT NULL DEFAULT 0 CHECK (trip_points >= 0),
        green_points INTEGER NOT NULL DEFAULT 0 CHECK (green_points >= 0),
        exp          INTEGER NOT NULL DEFAULT 0 CHECK (exp >= 0)
      );
      INSERT INTO wallets (user_id, trip_points, green_points, exp)
        SELECT w.user_id, 0, w.balance,
               COALESCE((SELECT SUM(l.amount) FROM ledger l
                         WHERE l.user_id = w.user_id AND l.amount > 0), 0)
        FROM wallets_legacy w;
      DROP TABLE wallets_legacy;
    `);
    applied.push('wallets.split(trip,green,exp)');
  }

  // -- Traveller reviews ----------------------------------------------------
  //
  // UNIQUE (place_id, user_id): one review per person per place, editable.
  // Without it, one traveller with an opinion can bury a place under twenty
  // one-star rows, and the whole "verified" claim buys us nothing.
  //
  // `visited_at` is copied from the check-in that unlocked the review, so the
  // row carries its own evidence of presence even if the ledger is later
  // trimmed.
  //
  // `hidden_at` exists because a review system with no way to take something
  // down is a liability - defamation, a phone number, a named member of staff.
  // There is no moderation SCREEN yet; see docs/12-reviews.md.
  db.exec(`
    CREATE TABLE IF NOT EXISTS place_reviews (
      id          TEXT PRIMARY KEY,
      place_id    TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      body        TEXT,
      -- The language it was WRITTEN in. Labelled to the reader, never
      -- auto-translated.
      language    TEXT NOT NULL DEFAULT 'en',
      visited_at  TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      updated_at  TEXT,
      hidden_at   TEXT,
      hidden_reason TEXT,
      UNIQUE (place_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_place
      ON place_reviews(place_id, created_at DESC);
  `);

  // -- Review moderation ----------------------------------------------------
  //
  // A ROLE, not a blanket permission. The proof queue is host-scoped because
  // the host is the party vouching for the work. Reviews are about PLACES,
  // which no host owns, so scoping cannot decide this - and letting any
  // console holder hide any review would hand a hotel partner the ability to
  // bury a bad review of the beach beside a competitor. That is a sharper
  // conflict than the SOS desk has, so it gets a separate role rather than a
  // widened one.
  if (addColumn(db, 'hosts', 'role', "TEXT NOT NULL DEFAULT 'host'")) {
    applied.push('hosts.role');
  }
  // Who took it down, and under which keyed reason. An operator note may be
  // added in `hidden_reason` for the record; it is NOT shown to the author,
  // because a sentence typed in Thai is no use to a German traveller.
  if (addColumn(db, 'place_reviews', 'hidden_by', 'TEXT')) {
    applied.push('place_reviews.hidden_by');
  }
  if (addColumn(db, 'place_reviews', 'hidden_reason_key', 'TEXT')) {
    applied.push('place_reviews.hidden_reason_key');
  }

  // -- Review reports -------------------------------------------------------
  //
  // A report is a SIGNAL, never an action. Nothing in this table hides
  // anything: no threshold, no auto-removal, no count that trips a switch.
  // The only thing that takes a review down is a moderator pressing a button
  // and recording a reason. That is what stops a coordinated pile-on from
  // being a censorship tool.
  //
  // UNIQUE (review_id, reporter_id): one voice per reader, so twenty reports
  // means twenty people, not one person twenty times.
  //
  // Reporting does NOT require having checked in. The person most likely to
  // spot a review naming their child is a local reading it, not a tourist who
  // happened to be on that beach.
  db.exec(`
    CREATE TABLE IF NOT EXISTS review_reports (
      id          TEXT PRIMARY KEY,
      review_id   TEXT NOT NULL REFERENCES place_reviews(id) ON DELETE CASCADE,
      reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason_key  TEXT NOT NULL,
      note        TEXT,
      created_at  TEXT NOT NULL,
      -- Set when a moderator has acted or decided no action is needed. An
      -- unresolved report is the queue; a resolved one is the record.
      resolved_at TEXT,
      resolved_by TEXT,
      UNIQUE (review_id, reporter_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reports_open
      ON review_reports(review_id) WHERE resolved_at IS NULL;
  `);

  // What the moderator decided, so the reporter can be told and so a
  // reporter's track record can be read. Derivable from the review's hidden
  // state at resolve time, but only at that instant - a later restore would
  // rewrite history, and "your report was upheld" must not become false
  // because somebody appealed a week later.
  if (addColumn(db, 'review_reports', 'outcome', 'TEXT')) {
    applied.push('review_reports.outcome');
  }

  // -- Moderation audit log -------------------------------------------------
  //
  // APPEND-ONLY, and not derivable from the review rows. `restoreReview`
  // clears hidden_at and hidden_by on purpose, so no scar follows an author
  // around after a decision was reversed - but that also erased the record
  // that a moderator ever acted. Both things are wanted: the review carries
  // no mark, and the operator record is complete. Only a separate log gives
  // you both.
  db.exec(`
    CREATE TABLE IF NOT EXISTS moderation_log (
      id         TEXT PRIMARY KEY,
      -- hide | restore | dismiss | appeal_declined
      action     TEXT NOT NULL,
      -- NOT a foreign key. The log must survive the review being deleted:
      -- an audit trail that a subject can erase by withdrawing is not one.
      review_id  TEXT NOT NULL,
      place_id   TEXT,
      moderator  TEXT NOT NULL,
      reason_key TEXT,
      note       TEXT,
      acted_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_modlog_time ON moderation_log(acted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_modlog_review ON moderation_log(review_id);
  `);

  // -- Appeals --------------------------------------------------------------
  //
  // The author of a taken-down review can say why they think it was wrong.
  // Without this the accountability runs one way: we tell them, they cannot
  // answer. `message` is free text and stays as typed - a person defending
  // their own words cannot be made to pick from a list.
  db.exec(`
    CREATE TABLE IF NOT EXISTS review_appeals (
      id          TEXT PRIMARY KEY,
      review_id   TEXT NOT NULL REFERENCES place_reviews(id) ON DELETE CASCADE,
      author_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message     TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      -- upheld (review restored) | declined (decision stands)
      outcome     TEXT,
      resolved_at TEXT,
      resolved_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_appeals_open
      ON review_appeals(review_id) WHERE resolved_at IS NULL;
  `);

  // -- Per-user quiet hours -------------------------------------------------
  //
  // The island default is 22:00-07:00, which is right for most people and
  // wrong for a night-shift worker and for anyone who would rather be woken
  // than miss a quest result. NULL means "use the default", so the columns
  // stay empty for everybody who never touches the setting.
  if (addColumn(db, 'profiles', 'quiet_enabled', 'INTEGER NOT NULL DEFAULT 1')) {
    applied.push('profiles.quiet_enabled');
  }
  if (addColumn(db, 'profiles', 'quiet_from', 'INTEGER')) applied.push('profiles.quiet_from');
  if (addColumn(db, 'profiles', 'quiet_until', 'INTEGER')) {
    applied.push('profiles.quiet_until');
  }

  // -- Bulk take-down, with a second approver -------------------------------
  //
  // One moderator proposes, a DIFFERENT one approves, and only then does the
  // batch execute - without the per-moderator rate limit, which is the whole
  // point. The cap exists to contain one compromised account; two accounts
  // agreeing is a different risk, and a slower one.
  db.exec(`
    CREATE TABLE IF NOT EXISTS review_batches (
      id          TEXT PRIMARY KEY,
      -- One reason for the whole batch. That is what makes it a batch rather
      -- than a hundred separate judgements wearing one button.
      reason_key  TEXT NOT NULL,
      note        TEXT,
      -- JSON array of review ids, frozen at proposal time. Resolving them
      -- later would let the set drift between what was approved and what was
      -- executed, which is the one thing an approval must not allow.
      review_ids  TEXT NOT NULL,
      proposed_by TEXT NOT NULL,
      proposed_at TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      approved_by TEXT,
      approved_at TEXT,
      executed_at TEXT,
      -- pending | approved | cancelled | expired
      status      TEXT NOT NULL DEFAULT 'pending',
      -- How many actually came down. Counted, never assumed: a review the
      -- author withdrew between proposal and approval is simply not there.
      hidden_count INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_batches_pending
      ON review_batches(status) WHERE status = 'pending';
  `);

  /**
   * The terms a place photograph arrived under.
   *
   * `photo_url` shipped in the first schema; the credit did not, which made
   * every licence worth using unusable. Added as columns rather than a fresh
   * table so an existing database picks them up - CREATE TABLE IF NOT EXISTS
   * does nothing to a table that already exists, which is exactly how this
   * was noticed.
   */
  if (addColumn(db, 'places', 'photo_credit', 'TEXT')) applied.push('places.photo_credit');
  if (addColumn(db, 'places', 'photo_licence', 'TEXT')) applied.push('places.photo_licence');
  if (addColumn(db, 'places', 'photo_source', 'TEXT')) applied.push('places.photo_source');

  /**
   * Mood check-ins.
   *
   * One row per check-in rather than a current-mood column: the whole point
   * is the sequence. A single overwritten value could not tell yesterday's
   * bad afternoon from a week of them.
   *
   * The note is stored verbatim and never parsed. It exists so a person can
   * read back what they wrote, not so the app can interpret it.
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS mood_checkins (
      id       TEXT PRIMARY KEY,
      user_id  TEXT NOT NULL,
      mood     TEXT NOT NULL,
      note     TEXT,
      at       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mood_user_at ON mood_checkins(user_id, at DESC);
  `);
  applied.push('mood_checkins');

  /*
    Air, remembered.
    ----------------
    air_cache holds one row per grid cell: the latest reading, for the TTL.
    Nothing kept what the air WAS, so "was yesterday better" had no answer
    and the place screen could only ever say now. Every fresh fetch also
    appends here, keyed by the model's own observation time so a re-fetch of
    the same hour is not a second sample. Nothing is invented backwards: the
    history starts the day the server started recording, and says so.
  */
  db.exec(`
    CREATE TABLE IF NOT EXISTS air_history (
      grid_key    TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      aqi         REAL NOT NULL,
      pm25        REAL,
      fetched_at  TEXT NOT NULL,
      PRIMARY KEY (grid_key, observed_at)
    );
    CREATE INDEX IF NOT EXISTS idx_air_history_cell ON air_history(grid_key, observed_at DESC);
  `);
  applied.push('air_history');

  /*
    Give mood_checkins the foreign key it shipped without.
    ------------------------------------------------------
    A PDPA defect, found by auditing what `DELETE /profile` actually removes.
    Every other user-owned table cascades; this one had no `REFERENCES` at all,
    so deleting a traveller took their wallet, ledger, moods' NEIGHBOURS — and
    left the mood rows themselves behind, free-text notes included. Somebody
    exercising their right to erasure kept a record of how they felt.

    SQLite cannot add a constraint with ALTER TABLE, so the table is rebuilt.
    The copy is filtered on the user still existing, which is what deletes the
    rows already orphaned by deletions that happened before this ran — the
    migration is the erasure those requests were owed.
  */
  // Raw `.all()` rather than the `rows` helper: db.ts imports this file, so
  // importing back from it would close a cycle for one type assertion.
  const moodFks = db
    .prepare("SELECT `from` AS col FROM pragma_foreign_key_list('mood_checkins')")
    .all() as unknown as { col: string }[];
  const moodHasFk = moodFks.some((f) => f.col === 'user_id');

  if (!moodHasFk) {
    // Constraint enforcement is suspended for the swap, per SQLite's own
    // documented procedure for altering a table, and restored immediately.
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`
      BEGIN;
      CREATE TABLE mood_checkins_rebuilt (
        id       TEXT PRIMARY KEY,
        user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mood     TEXT NOT NULL,
        note     TEXT,
        at       TEXT NOT NULL
      );
      INSERT INTO mood_checkins_rebuilt (id, user_id, mood, note, at)
        SELECT m.id, m.user_id, m.mood, m.note, m.at
        FROM mood_checkins m
        WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = m.user_id);
      DROP TABLE mood_checkins;
      ALTER TABLE mood_checkins_rebuilt RENAME TO mood_checkins;
      CREATE INDEX IF NOT EXISTS idx_mood_user_at ON mood_checkins(user_id, at DESC);
      COMMIT;
    `);
    db.exec('PRAGMA foreign_keys = ON');
    applied.push('mood_checkins.user_id → users ON DELETE CASCADE');
  }

  // Which province a place is in, so the passport counts provinces from the
  // ledger rather than keeping a second record of where somebody went.
  if (addColumn(db, 'places', 'province', 'TEXT')) {
    applied.push('places.province');
  }

  // Which batch a take-down belonged to, so the audit page can show that it
  // was authorised by two people rather than taken alone.
  if (addColumn(db, 'moderation_log', 'batch_id', 'TEXT')) {
    applied.push('moderation_log.batch_id');
  }

  // -- Accounts -------------------------------------------------------------
  //
  // Until now a caller said who they were in a header and the server believed
  // it. That was defensible with one user and no way to be a second one; it
  // stops being defensible the moment two people exist, because reading
  // somebody else's wallet, moods and emergency contacts would take one
  // changed header.
  db.exec(`
    -- One row per DEVICE, not per person: a person may hold several, and the
    -- point of the whole table is that a device can prove which person it is.
    CREATE TABLE IF NOT EXISTS device_keys (
      -- SHA-256 of the token, hex. Not scrypt, and the difference is entropy
      -- rather than effort: scrypt exists to make guessing a human-chosen
      -- password expensive, and these tokens are 256 random bits, which no
      -- amount of hashing speed brings within reach. Hashing at all is so a
      -- leaked database backup does not contain usable keys.
      key_hash     TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      -- What the person would call this phone. Optional, and never required:
      -- under PDPA the least personal data is the safest amount.
      label        TEXT,
      created_at   TEXT NOT NULL,
      last_seen_at TEXT,
      -- Revoked rather than deleted, so "this phone was removed on the 3rd"
      -- stays answerable. A revoked row still refuses the key.
      revoked_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_device_keys_user ON device_keys(user_id);

    -- A short-lived code that moves an account onto a second phone.
    --
    -- No password and no email anywhere in this design. The safest credential
    -- is the one that is never collected: a tourist gets their progress onto a
    -- new phone by reading eight characters off the old one.
    CREATE TABLE IF NOT EXISTS link_codes (
      code_hash  TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      -- Single use. Set on claim, and checked before the expiry is, so a
      -- replayed code reads as "already used" rather than "expired".
      claimed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_link_codes_user ON link_codes(user_id);
  `);
  applied.push('device_keys');
  applied.push('link_codes');

  // -- Parties --------------------------------------------------------------
  //
  // Who somebody is travelling with. There is no points table here and there
  // never will be: a party aggregates what its members separately earned, so
  // the only rows needed are who is in it.
  db.exec(`
    CREATE TABLE IF NOT EXISTS parties (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      -- The join code, hashed like every other credential in this schema. It
      -- is long-lived rather than single-use, which is the trade for letting a
      -- group of ten join over a weekend without re-reading it each time.
      code_hash    TEXT NOT NULL UNIQUE,
      created_by   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at   TEXT NOT NULL,
      -- Disbanded rather than deleted, so a member's history of "who was I
      -- travelling with in September" survives the group breaking up.
      disbanded_at TEXT
    );

    CREATE TABLE IF NOT EXISTS party_members (
      party_id  TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
      user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL,
      -- Left rather than removed, for the same reason. A row that vanishes
      -- takes the answer to "were they there when we did that" with it.
      left_at   TEXT,
      PRIMARY KEY (party_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_party_members_user ON party_members(user_id, left_at);
  `);
  applied.push('parties');
  applied.push('party_members');

  // Party live collaboration. Location is deliberately isolated from the
  // public member/invitation views: only authenticated members can query it.
  if (addColumn(db, 'parties', 'photo_mime', 'TEXT')) applied.push('parties.photo_mime');
  if (addColumn(db, 'parties', 'photo_bytes', 'BLOB')) applied.push('parties.photo_bytes');
  if (addColumn(db, 'party_members', 'sharing_enabled', 'INTEGER NOT NULL DEFAULT 0')) applied.push('party_members.sharing_enabled');
  if (addColumn(db, 'party_members', 'last_seen_at', 'TEXT')) applied.push('party_members.last_seen_at');
  if (addColumn(db, 'party_members', 'distance_travelled_m', 'REAL NOT NULL DEFAULT 0')) applied.push('party_members.distance_travelled_m');
  db.exec(`
    CREATE TABLE IF NOT EXISTS party_locations (
      party_id   TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      latitude   REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),
      longitude  REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),
      accuracy   REAL,
      heading    REAL,
      speed      REAL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (party_id, user_id),
      FOREIGN KEY (party_id, user_id) REFERENCES party_members(party_id, user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_party_locations_updated ON party_locations(party_id, updated_at);

    CREATE TABLE IF NOT EXISTS party_meeting_points (
      party_id   TEXT PRIMARY KEY REFERENCES parties(id) ON DELETE CASCADE,
      set_by     TEXT NOT NULL REFERENCES users(id),
      latitude   REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),
      longitude  REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),
      label      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS party_messages (
      id         TEXT PRIMARY KEY,
      party_id   TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL REFERENCES users(id),
      kind       TEXT NOT NULL CHECK(kind IN ('chat','ping')),
      body       TEXT NOT NULL,
      ping_kind  TEXT,
      place_id   TEXT REFERENCES places(id),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_party_messages_feed ON party_messages(party_id, created_at, id);

    CREATE TABLE IF NOT EXISTS party_itinerary (
      id         TEXT PRIMARY KEY,
      party_id   TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
      place_id   TEXT NOT NULL REFERENCES places(id),
      position   INTEGER NOT NULL CHECK(position >= 0),
      added_by   TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      UNIQUE(party_id, place_id)
    );
    CREATE INDEX IF NOT EXISTS idx_party_itinerary_order ON party_itinerary(party_id, position);

    CREATE TABLE IF NOT EXISTS party_trip_summaries (
      party_id             TEXT PRIMARY KEY REFERENCES parties(id) ON DELETE CASCADE,
      party_name           TEXT NOT NULL,
      started_at           TEXT NOT NULL,
      ended_at             TEXT NOT NULL,
      member_count         INTEGER NOT NULL,
      message_count        INTEGER NOT NULL,
      itinerary_json       TEXT NOT NULL,
      distance_travelled_m REAL NOT NULL DEFAULT 0
    );
  `);
  applied.push('party_live_collaboration');

  // Party Quest foundation. Legacy quest_progress remains untouched: a
  // Party Quest has its own lifecycle and an immutable start-time roster.
  db.exec(`
    CREATE TABLE IF NOT EXISTS party_quest_instances (
      id               TEXT PRIMARY KEY,
      party_id         TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
      quest_id         TEXT NOT NULL REFERENCES quests(id),
      quest_type       TEXT NOT NULL CHECK(quest_type IN ('exploration','eco','local','boss')),
      quest_mode       TEXT NOT NULL CHECK(quest_mode IN ('individual','collective','all_members','cooperative')),
      state            TEXT NOT NULL CHECK(state IN ('selected','in_progress','verifying','completed','rewarded','failed','expired','cancelled')),
      rules_version    TEXT NOT NULL,
      quest_snapshot   TEXT NOT NULL,
      selected_by      TEXT NOT NULL REFERENCES users(id),
      selected_at      TEXT NOT NULL,
      started_at       TEXT,
      roster_locked_at TEXT,
      cancelled_at     TEXT,
      completed_at     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_party_quest_party_state
      ON party_quest_instances(party_id, state, selected_at DESC);
    CREATE INDEX IF NOT EXISTS idx_party_quest_quest
      ON party_quest_instances(quest_id, selected_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_party_quest_one_active
      ON party_quest_instances(party_id)
      WHERE state IN ('selected','in_progress','verifying');

    CREATE TABLE IF NOT EXISTS party_quest_participants (
      party_quest_id          TEXT NOT NULL REFERENCES party_quest_instances(id) ON DELETE CASCADE,
      user_id                 TEXT NOT NULL REFERENCES users(id),
      display_name_snapshot   TEXT NOT NULL,
      owner_at_start          INTEGER NOT NULL DEFAULT 0 CHECK(owner_at_start IN (0,1)),
      membership_status      TEXT NOT NULL DEFAULT 'active' CHECK(membership_status IN ('active','left')),
      rostered_at             TEXT NOT NULL,
      left_party_at           TEXT,
      rejoined_at             TEXT,
      completed_at            TEXT,
      PRIMARY KEY (party_quest_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_party_quest_participant_user
      ON party_quest_participants(user_id, party_quest_id);
    CREATE INDEX IF NOT EXISTS idx_party_quest_participant_status
      ON party_quest_participants(party_quest_id, membership_status);
  `);
  applied.push('party_quest_foundation');

  // Which ESG pillar a quest reports under.
  //
  // NULLABLE on purpose, and quests without one are EXCLUDED from an ESG
  // report rather than guessed at. Deriving a pillar from the place's habitat
  // layer would be defensible for a beach cleanup and wrong for half the
  // others, and the wrongness would land inside a document somebody signs.
  if (addColumn(db, 'quests', 'esg_pillar', 'TEXT')) {
    applied.push('quests.esg_pillar');
  }

  /*
    Let an alert exist without a position.
    ---------------------------------------
    `lat` and `lng` were NOT NULL, so `POST /sos` from a phone that could not
    get a fix - permission refused, GPS dead, a basement - substituted a fixed
    point at Bophut. The desk then drew a confident pin for somebody who could
    have been anywhere on the island, and nothing on it could tell that pin
    from a real one. In the one module whose rule is "never claim what did
    not happen", that was the largest claim of all.

    SQLite cannot drop NOT NULL with ALTER TABLE, so the table is rebuilt the
    same way mood_checkins was. Children (sos_dispatch, sos_positions,
    sos_escalations) reference sos_alerts by name; with constraint enforcement
    suspended for the swap, the drop-and-rename leaves those references
    pointing at the new table.
  */
  const sosCols = db
    .prepare("SELECT name, \"notnull\" AS nn FROM pragma_table_info('sos_alerts')")
    .all() as unknown as { name: string; nn: number }[];
  if (sosCols.find((c) => c.name === 'lat')?.nn === 1) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`
      BEGIN;
      CREATE TABLE sos_alerts_rebuilt (
        id                  TEXT PRIMARY KEY,
        user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status              TEXT NOT NULL,
        lat                 REAL,
        lng                 REAL,
        location_label      TEXT NOT NULL,
        fired_at            TEXT NOT NULL,
        resolved_at         TEXT,
        nearest_hospital    TEXT NOT NULL,
        contacts_notified   INTEGER NOT NULL DEFAULT 0,
        interpreter_joining INTEGER NOT NULL DEFAULT 0,
        share_token         TEXT,
        acknowledged_at     TEXT,
        acknowledged_by     TEXT,
        last_lat            REAL,
        last_lng            REAL,
        last_position_at    TEXT,
        note                TEXT
      );
      INSERT INTO sos_alerts_rebuilt
        (id, user_id, status, lat, lng, location_label, fired_at, resolved_at,
         nearest_hospital, contacts_notified, interpreter_joining, share_token,
         acknowledged_at, acknowledged_by, last_lat, last_lng, last_position_at, note)
        SELECT id, user_id, status, lat, lng, location_label, fired_at, resolved_at,
               nearest_hospital, contacts_notified, interpreter_joining, share_token,
               acknowledged_at, acknowledged_by, last_lat, last_lng, last_position_at, note
        FROM sos_alerts;
      DROP TABLE sos_alerts;
      ALTER TABLE sos_alerts_rebuilt RENAME TO sos_alerts;
      CREATE INDEX IF NOT EXISTS idx_sos_active ON sos_alerts(user_id, status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sos_share ON sos_alerts(share_token);
      COMMIT;
    `);
    db.exec('PRAGMA foreign_keys = ON');
    applied.push('sos_alerts.lat/lng nullable');
  }

  // -- A ledger row the reader's own language can compose ------------------
  // `label` is a finished English sentence: "Checked in · Lamai Beach". The
  // app now shows one language, so a Thai reader met English in their own
  // wallet. The SUBJECT - the quest, the place, the offer - is the only part
  // that is data; everything around it is a sentence the client can write in
  // whichever language is being read, from the `kind` it already receives.
  //
  // Additive on purpose. The ledger is append-only and rows written before
  // this have no subject; they keep rendering their stored English label,
  // which is what they actually said at the time.
  if (addColumn(db, 'ledger', 'subject', 'TEXT')) applied.push('ledger.subject');

  // -- A quest that says where and how long in the reader's language --------
  // `where_label` and `duration` were single English strings, written when the
  // app printed English with Thai captioned underneath. It shows one language
  // now, so a Thai reader met "Chaweng Beach · 45 min" on their own mission
  // card. Additive, and nullable: a row without the Thai falls back to the
  // English it already had, which is what it actually said.
  if (addColumn(db, 'quests', 'where_label_th', 'TEXT')) applied.push('quests.where_label_th');
  if (addColumn(db, 'quests', 'duration_th', 'TEXT')) applied.push('quests.duration_th');
  // A ground station within reach of the place, as JSON, or NULL for the
  // island (docs/43). Read by air.ts; written by the seed.
  if (addColumn(db, 'places', 'air_station', 'TEXT')) applied.push('places.air_station');
  // The place's own booking page, or NULL for a place you just walk into.
  // Written by the seed; read by repo.ts, which drops anything that is not a
  // plain https link (isBookingLink) before it reaches a phone.
  if (addColumn(db, 'places', 'booking_url', 'TEXT')) applied.push('places.booking_url');

  // -- Self-issued visits: recorded, not scored ----------------------------
  //
  // A visit the phone could not prove. Its own table, deliberately: nothing
  // here joins to the ledger, so nothing here can pay, hatch a companion or
  // unlock a review. UNIQUE (user, place) because the second claim on the
  // same beach is a duplicate. `year_key` is the ISLAND year the stamp
  // counts against - see packages/core/src/visits.ts.
  db.exec(`
    CREATE TABLE IF NOT EXISTS self_visits (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      place_id    TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
      visited_at  TEXT NOT NULL,
      year_key    TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      UNIQUE (user_id, place_id)
    );
    CREATE INDEX IF NOT EXISTS idx_self_visits_user_year
      ON self_visits(user_id, year_key);
  `);

  // -- The last fix the server accepted from each traveller ---------------
  //
  // So the next one can be judged against it: two fixes across the island
  // half a minute apart is teleporting. One row per user, overwritten - the
  // history is not the point, the speed is. See packages/core/src/presence.ts.
  db.exec(`
    CREATE TABLE IF NOT EXISTS last_fix (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      lat     REAL NOT NULL,
      lng     REAL NOT NULL,
      at      TEXT NOT NULL
    );
  `);

  // -- Statements of verified activity: the evidence layer -----------------
  //
  // Issued once and never edited. The trigger makes SQLite refuse an UPDATE,
  // so the only way to change what a hotel filed is to issue another one;
  // the digest is recomputed on read so a row replaced behind the trigger is
  // refused too. DELETE is allowed: a demo reset clears travellers and the
  // statements about them together. See packages/core/src/statement.ts.
  db.exec(`
    CREATE TABLE IF NOT EXISTS statements (
      id           TEXT PRIMARY KEY,
      host_id      TEXT NOT NULL REFERENCES hosts(id),
      period_from  TEXT NOT NULL,
      period_to    TEXT NOT NULL,
      issued_at    TEXT NOT NULL,
      issued_by    TEXT,
      body         TEXT NOT NULL,
      digest       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_statements_host ON statements(host_id, issued_at);
    CREATE TRIGGER IF NOT EXISTS statements_are_append_only
      BEFORE UPDATE ON statements
      BEGIN SELECT RAISE(ABORT, 'statements are append-only: issue another'); END;
  `);

  // -- Stories: a clip or a photograph, pinned on a place by someone there --
  //
  // Pending until a host approves; expires seven days on, file and all.
  // See story-service.ts and docs/44.
  db.exec(`
    CREATE TABLE IF NOT EXISTS stories (
      id            TEXT PRIMARY KEY,
      place_id      TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind          TEXT NOT NULL CHECK (kind IN ('video','photo')),
      caption       TEXT NOT NULL DEFAULT '',
      media_path    TEXT NOT NULL,
      media_mime    TEXT NOT NULL,
      poster_path   TEXT,
      duration_s    REAL,
      status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','hidden')),
      created_at    TEXT NOT NULL,
      expires_at    TEXT NOT NULL,
      reviewed_at   TEXT,
      reviewed_by   TEXT,
      reviewer_host TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_stories_place ON stories(place_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id, created_at);
  `);
  /*
    Story bytes, in the row rather than beside it.

    LiteFS replicates the database file and nothing else, so a clip whose
    bytes live in /data/uploads exists only on the machine that took it. On
    any replica `hasBytes` would find no file and drop the story from the
    feed and the board silently — the worst kind of failure, because the
    board would simply look emptier than it is.

    Nullable, so rows written before this keep working off their files: reads
    take the blob when there is one and fall back to the path when there is
    not.
  */
  if (addColumn(db, 'stories', 'media_blob', 'BLOB')) applied.push('stories.media_blob');
  if (addColumn(db, 'stories', 'poster_blob', 'BLOB')) applied.push('stories.poster_blob');

  // -- Settings: the few switches a moderator throws from the console -----
  //
  // The stories door lives here (docs/46), so it can be opened on the stage
  // and shut after the talk without a deploy. Who and when are kept.
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      updated_by  TEXT
    );
  `);

  /*
    Organisations that fund quests, and what they funded.

    The sponsor page said, in a comment, that there was no table here "because
    there are no contracts yet - so the funding is declared in one visible
    constant, rather than in a database that would imply an agreement nobody
    has signed", and that the constant would become a table when somebody
    signed. The table arrives now, and the worry that kept it out is answered
    by a column rather than by absence.

    `basis` is the answer. 'declared' means somebody typed this into the
    console and no contract exists; 'signed' means one does. Every page that
    shows money prints which, so the database states the thing the comment was
    afraid it would imply. A row is 'declared' unless a human says otherwise,
    because that is the safer default to get wrong.

    Only a moderator writes here. `created_by` keeps who, for the same reason
    the settings table does: a figure in a report somebody will file should
    name the person who entered it.
  */
  db.exec(`
    CREATE TABLE IF NOT EXISTS organisations (
      id          TEXT PRIMARY KEY,
      name_en     TEXT NOT NULL,
      name_th     TEXT NOT NULL,
      kind        TEXT NOT NULL CHECK (kind IN ('brand','government','ngo','municipality','university','company')),
      created_at  TEXT NOT NULL,
      created_by  TEXT
    );
    CREATE TABLE IF NOT EXISTS org_sponsorships (
      org_id            TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      quest_id          TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      funded_thb        INTEGER NOT NULL,
      per_verified_thb  INTEGER NOT NULL,
      basis             TEXT NOT NULL DEFAULT 'declared' CHECK (basis IN ('declared','signed')),
      started_at        TEXT NOT NULL,
      created_by        TEXT,
      PRIMARY KEY (org_id, quest_id)
    );
    CREATE INDEX IF NOT EXISTS idx_org_sponsorships_org ON org_sponsorships(org_id);
  `);
  applied.push('organisations');
  applied.push('org_sponsorships');

  /*
    Party invitations, and the requests to join them.

    The feature is "find somebody to go with", and the whole design is in the
    shape of the first table: an invitation is posted at a PLACE, for a WINDOW,
    with a number of SPACES. There is no column for where anybody is, and
    there must never be one. `party-invites.ts` in core carries the argument
    at length; the short version is that a check-in is consent to be counted,
    not consent to be found, and a map that resolves to a person standing
    somewhere is a stalking tool we would have built on purpose.

    `place_id` cascades from `places`, which is the right direction here: a
    place withdrawn from the island should take its invitations with it rather
    than leave a pin people can still ask to meet at.

    NO STATE COLUMN. Whether an invitation is open, full, closed or expired is
    derived on read from the clock, the accepted count and `closed_at` — the
    seventh time this schema has declined to keep a second record of a fact it
    already holds. The prize is that expiry needs no cleanup job to be true.

    Requests keep their outcome rather than being deleted, so "did they ever
    answer" survives the invitation ending, and a party cannot quietly make a
    refusal disappear.
  */
  db.exec(`
    CREATE TABLE IF NOT EXISTS party_invites (
      id         TEXT PRIMARY KEY,
      party_id   TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
      place_id   TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
      from_at    TEXT NOT NULL,
      until_at   TEXT NOT NULL,
      spaces     INTEGER NOT NULL,
      note       TEXT,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      closed_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_party_invites_place ON party_invites(place_id, until_at);
    CREATE INDEX IF NOT EXISTS idx_party_invites_party ON party_invites(party_id, closed_at);

    CREATE TABLE IF NOT EXISTS invite_requests (
      invite_id  TEXT NOT NULL REFERENCES party_invites(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      asked_at   TEXT NOT NULL,
      outcome    TEXT NOT NULL DEFAULT 'waiting'
                 CHECK (outcome IN ('waiting','accepted','declined','withdrawn')),
      decided_at TEXT,
      PRIMARY KEY (invite_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_invite_requests_user ON invite_requests(user_id, outcome);
  `);
  applied.push('party_invites');
  applied.push('invite_requests');

  /*
    Bus sightings.
    --------------
    Nobody publishes a timetable for the services that reach the campuses -
    not the university for its own shuttle, and not the operator in any form
    this app can fetch. So the app measures what it cannot be told: a rider
    taps when they see one, and the screen says how long ago, and how far
    apart today's sightings have been. See packages/core/src/transit.ts, and
    note that the wording there never lets an observation read as a schedule.

    ON DELETE CASCADE because a sighting is something a PERSON did, and
    `DELETE /profile` is a single delete on `users` that leans entirely on
    these keys. A table without one is a PDPA defect that looks like nothing:
    the row simply stays behind after the account is gone.
  */
  db.exec(`
    CREATE TABLE IF NOT EXISTS transit_sightings (
      id       TEXT PRIMARY KEY,
      user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      route_id TEXT NOT NULL,
      stop_id  TEXT NOT NULL,
      at       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transit_route_at ON transit_sightings(route_id, at DESC);
  `);
  applied.push('transit_sightings');

  /*
    Money agreed and money ARRIVED are two different facts.

    `funded_thb` is what the agreement says, typed in by a moderator, and
    `basis` already separates somebody's entry from a signed contract. Neither
    of them means PAID - and `sponsorOutcome` was reporting the unspent
    remainder as "still held", which is a claim about cash. Nothing in this
    system had ever recorded cash arriving, so a signed pledge nobody had
    honoured read on the sponsor page as money in hand.

    It is the same defect the reversal sprint spent six pull requests clearing
    out of the points economy: a figure that goes on counting something that
    has not happened. Money is the one place it would be found by an
    accountant rather than by us.

    Defaults are 0 and NULL, so every existing row reads as "agreed, nothing
    received", which is the safe direction to be wrong in.
  */
  if (addColumn(db, 'org_sponsorships', 'received_thb', 'INTEGER NOT NULL DEFAULT 0')) {
    applied.push('org_sponsorships.received_thb');
  }
  if (addColumn(db, 'org_sponsorships', 'received_at', 'TEXT')) {
    applied.push('org_sponsorships.received_at');
  }

  /*
    A signed sponsor may promise a fixed number of trees per later approval.
    NULL means no tree promise; it is never silently inferred from funding.
    Physical plantings are separate rows with partner, date, position and a
    credited photograph. Attribution is user-owned and cascades on erasure,
    while the physical planting record survives without a user identifier.
  */
  if (addColumn(db, 'org_sponsorships', 'trees_per_verified', 'INTEGER')) {
    applied.push('org_sponsorships.trees_per_verified');
  }
  if (addColumn(db, 'org_sponsorships', 'trees_started_at', 'TEXT')) {
    applied.push('org_sponsorships.trees_started_at');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS tree_plantings (
      id             TEXT PRIMARY KEY,
      org_id         TEXT NOT NULL REFERENCES organisations(id),
      quest_id       TEXT NOT NULL REFERENCES quests(id),
      trees          INTEGER NOT NULL CHECK (trees > 0),
      partner        TEXT NOT NULL,
      planted_at     TEXT NOT NULL,
      lat            REAL NOT NULL,
      lng            REAL NOT NULL,
      photo_url      TEXT NOT NULL,
      photo_credit   TEXT NOT NULL,
      photo_licence  TEXT NOT NULL,
      created_at     TEXT NOT NULL,
      created_by     TEXT
    );
    CREATE TABLE IF NOT EXISTS tree_attributions (
      planting_id TEXT NOT NULL REFERENCES tree_plantings(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      trees       INTEGER NOT NULL CHECK (trees > 0),
      PRIMARY KEY (planting_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tree_attributions_user ON tree_attributions(user_id);
  `);
  applied.push('tree_plantings');
  applied.push('tree_attributions');

  /*
    What an offer is worth, in baht.

    The market has run on points alone since it was written: `cost_points` is
    what a traveller spends, and nothing anywhere says what the coffee is
    worth. So the one indicator a partner most wants from the S pillar -
    money reaching local operators - could not be produced at all, and the
    merchant side had no base to compute a commission from either.

    NULLABLE, NOT ZERO, and that is the whole care in this migration. An offer
    nobody has priced is UNKNOWN, and a zero would be summed as "worth
    nothing" - turning a gap in the data into a claim about the world, which
    is the failure this codebase keeps finding in its own totals.

    `vouchers.value_thb` is a SNAPSHOT taken when the voucher is issued, not a
    join back to the offer. A merchant who reprices a coffee next year must
    not reprice every voucher already in somebody's phone, which is the same
    lesson `org_sponsorships.received_thb` learned a week ago.
  */
  if (hasTable(db, 'offers') && addColumn(db, 'offers', 'value_thb', 'INTEGER')) {
    applied.push('offers.value_thb');
  }
  if (hasTable(db, 'vouchers') && addColumn(db, 'vouchers', 'value_thb', 'INTEGER')) {
    applied.push('vouchers.value_thb');
  }
  if (hasTable(db, 'vouchers') && addColumn(db, 'vouchers', 'source_kind', "TEXT NOT NULL DEFAULT 'marketplace'")) {
    applied.push('vouchers.source_kind');
  }
  if (hasTable(db, 'vouchers') && addColumn(db, 'vouchers', 'source_ref', 'TEXT')) {
    applied.push('vouchers.source_ref');
  }
  if (hasTable(db, 'vouchers')) {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_vouchers_reward_source
        ON vouchers(user_id, source_kind, source_ref) WHERE source_ref IS NOT NULL;
      CREATE TABLE IF NOT EXISTS quest_coupon_rewards (
        quest_id TEXT PRIMARY KEY REFERENCES quests(id) ON DELETE CASCADE,
        offer_id TEXT NOT NULL REFERENCES offers(id),
        expires_days INTEGER NOT NULL DEFAULT 30 CHECK(expires_days BETWEEN 1 AND 365),
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
      );
      CREATE TABLE IF NOT EXISTS gacha_coupon_rewards (
        reward_key TEXT PRIMARY KEY,
        offer_id TEXT NOT NULL REFERENCES offers(id),
        expires_days INTEGER NOT NULL DEFAULT 30 CHECK(expires_days BETWEEN 1 AND 365),
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
      );
    `);
    applied.push('configured_reward_coupons');
  }

  /*
    The evidence level a quest AGREED to, and whether the fence was really up.

    The framework note of 26 September grades evidence one to four and says
    the rung is settled before the project starts, beside the KPI. So it is
    stored: it is somebody's decision, made once, and there is nothing to
    derive it from. NULL means no level was agreed, which is not the same as
    agreeing to the lowest one - `levelVerdict` answers `unagreed` for it
    rather than quietly passing everything.

    `fence_enforced` is the awkward half. Rung two is a digital trace, and an
    arrival inside a geofence is the best one this app has - EXCEPT that the
    fence can be opened for a whole deployment (`CHIVAGO_FENCE_OFF`, which
    production has set since the pitch), and nothing recorded whether it was
    up when any given traveller arrived. An arrival is therefore not evidence
    of being anywhere unless the row says the fence was checked.

    Recorded from now on, at the moment of arrival. Rows written before today
    are NULL - unknown - and unknown does not earn a rung.
  */
  if (hasTable(db, 'quests') && addColumn(db, 'quests', 'evidence_level', 'INTEGER')) {
    applied.push('quests.evidence_level');
  }
  if (hasTable(db, 'quest_progress') && addColumn(db, 'quest_progress', 'fence_enforced', 'INTEGER')) {
    applied.push('quest_progress.fence_enforced');
  }

  /*
    The indicator a quest was agreed against, before it ran.

    Section 3 of the framework note asks for six things per quest: a KPI, its
    unit, the formula, a baseline, a target and a period. THREE COLUMNS COVER
    FIVE OF THEM, and the sixth is refused on purpose.

    No formula column. A free-text formula is an invitation to write
    `attendees x 3.2 kg CO2e` into a contract, and this platform would then
    print the product of a number it measured and a coefficient it has never
    held. `kpi.ts` names a closed set of measures instead; a partner who needs
    something outside it gets a conversation and, if the answer is good, a
    commit that can be reviewed.

    No unit column either: the unit is fixed by the measure, so storing it
    separately would only create somewhere for the two to disagree. The period
    belongs to the report, not to the quest.

    `kpi_baseline` and `kpi_target` are REAL, because weight is not an
    integer. Both nullable: a quest with no target has not missed one.
  */
  if (hasTable(db, 'quests')) {
    if (addColumn(db, 'quests', 'kpi_measure', 'TEXT')) applied.push('quests.kpi_measure');
    if (addColumn(db, 'quests', 'kpi_baseline', 'REAL')) applied.push('quests.kpi_baseline');
    if (addColumn(db, 'quests', 'kpi_target', 'REAL')) applied.push('quests.kpi_target');
  }

  /*
    An assurance provider's conclusion on a statement we issued.

    Rung four of the ladder in `evidence-level.ts`, which until now could
    never be reached because nothing here could hold somebody else's opinion.
    `countersign.ts` in core carries the four refusals that make it safe to
    build; the schema enforces two of them.

    BOUND TO A DIGEST, not just to an id. A signature names the exact bytes it
    was given, so it cannot quietly transfer to a different record that
    happens to be displayed beside it.

    APPEND-ONLY, EXCEPT FOR THE WITHDRAWAL. The trigger names the columns it
    protects, which is every column except the two a withdrawal writes. An
    assurer can take a conclusion back; nobody can edit one into a different
    conclusion, and withdrawing is not deleting - the row stays and both facts
    are shown.
  */
  db.exec(`
    CREATE TABLE IF NOT EXISTS statement_countersignatures (
      id               TEXT PRIMARY KEY,
      statement_id     TEXT NOT NULL REFERENCES statements(id),
      digest           TEXT NOT NULL,
      signer_name      TEXT NOT NULL,
      signer_firm      TEXT NOT NULL,
      standard         TEXT NOT NULL
        CHECK (standard IN ('isae3000_limited','isae3000_reasonable','other')),
      opinion          TEXT NOT NULL
        CHECK (opinion IN ('unmodified','modified','adverse','disclaimer')),
      scope_note       TEXT,
      channel          TEXT NOT NULL CHECK (channel IN ('entered_by_staff')),
      recorded_at      TEXT NOT NULL,
      recorded_by      TEXT,
      withdrawn_at     TEXT,
      withdrawn_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_countersign_statement
      ON statement_countersignatures(statement_id, recorded_at);
    CREATE TRIGGER IF NOT EXISTS countersignatures_are_append_only
      BEFORE UPDATE OF statement_id, digest, signer_name, signer_firm, standard,
                       opinion, scope_note, channel, recorded_at, recorded_by
      ON statement_countersignatures
      BEGIN SELECT RAISE(ABORT, 'a conclusion is append-only: withdraw it and record another'); END;
  `);
  applied.push('statement_countersignatures');

  /*
    An organisation declaring it used one of our statements in a disclosure.

    A carbon registry closes this loop by RETIRING the unit, which it can do
    because it holds the unit. We hold a page and a digest. So this table does
    not prevent a second use; it makes one visible when somebody declares it.
    `statement-use.ts` in core carries that distinction and the refusals that
    go with it, including the one nobody would supply for themselves: an empty
    table is not evidence that a statement went unused.

    BOUND TO A DIGEST, like a countersignature. A declaration names the bytes
    it was about, so it cannot drift onto a record it was never about.

    ONE STANDING DECLARATION PER ORG, PER KIND, PER YEAR - a partial unique
    index, and the WHERE clause is the whole point. A company that files its
    2026 One Report twice has not used the statement twice, and the second
    attempt is the same fact arriving again. But a company that WITHDREW a
    declaration and later genuinely files that report must be able to declare
    again, and the withdrawn row must not swallow it. So the constraint binds
    only the declarations that stand, and both rows survive.

    APPEND-ONLY, EXCEPT FOR THE WITHDRAWAL, and the trigger names the columns
    it protects. A declaration can be taken back - the report was never filed,
    the section was cut - and taking it back leaves the original standing.
  */
  db.exec(`
    CREATE TABLE IF NOT EXISTS statement_uses (
      id               TEXT PRIMARY KEY,
      statement_id     TEXT NOT NULL REFERENCES statements(id),
      digest           TEXT NOT NULL,
      org_id           TEXT NOT NULL REFERENCES organisations(id),
      kind             TEXT NOT NULL
        CHECK (kind IN ('one_report','sustainability_report','ifrs_s','internal','other')),
      reporting_year   INTEGER NOT NULL,
      place_note       TEXT,
      declared_at      TEXT NOT NULL,
      declared_by      TEXT,
      withdrawn_at     TEXT,
      withdrawn_reason TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_statement_uses_standing
      ON statement_uses(statement_id, org_id, kind, reporting_year)
      WHERE withdrawn_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_statement_uses_statement
      ON statement_uses(statement_id, declared_at);
    CREATE INDEX IF NOT EXISTS idx_statement_uses_org
      ON statement_uses(org_id, declared_at);
    CREATE TRIGGER IF NOT EXISTS statement_uses_are_append_only
      BEFORE UPDATE OF id, statement_id, digest, org_id, kind, reporting_year,
                       place_note, declared_at, declared_by
      ON statement_uses
      BEGIN SELECT RAISE(ABORT, 'a declaration is append-only: withdraw it and declare again'); END;
  `);
  applied.push('statement_uses');

  /*
    The plan a quest was fixed against, before anybody had seen a result.

    The standards separate VALIDATION - was the plan sound and settled up
    front - from VERIFICATION, which is all this platform had. `validation.ts`
    in core carries the distinction; this table carries the one fact that
    makes a record of it worth anything: `verified_at_lock`, how many of the
    quest's activities had already passed when the plan was fixed. A plan
    fixed after the numbers were in is a rationalisation, and the count is
    what tells the two apart.

    A LATE LOCK IS RECORDED, NOT REFUSED. Refusing would push the plan into an
    email and leave us holding nothing; `planStanding` simply never calls a
    late one early.

    APPEND-ONLY, EXCEPT FOR THE SUPERSESSION. A plan is not edited. To change
    one, supersede it - which is recorded, dated and kept - and lock another.

    THE TRIGGER ON `quests` IS THE HALF THAT MATTERS. Without it the lock
    would name a plan the host could then quietly rewrite, and the digest
    would be a seal on a door that still opens. While a lock stands, the four
    plan columns refuse to change.
  */
  if (hasTable(db, 'quests')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS quest_plan_locks (
        id                TEXT PRIMARY KEY,
        quest_id          TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
        digest            TEXT NOT NULL,
        verified_at_lock  INTEGER NOT NULL,
        locked_at         TEXT NOT NULL,
        locked_by         TEXT,
        superseded_at     TEXT,
        superseded_reason TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_lock_standing
        ON quest_plan_locks(quest_id) WHERE superseded_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_plan_lock_quest
        ON quest_plan_locks(quest_id, locked_at);
      CREATE TRIGGER IF NOT EXISTS plan_locks_are_append_only
        BEFORE UPDATE OF id, quest_id, digest, verified_at_lock, locked_at, locked_by
        ON quest_plan_locks
        BEGIN SELECT RAISE(ABORT, 'a plan lock is append-only: supersede it and lock another'); END;
      CREATE TRIGGER IF NOT EXISTS locked_plans_do_not_change
        BEFORE UPDATE OF kpi_measure, kpi_baseline, kpi_target, evidence_level ON quests
        WHEN EXISTS (
          SELECT 1 FROM quest_plan_locks
           WHERE quest_id = OLD.id AND superseded_at IS NULL
        )
        BEGIN SELECT RAISE(ABORT, 'this quest has a locked measurement plan: supersede it first'); END;
    `);
    applied.push('quest_plan_locks');

    /*
      A partner standing down from a claim, so another partner can make it.

      `adjustment.ts` in core carries what this is and, more importantly, what
      it is not: the mechanism is borrowed from Article 6, where a GOVERNMENT
      adjusts a NATIONAL inventory under a treaty, and none of that is
      happening here. One company is telling us it will not count a cleanup.

      THE ROW NAMES THE PARTNER GIVING THE CLAIM UP, never the one who gains
      by it. That is the whole integrity of the record and it is why the
      column is called `org_id` and not something softer.

      TWO WAYS TO STOP APPLYING, AND THEY ARE NOT THE SAME.
      `resumed_at` is a partner claiming again from a date; it is NOT
      retroactive, because a filing was made on the window that has passed.
      `voided_at` is the record being wrong; it IS retroactive, because one
      mistyped organisation id must not strip a partner's claim forever. A
      schema with only one of these would force a wrong answer to the other.

      ONE STANDING ADJUSTMENT PER PARTNER, PER QUEST - a partial unique index,
      the same shape as `statement_uses`. Resumed or voided rows are out of
      the constraint, so a partner who resumed can stand down again later and
      both windows stay on the record.

      APPEND-ONLY EXCEPT FOR THOSE TWO ENDINGS. A stand-down is not edited.
    */
    db.exec(`
      CREATE TABLE IF NOT EXISTS claim_adjustments (
        id              TEXT PRIMARY KEY,
        org_id          TEXT NOT NULL REFERENCES organisations(id),
        quest_id        TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
        effective_from  TEXT NOT NULL,
        reason          TEXT,
        channel         TEXT NOT NULL CHECK (channel IN ('entered_by_staff')),
        recorded_at     TEXT NOT NULL,
        recorded_by     TEXT,
        resumed_at      TEXT,
        resumed_reason  TEXT,
        voided_at       TEXT,
        voided_reason   TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_claim_adjust_standing
        ON claim_adjustments(org_id, quest_id)
        WHERE resumed_at IS NULL AND voided_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_claim_adjust_quest
        ON claim_adjustments(quest_id, effective_from);
      CREATE TRIGGER IF NOT EXISTS claim_adjustments_are_append_only
        BEFORE UPDATE OF id, org_id, quest_id, effective_from, reason, channel,
                         recorded_at, recorded_by
        ON claim_adjustments
        BEGIN SELECT RAISE(ABORT, 'a stand-down is append-only: resume it or void it'); END;
    `);
    applied.push('claim_adjustments');

    /*
      Where a partner intends to report a quest's figure, and the three facts
      about the activity that decide whether it can go there.

      Stage three of `docs/60`: the same rule that reviews a pasted file on
      side A, run on side B at the moment a measurement plan is fixed - so a
      wrong indicator is caught BEFORE anything is measured instead of at
      filing season.

      ON THE QUEST, NOT RE-ASKED. A pasted file is a one-off and its facts are
      answered on the page each time. A quest is durable, and whose material a
      beach cleanup collects does not change between page loads.

      NOT IN THE PLAN'S DIGEST, deliberately. `planBytes` covers what will be
      MEASURED. Where it will be REPORTED is a separate decision a partner can
      revise without the measurement changing, and folding it into the digest
      would make a filing decision look like a change to the evidence.

      THREE FACTS, NOT FOUR. `measuredBy` is not stored because it is not a
      fact about this quest - it is a fact about which side of the business
      the figure came from, and on this side every figure is verified by the
      host who ran the activity.

      All nullable, all meaning "not answered". `inside_boundary` is INTEGER
      because SQLite has no boolean, and NULL is the third value it needs.
    */
    if (addColumn(db, 'quests', 'indicator_framework', 'TEXT')) {
      applied.push('quests.indicator_framework');
    }
    if (addColumn(db, 'quests', 'indicator_line', 'TEXT')) applied.push('quests.indicator_line');
    if (addColumn(db, 'quests', 'material_origin', 'TEXT')) applied.push('quests.material_origin');
    if (addColumn(db, 'quests', 'organisation_role', 'TEXT')) {
      applied.push('quests.organisation_role');
    }
    if (addColumn(db, 'quests', 'inside_boundary', 'INTEGER')) {
      applied.push('quests.inside_boundary');
    }
  }

  /*
    Listings, and the inquiries travellers send about them.

    docs/61 is the decision: an inquiry, not a booking. Nothing here reserves
    anything or holds a price the platform set, and two of its rules are the
    kind only the database can hold.

    A TOUR CANNOT EXIST WITHOUT A STATED LICENCE NUMBER. A CHECK, not a
    service guard, so no path into this table - a console form, a script, a
    migration nobody reviewed - can put an unlicensed tour in front of a
    traveller. Shown as stated, never as verified.

    AN INQUIRY ONLY MOVES OUT OF 'sent', AND ONLY ONCE. Answered, declined and
    withdrawn are all terminal, enforced by a trigger. An operator cannot
    rewrite an answer after the traveller has read it, and a withdrawn
    question cannot be answered into looking like it was taken up.

    `expired` IS NOT A STATE HERE. It is derived on every read from the answer
    window and the day asked about, so there is no sweep to forget to run and
    no second copy of the clock to drift.

    `from_thb` and `quote_thb` are NULL when nobody said, never 0. Null and 0
    are different answers, as for `valueTHB` on an offer.

    Inquiries go with the traveller: ON DELETE CASCADE, because erasing an
    account that leaves its questions to operators behind has not erased it.
  */
  db.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      id           TEXT PRIMARY KEY,
      operator_id  TEXT NOT NULL REFERENCES hosts(id),
      kind         TEXT NOT NULL CHECK (kind IN ('stay','tour','experience','transfer')),
      title_en     TEXT NOT NULL,
      title_th     TEXT NOT NULL,
      where_label  TEXT NOT NULL,
      from_thb     INTEGER CHECK (from_thb IS NULL OR from_thb >= 0),
      licence_no   TEXT,
      active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
      created_at   TEXT NOT NULL,
      CHECK (kind <> 'tour' OR (licence_no IS NOT NULL AND trim(licence_no) <> ''))
    );
    CREATE INDEX IF NOT EXISTS idx_listings_operator ON listings(operator_id);

    CREATE TABLE IF NOT EXISTS inquiries (
      id           TEXT PRIMARY KEY,
      listing_id   TEXT NOT NULL REFERENCES listings(id),
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      for_date     TEXT NOT NULL,
      party_size   INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 20),
      message      TEXT NOT NULL,
      state        TEXT NOT NULL DEFAULT 'sent'
        CHECK (state IN ('sent','answered','declined','withdrawn')),
      sent_at      TEXT NOT NULL,
      answered_at  TEXT,
      answer       TEXT,
      quote_thb    INTEGER CHECK (quote_thb IS NULL OR quote_thb >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_inquiries_listing ON inquiries(listing_id, sent_at);
    CREATE INDEX IF NOT EXISTS idx_inquiries_user ON inquiries(user_id, sent_at);
    CREATE TRIGGER IF NOT EXISTS inquiries_leave_sent_once
      BEFORE UPDATE ON inquiries
      WHEN OLD.state <> 'sent'
      BEGIN SELECT RAISE(ABORT, 'an inquiry that has left sent does not change again'); END;
  `);
  applied.push('listings', 'inquiries');

  // -- A second pair of eyes: the AI's opinion on a proof (docs/64) --------
  //
  // One row per proof. `result_json` only ever holds what survived
  // parseAssist; `error` is a short reason, never a header or a key. Nothing
  // here is read by anything that awards points.
  db.exec(`
    CREATE TABLE IF NOT EXISTS proof_assists (
      proof_id        TEXT PRIMARY KEY REFERENCES proofs(id) ON DELETE CASCADE,
      status          TEXT NOT NULL CHECK (status IN ('pending','done','failed','off','limit')),
      model_id        TEXT,
      prompt_version  TEXT,
      result_json     TEXT,
      error           TEXT,
      input_tokens    INTEGER,
      output_tokens   INTEGER,
      latency_ms      INTEGER,
      -- Model calls made for this proof, retries included. The daily cap
      -- counts these, not rows, because each one is billed.
      attempts        INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL,
      completed_at    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_proof_assists_status ON proof_assists(status, created_at);
  `);
  // What the AI check said when the host decided - for measuring agreement,
  // not for judging the host.
  if (addColumn(db, 'proofs', 'assist_at_decision', 'TEXT')) applied.push('proofs.assist_at_decision');

  /*
    An operator that is an EXAMPLE, not a business.

    docs/61 decision 5 said no operator is seeded, and meant it about real
    businesses: a listing is a claim made in somebody's name. A made-up
    operator, labelled as made-up everywhere it appears, is the other thing -
    the owner asked for one on 28 September so a judge could walk the flow,
    and the demo build has carried one since.

    On the live server it was carried by the operator's NAME beginning
    "DEMO · ", which is not a label, is English only, and reads as part of the
    business's name. Worse, the seeded questions behind it earned the listing
    "usually answers within 2.5 hours" - a trust signal about a business that
    does not exist, derived from answers nobody wrote.

    So it is a column: set once, read on every listing, and never guessed.
  */
  if (addColumn(db, 'hosts', 'example', 'INTEGER NOT NULL DEFAULT 0')) applied.push('hosts.example');

  // -- A sample offer is marked as one ------------------------------------
  // `example` marks a seeded offer naming a real business that has not
  // joined: the app labels it, and the verified-merchant count leaves it out.
  // The offers themselves arrive by seed-db.ts or, on a live database,
  // seed-offers.ts - never from here, because a migration runs on every
  // database the code opens.
  if (hasTable(db, 'offers') && addColumn(db, 'offers', 'example', 'INTEGER NOT NULL DEFAULT 0')) {
    applied.push('offers.example');
  }

  /*
    A business asking to list (docs/67).

    WHY A TABLE OF ITS OWN AND NOT A HOST ROW WITH A FLAG. A pending
    application must be unreachable by every query in the app, and a flag on
    `hosts` would make that a property of forty WHERE clauses. Nothing outside
    the moderator's queue joins this table, so there is no clause to forget.

    AN APPLICATION LEAVES 'pending' ONCE, enforced by a trigger, as an inquiry
    leaves 'sent' once. A second approval of the same row would mint a second
    console key for a business that already has one, and the applicant would
    have no way to know which of the two is live.

    A TOUR CANNOT APPLY WITHOUT A STATED LICENCE NUMBER. The same CHECK the
    `listings` table carries, for the same reason and in the same place: no
    path into this table - the public form, a script, a migration nobody read -
    can queue an unlicensed tour for approval. Stated, never verified.

    A REFUSAL CARRIES A REASON and an approval carries the account it created,
    both as CHECKs. A refused row with no reason is a business nobody can be
    told anything about; an approved row with no `host_id` is an approval that
    did not happen.

    THE KEY IS NOT HERE. Approving creates the host row and prints its key
    once, exactly as `add-host.ts` does. Only the scrypt hash is ever stored,
    on `hosts`, and no column here could hold the key without undoing that.
  */
  db.exec(`
    CREATE TABLE IF NOT EXISTS operator_applications (
      id             TEXT PRIMARY KEY,
      business_name  TEXT NOT NULL,
      kind           TEXT NOT NULL CHECK (kind IN ('stay','tour','experience','transfer')),
      where_label    TEXT NOT NULL,
      contact_name   TEXT NOT NULL,
      contact_phone  TEXT NOT NULL,
      contact_email  TEXT,
      licence_no     TEXT,
      note           TEXT,
      state          TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending','approved','rejected')),
      submitted_at   TEXT NOT NULL,
      decided_at     TEXT,
      decided_by     TEXT,
      reason         TEXT,
      host_id        TEXT REFERENCES hosts(id),
      CHECK (kind <> 'tour' OR (licence_no IS NOT NULL AND trim(licence_no) <> '')),
      CHECK (state <> 'approved' OR host_id IS NOT NULL),
      CHECK (state <> 'rejected' OR (reason IS NOT NULL AND trim(reason) <> ''))
    );
    CREATE INDEX IF NOT EXISTS idx_operator_applications_state
      ON operator_applications(state, submitted_at);
    CREATE TRIGGER IF NOT EXISTS operator_applications_leave_pending_once
      BEFORE UPDATE ON operator_applications
      WHEN OLD.state <> 'pending'
      BEGIN SELECT RAISE(ABORT, 'an application that has been decided does not change again'); END;
  `);
  applied.push('operator_applications');

  /*
    -- The photographs moved off Metro's URL namespace --------------------

    `/assets/` is Metro's own prefix. In an export the repository's
    photographs are real files there and win, so this looked fine in
    production - but `expo start --web` answers `/assets/*` from the bundler
    registry and never falls through to `public/`, so every place photograph
    and every illustration was a 404 for the whole of development. The files
    now live at `apps/mobile/public/media/` and the seed says `/media/...`.

    A LIVE DATABASE ALREADY HOLDS THE OLD URL. `places.photo_url` and
    `places.photo_source` were written by a previous seed, and `seed-area.ts
    --photos` is the only thing that would otherwise correct them - which is
    a command somebody has to remember to run, on the morning, per area. So
    the rewrite happens here, on boot, where it cannot be forgotten.

    Prefix-anchored and narrow on purpose: only the two directories this
    repository owns. A licensed photograph with an absolute URL of its own
    is not touched, and neither is anything under any other `/assets/` path.
  */
  if (hasTable(db, 'places')) {
    const moved = db.prepare(
      `UPDATE places
          SET photo_url = '/media/' || substr(photo_url, length('/assets/') + 1)
        WHERE photo_url LIKE '/assets/places/%' OR photo_url LIKE '/assets/illustrations/%'`,
    ).run();
    // The credit's "where this came from" link names the directory too, and a
    // source link that 404s on GitHub is a licence trail that does not lead
    // anywhere.
    const sourced = db.prepare(
      `UPDATE places
          SET photo_source = replace(photo_source, 'public/assets/', 'public/media/')
        WHERE photo_source LIKE '%public/assets/%'`,
    ).run();
    const n = Number(moved.changes ?? 0) + Number(sourced.changes ?? 0);
    if (n > 0) applied.push(`places photographs → /media (${n} rows)`);
  }

  /*
    -- The Summoning (docs/68) -------------------------------------------

    Two tables and nothing else. There is no charm balance here and no dust
    balance here, for the same reason `monster-service.ts` keeps no HP: a
    stored counter is a second place the truth lives, and the first thing
    anybody does on a demo day is find the request that increments it.
    Charms are derived from the ledger, dust is the SUM of a column on the
    rows below, and a collection is the DISTINCT spirits in them.

    `summon_epochs` is the commit-reveal. A seed is generated, its hash is
    published, and every roll in that epoch is an HMAC of it - so the server
    cannot pick an outcome after seeing who asked, and anybody holding a
    receipt can recompute the whole epoch once the seed is revealed. The
    seed column is NULL until then, on purpose: a revealed seed cannot
    un-reveal, and an epoch with its seed out is closed to new summons.
  */
  db.exec(`
    CREATE TABLE IF NOT EXISTS summon_epochs (
      id          TEXT PRIMARY KEY,
      commitment  TEXT NOT NULL,
      seed        TEXT,
      opened_at   TEXT NOT NULL,
      closed_at   TEXT
    );
    CREATE TABLE IF NOT EXISTS summons (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      epoch_id    TEXT NOT NULL REFERENCES summon_epochs(id),
      -- 'summon' spent a charm and rolled; 'forge' spent dust and chose.
      source      TEXT NOT NULL CHECK (source IN ('summon','forge')),
      -- This user's nth roll in this epoch, from 1. NULL on a forge, which
      -- rolls nothing. The UNIQUE below is what makes a double-tap cost one
      -- charm rather than two.
      nonce       INTEGER,
      roll        INTEGER,
      pick        INTEGER,
      spirit_key  TEXT NOT NULL,
      rarity      TEXT NOT NULL CHECK (rarity IN ('common','uncommon','rare','mythic')),
      by_pity     TEXT CHECK (by_pity IN ('mythic','rare')),
      -- 1 when this spirit was already in the collection.
      duplicate   INTEGER NOT NULL DEFAULT 0,
      -- Signed: dust gained from a duplicate, or spent on a forge.
      dust        INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_summons_nonce ON summons(user_id, epoch_id, nonce)
      WHERE nonce IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_summons_user ON summons(user_id, created_at);
  `);
  applied.push('summon_epochs', 'summons');
  /*
    The box widened, so a row has to say WHICH box it was drawn from.

    `item_kind` names what came out, because the fashion went into the same
    draw as the spirits and `spirit_key` now holds either kind of key.
    `pool_version` is the one that matters: `GET /summon/verify/:id` recomputes
    an old roll and compares it to what was stored, and the pool a `pick` is
    taken modulo decides the answer. Every row written before this migration
    was drawn against the spirits alone, which is pool version 1 - so that is
    the default, and those receipts keep checking out.
  */
  if (addColumn(db, 'summons', 'item_kind', "TEXT NOT NULL DEFAULT 'spirit'")) {
    applied.push('summons.item_kind');
  }
  if (addColumn(db, 'summons', 'pool_version', 'INTEGER NOT NULL DEFAULT 1')) {
    applied.push('summons.pool_version');
  }
  /* What a pull cost, in Trip Points. 0 on every row that predates the price. */
  if (addColumn(db, 'summons', 'cost_points', 'INTEGER NOT NULL DEFAULT 0')) {
    applied.push('summons.cost_points');
  }
  /*
    Version 3 separates the box into two real banners. Old rows are classified
    from item_kind after the column arrives, so their history remains useful
    and each new banner can derive its own pity counter without a second
    mutable source of truth.
  */
  if (addColumn(db, 'summons', 'category', "TEXT NOT NULL DEFAULT 'mascot' CHECK(category IN ('mascot','fashion'))")) {
    applied.push('summons.category');
  }
  if (addColumn(db, 'summons', 'transaction_id', 'TEXT')) {
    applied.push('summons.transaction_id');
  }
  db.exec(`
    UPDATE summons SET category = 'fashion' WHERE item_kind = 'costume';
    CREATE INDEX IF NOT EXISTS idx_summons_user_category
      ON summons(user_id, category, created_at, nonce);

    CREATE TABLE IF NOT EXISTS gacha_reward_pool (
      reward_key TEXT PRIMARY KEY,
      category   TEXT NOT NULL CHECK(category IN ('mascot','fashion')),
      rarity     TEXT NOT NULL CHECK(rarity IN ('common','uncommon','rare','mythic')),
      weight     INTEGER NOT NULL DEFAULT 100 CHECK(weight > 0),
      active     INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gacha_reward_pool_banner
      ON gacha_reward_pool(category, rarity, active);

    CREATE TABLE IF NOT EXISTS gacha_transactions (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category        TEXT NOT NULL CHECK(category IN ('mascot','fashion')),
      quantity        INTEGER NOT NULL CHECK(quantity IN (1,10)),
      idempotency_key TEXT NOT NULL,
      cost_points     INTEGER NOT NULL CHECK(cost_points IN (100,900)),
      response_json   TEXT,
      created_at      TEXT NOT NULL,
      UNIQUE(user_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_gacha_transactions_user
      ON gacha_transactions(user_id, created_at DESC);
  `);
  applied.push('gacha_reward_pool', 'gacha_transactions');

  // Real database accounts for user registration and authentication
  db.exec(`
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
    CREATE INDEX IF NOT EXISTS idx_user_accounts_email ON user_accounts(email);
    CREATE INDEX IF NOT EXISTS idx_user_accounts_phone ON user_accounts(phone);
  `);
  if (addColumn(db, 'user_accounts', 'account_type', "TEXT NOT NULL DEFAULT 'traveller'")) {
    applied.push('user_accounts.account_type');
  }
  if (addColumn(db, 'user_accounts', 'business_name', 'TEXT')) {
    applied.push('user_accounts.business_name');
  }
  if (addColumn(db, 'profiles', 'bio', 'TEXT')) applied.push('profiles.bio');
  if (addColumn(db, 'profiles', 'profile_photo_url', 'TEXT')) applied.push('profiles.profile_photo_url');
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_shops (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      area_key TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      lat REAL NOT NULL CHECK(lat BETWEEN -90 AND 90),
      lng REAL NOT NULL CHECK(lng BETWEEN -180 AND 180),
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      opening_hours TEXT NOT NULL DEFAULT '',
      amenities TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_local_shops_area ON local_shops(area_key, active, category);
    CREATE INDEX IF NOT EXISTS idx_local_shops_owner ON local_shops(owner_id);
    CREATE TABLE IF NOT EXISTS local_shop_reviews (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL REFERENCES local_shops(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      body TEXT NOT NULL DEFAULT '',
      owner_reply TEXT,
      replied_at TEXT,
      hidden_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(shop_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_local_shop_reviews_page ON local_shop_reviews(shop_id, created_at DESC, id DESC);
    CREATE TABLE IF NOT EXISTS local_shop_media (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL REFERENCES local_shops(id) ON DELETE CASCADE,
      review_id TEXT REFERENCES local_shop_reviews(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('cover','interior','review')),
      mime_type TEXT NOT NULL,
      bytes BLOB NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_local_shop_media_shop ON local_shop_media(shop_id, kind, created_at);
    CREATE TABLE IF NOT EXISTS local_shop_review_reports (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL REFERENCES local_shop_reviews(id) ON DELETE CASCADE,
      reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved','dismissed')),
      created_at TEXT NOT NULL,
      decided_at TEXT,
      decided_by TEXT,
      UNIQUE(review_id, reporter_id)
    );
    CREATE INDEX IF NOT EXISTS idx_local_shop_reports_status ON local_shop_review_reports(status, created_at);
  `);
  if (addColumn(db, 'local_shop_reviews', 'hidden_at', 'TEXT')) applied.push('local_shop_reviews.hidden_at');
  if (addColumn(db, 'local_shop_review_reports', 'decided_at', 'TEXT')) applied.push('local_shop_review_reports.decided_at');
  if (addColumn(db, 'local_shop_review_reports', 'decided_by', 'TEXT')) applied.push('local_shop_review_reports.decided_by');
  if (addColumn(db, 'local_shops', 'service_type', "TEXT NOT NULL DEFAULT 'business'")) applied.push('local_shops.service_type');
  if (addColumn(db, 'local_shops', 'guide_languages', "TEXT NOT NULL DEFAULT ''")) applied.push('local_shops.guide_languages');
  if (addColumn(db, 'local_shops', 'guide_skills', "TEXT NOT NULL DEFAULT '[]'")) applied.push('local_shops.guide_skills');
  if (addColumn(db, 'local_shops', 'guide_tour_styles', "TEXT NOT NULL DEFAULT '[]'")) applied.push('local_shops.guide_tour_styles');
  if (addColumn(db, 'local_shops', 'guide_line_id', "TEXT NOT NULL DEFAULT ''")) applied.push('local_shops.guide_line_id');
  if (addColumn(db, 'local_shops', 'guide_meeting_point', "TEXT NOT NULL DEFAULT ''")) applied.push('local_shops.guide_meeting_point');
  if (addColumn(db, 'local_shops', 'guide_status', "TEXT NOT NULL DEFAULT 'not_required'")) applied.push('local_shops.guide_status');
  if (addColumn(db, 'local_shops', 'guide_reviewed_at', 'TEXT')) applied.push('local_shops.guide_reviewed_at');
  if (addColumn(db, 'local_shops', 'guide_reviewed_by', 'TEXT')) applied.push('local_shops.guide_reviewed_by');
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_guide_documents (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL UNIQUE REFERENCES local_shops(id) ON DELETE CASCADE,
      mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
      bytes BLOB NOT NULL,
      uploaded_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS local_guide_profile_photos (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL UNIQUE REFERENCES local_shops(id) ON DELETE CASCADE,
      mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
      bytes BLOB NOT NULL,
      uploaded_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_local_shops_guides ON local_shops(service_type, guide_status, active, area_key);
  `);
  const shopCoordinateColumns = db
    .prepare("SELECT name, \"notnull\" AS nn FROM pragma_table_info('local_shops')")
    .all() as unknown as { name: string; nn: number }[];
  if (shopCoordinateColumns.some((c) => ((c.name === 'lat' || c.name === 'lng') && c.nn === 1) || c.name === 'guide_license_number')) {
    // Guides are area-based profiles. They do not have a fixed point, and
    // giving them a fabricated pin would imply a meeting location they did
    // not provide. Rebuild this table to make coordinates genuinely nullable;
    // its reviews, images and private license documents keep their FKs by name.
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`
      BEGIN;
      CREATE TABLE local_shops_rebuilt (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        area_key TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        lat REAL CHECK(lat IS NULL OR lat BETWEEN -90 AND 90),
        lng REAL CHECK(lng IS NULL OR lng BETWEEN -180 AND 180),
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        opening_hours TEXT NOT NULL DEFAULT '',
        amenities TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        service_type TEXT NOT NULL DEFAULT 'business',
        guide_languages TEXT NOT NULL DEFAULT '',
        guide_skills TEXT NOT NULL DEFAULT '[]',
        guide_tour_styles TEXT NOT NULL DEFAULT '[]',
        guide_line_id TEXT NOT NULL DEFAULT '',
        guide_meeting_point TEXT NOT NULL DEFAULT '',
        guide_status TEXT NOT NULL DEFAULT 'not_required',
        guide_reviewed_at TEXT,
        guide_reviewed_by TEXT
      );
      INSERT INTO local_shops_rebuilt
        (id,owner_id,name,category,area_key,description,address,lat,lng,phone,email,opening_hours,amenities,active,created_at,updated_at,service_type,guide_languages,guide_skills,guide_tour_styles,guide_line_id,guide_meeting_point,guide_status,guide_reviewed_at,guide_reviewed_by)
      SELECT id,owner_id,name,category,area_key,description,address,lat,lng,phone,email,opening_hours,amenities,active,created_at,updated_at,service_type,guide_languages,guide_skills,guide_tour_styles,guide_line_id,guide_meeting_point,guide_status,guide_reviewed_at,guide_reviewed_by
      FROM local_shops;
      DROP TABLE local_shops;
      ALTER TABLE local_shops_rebuilt RENAME TO local_shops;
      CREATE INDEX idx_local_shops_area ON local_shops(area_key, active, category);
      CREATE INDEX idx_local_shops_owner ON local_shops(owner_id);
      CREATE INDEX idx_local_shops_guides ON local_shops(service_type, guide_status, active, area_key);
      COMMIT;
    `);
    db.exec('PRAGMA foreign_keys = ON');
    applied.push('local_shops.lat/lng nullable');
  }
  applied.push('local_guide_documents');
  applied.push('local_guide_profile_photos');
  applied.push('local_shops');
  applied.push('user_accounts');

  /*
    Signing in with LINE (line-auth.ts).

    A fourth credential pointing at the SAME `users.id` as a device key, an
    email and a link code, so a traveller who signs in with LINE on a new
    phone finds the points they already earned.

    One row per LINE account, and the row holds nothing but the opaque `sub`.
    No display name, no picture, no email - this server collects the least it
    can, and a login is no reason to start collecting more.

    `sub` is the primary key, so one LINE account cannot quietly end up on two
    travellers. The reverse is allowed: a traveller may have a device key, an
    email AND a LINE account, which is the whole point.
  */
  db.exec(`
    CREATE TABLE IF NOT EXISTS line_identities (
      line_sub   TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_line_identities_user ON line_identities(user_id);
  `);
  applied.push('line_identities');

  /*
    -- What a place's picture IS (#169) ----------------------------------

    `places` carried four photograph columns - url, credit, licence, source -
    and the app had grown two more facts about a picture that none of them
    could hold: whether it is a photograph or a venue's own LOGO, and, for a
    logo, the colour its own field is.

    Neither is cosmetic. `creditWord()` reads `kind` to decide between
    "photographed by" and "logo of", and crediting a logo to a photographer
    is a false statement about a real business. `fitsWhole()` reads it to fit
    a logo inside the frame instead of cropping it to fill one, which on
    Badminton@Sinthani's mark cuts the venue's name off its own logo. Both
    live in `apps/mobile/src/api/photos.ts`.

    The seed has carried both since the venue was added; the DATABASE had
    nowhere to put them, so `repo.ts` could not send them and every logo came
    out of the API dressed as a photograph.

    Columns only. The values travel the way every other place photograph does
    - `seed-area.ts --area <key> --photos` - and writing a second UPDATE here
    would be a second source of truth for the same four-and-now-six fields.
  */
  if (hasTable(db, 'places')) {
    if (addColumn(db, 'places', 'photo_kind', 'TEXT')) applied.push('places.photo_kind');
    if (addColumn(db, 'places', 'photo_backdrop', 'TEXT')) applied.push('places.photo_backdrop');
  }

  /*
    -- Community feed -------------------------------------------------------

    A shared feed for travellers and operators. Posts, reactions, comments
    and share acknowledgements are server records rather than client-side
    counters, so every device sees the same conversation. Media bytes live
    with the post for the same deployment reason as story blobs: a rolling
    deploy must not keep a row whose file disappeared with the old machine.
  */
  if (!hasTable(db, 'community_posts')) {
    db.exec(`
      CREATE TABLE community_posts (
        id          TEXT PRIMARY KEY,
        author_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body        TEXT NOT NULL DEFAULT '',
        media_mime  TEXT,
        media_bytes BLOB,
        share_count INTEGER NOT NULL DEFAULT 0 CHECK(share_count >= 0),
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        hidden_at   TEXT,
        CHECK(length(trim(body)) > 0 OR media_bytes IS NOT NULL),
        CHECK((media_mime IS NULL) = (media_bytes IS NULL))
      );
      CREATE INDEX idx_community_posts_page ON community_posts(created_at DESC, id DESC)
        WHERE hidden_at IS NULL;

      CREATE TABLE community_likes (
        post_id    TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        PRIMARY KEY(post_id, user_id)
      );
      CREATE INDEX idx_community_likes_user ON community_likes(user_id, created_at DESC);

      CREATE TABLE community_comments (
        id         TEXT PRIMARY KEY,
        post_id    TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
        author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body       TEXT NOT NULL CHECK(length(trim(body)) > 0),
        created_at TEXT NOT NULL,
        hidden_at  TEXT
      );
      CREATE INDEX idx_community_comments_post ON community_comments(post_id, created_at, id)
        WHERE hidden_at IS NULL;
    `);
    applied.push('community_posts', 'community_likes', 'community_comments');
  }

  /*
    Where the data came from.

    An import replays a whole database into this one through `/admin/import`
    (see `import-service.ts`). That has to be allowed to take MANY requests -
    63 tables, chunked - while still refusing to run against a live database,
    and "is `users` empty" cannot answer both: it is true before the first
    batch and false before the second.

    So an import says it has started, and the guard asks whether one is in
    progress rather than whether the database is untouched. `PRAGMA
    user_version` would have been the cheap place to keep that, and Durable
    Object SQLite refuses it - `not authorized: SQLITE_AUTH`, measured - so it
    is a row.

    It is worth having for its own sake either way: this database will one day
    be somewhere else, and a row saying when its contents arrived and from
    where is the kind of provenance this product asks of everything else.
  */
  if (!hasTable(db, 'import_runs')) {
    db.exec(`
      CREATE TABLE import_runs (
        id            TEXT PRIMARY KEY,
        started_at    TEXT NOT NULL,
        finished_at   TEXT,
        -- When a batch last landed, and how many have. An import that was
        -- abandoned halfway must not leave the door open for ever, so the
        -- guard refuses a run that has gone quiet; see importBlockers.
        last_batch_at TEXT,
        batches       INTEGER NOT NULL DEFAULT 0,
        note          TEXT
      );
    `);
    applied.push('import_runs');
  }

  /*
    -- Take back the prototype-only account scores --------------------------

    Older builds defaulted `grantOpeningBalance` to 1,240 Green and 320 Trip,
    so a newly registered person's profile claimed points and EXP they had
    never earned. The default is 0 now, and the grants those builds wrote have
    to come back off the accounts that got them.

    THIS TAKES THEM BACK AS A REVERSAL, NOT A DELETION, and takes back only
    what is still held.

    The first version subtracted the whole grant from the wallet under
    MAX(0, ...) and deleted the ledger rows. It broke on the one account shape
    that matters most here: somebody given 1,240 Green who SPENT 1,200 of it
    ended with a wallet of 0 against a ledger summing to -1,200 - a voucher
    purchase with nothing it was ever paid from, which is exactly the number a
    traveller cannot account for and exactly what the ledger exists to
    prevent. The clamp was load-bearing, because `wallets` declares
    CHECK (green_points >= 0) and the subtraction would otherwise abort the
    migration; what it actually did was hide the gap it had opened.

    A spent point cannot be un-given - the voucher was issued. So this takes
    back MIN(granted, still held), which is the same amount `applyMovement`
    would allow, since it refuses any debit that would put a balance below
    zero, and it records the take-back as a `reversal:` row the way
    `reverseMovement` does. The wallet still equals what its own ledger
    explains, afterwards as before, and the history reads truthfully: you were
    given 1,240, you spent 1,200, we withdrew the 40 that were left.

    EXP moves the same way and for the same reason. `wallets.exp` is
    documented MONOTONIC - "nothing in the codebase may subtract from it" -
    with a reversal as the one sanctioned exception, because a reversal row
    takes back the EXP it gave. Reducing EXP with no row at all, as the first
    version did, is the unsanctioned form of this very operation.

    `reversal:<source_ref>` is UNIQUE, so the reversal row is its own record
    of having run: a grant that already has one is skipped, and migrating
    twice takes nothing back twice. The grant row is left in place, because it
    happened.

    ORDER MATTERS, because there is no transaction to lean on. `migrate` is
    never called inside one, and it also runs against Durable Object storage,
    where explicit BEGIN/COMMIT is not available. So the reversal row is
    written BEFORE the wallet is debited: a crash in that window leaves a
    traveller holding points we meant to take back, which the UNIQUE key then
    makes permanent - whereas debiting first would let the next startup take
    the same points a second time. Of the two, erring toward the traveller is
    the one to pick.

    Only the exact source-ref shape `grantOpeningBalance` emits is matched, so
    an unrelated adjustment that merely contains the word "opening" is left
    alone.
  */
  const openingShowcaseConfigured = ['CHIVAGO_OPENING_TRIP', 'CHIVAGO_OPENING_GREEN']
    .some((name) => Number(process.env[name] ?? 0) > 0);

  /*
    A deployment that deliberately opted into a showcase balance is left
    alone. Reversing a grant the operator has just configured would zero their
    demo at the next restart with no error to explain it, and the environment
    variable exists to say "I want these points to be here". fly.toml sets
    both to 0, so the pilot takes the cleanup.
  */
  if (hasTable(db, 'ledger') && hasTable(db, 'wallets')
      && hasColumn(db, 'wallets', 'trip_points') && hasColumn(db, 'wallets', 'exp')
      && !openingShowcaseConfigured) {
    const grants = db.prepare(
      `SELECT user_id, label, host, amount, currency, exp, source_ref FROM ledger
        WHERE (source_ref LIKE 'opening:green:%' OR source_ref LIKE 'opening:trip:%')
          AND amount > 0
          AND NOT EXISTS (
            SELECT 1 FROM ledger undo WHERE undo.source_ref = 'reversal:' || ledger.source_ref
          )
        ORDER BY source_ref`,
    ).all() as unknown as {
      user_id: string; label: string; host: string;
      amount: number; currency: string; exp: number; source_ref: string;
    }[];

    // Re-read per grant rather than joining the wallet into the query above:
    // an account can hold both a Trip and a Green grant, and the second one
    // must see the EXP the first has already taken back or it can drive
    // `exp` below zero and abort the migration on the CHECK.
    const walletOf = db.prepare(
      'SELECT trip_points, green_points, exp FROM wallets WHERE user_id = ?',
    );
    const writeReversal = db.prepare(
      `INSERT INTO ledger (id, user_id, label, occurred_at, host, amount, currency, exp, kind, source_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'adjustment', ?)`,
    );
    let reversals = 0;

    for (const grant of grants) {
      const wallet = walletOf.get(grant.user_id) as unknown as
        { trip_points: number; green_points: number; exp: number } | undefined;
      if (!wallet) continue;

      const column = grant.currency === 'trip' ? 'trip_points' : 'green_points';
      const held = grant.currency === 'trip' ? wallet.trip_points : wallet.green_points;
      const amount = Math.min(grant.amount, held);
      const exp = Math.min(grant.exp, wallet.exp);
      // Nothing left to take back: the grant was spent down to zero, and a
      // reversal of nothing is a row that says nothing.
      if (amount <= 0 && exp <= 0) continue;

      const sourceRef = `reversal:${grant.source_ref}`;
      writeReversal.run(sourceRef, grant.user_id, `${grant.label} — prototype balance removed`,
        new Date().toISOString(), grant.host, -amount, grant.currency, -exp, sourceRef);
      db.prepare(`UPDATE wallets SET ${column} = ${column} - ?, exp = exp - ? WHERE user_id = ?`)
        .run(amount, exp, grant.user_id);
      reversals += 1;
    }

    if (reversals > 0) applied.push('reverse prototype opening balances');
  }

  /* Global administration: credentials, reversible moderation and a complete audit trail. */
  if (addColumn(db, 'hosts', 'console_username', 'TEXT')) applied.push('hosts.console_username');
  if (addColumn(db, 'places', 'admin_hidden_at', 'TEXT')) applied.push('places.admin_hidden_at');
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_hosts_console_username
      ON hosts(lower(console_username)) WHERE console_username IS NOT NULL;
    CREATE TABLE IF NOT EXISTS admin_user_status (
      user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      disabled_at   TEXT,
      updated_by    TEXT NOT NULL REFERENCES hosts(id),
      updated_at    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_inventory_grants (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_key      TEXT NOT NULL,
      item_kind     TEXT NOT NULL CHECK(item_kind IN ('spirit','costume')),
      rarity        TEXT NOT NULL CHECK(rarity IN ('common','uncommon','rare','mythic')),
      note          TEXT NOT NULL,
      granted_by    TEXT NOT NULL REFERENCES hosts(id),
      created_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admin_inventory_user ON admin_inventory_grants(user_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id            TEXT PRIMARY KEY,
      admin_host_id TEXT NOT NULL REFERENCES hosts(id),
      action        TEXT NOT NULL,
      target_type   TEXT NOT NULL,
      target_id     TEXT NOT NULL,
      details_json  TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admin_audit_at ON admin_audit_log(created_at DESC);
  `);

  /* Chivar Bot context: isolated by user and durable across devices. */
  if (!hasTable(db, 'concierge_conversations')) {
    db.exec(`
      CREATE TABLE concierge_conversations (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        area_key     TEXT NOT NULL,
        context_json TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );
      CREATE INDEX idx_concierge_user_recent
        ON concierge_conversations(user_id,area_key,updated_at DESC);
      CREATE TABLE concierge_messages (
        id              TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES concierge_conversations(id) ON DELETE CASCADE,
        role            TEXT NOT NULL CHECK(role IN ('user','assistant')),
        content         TEXT NOT NULL,
        created_at      TEXT NOT NULL
      );
      CREATE INDEX idx_concierge_messages
        ON concierge_messages(conversation_id,created_at,id);
    `);
    applied.push('concierge_conversations', 'concierge_messages');
  }

  /*
    What a shop is told about itself, stored as a daily rollup.

    Every paid tier sells "สถิติร้าน", and until now the platform produced a
    profile view every time a tourist opened a shop and discarded it.

    A ROW PER EVENT is the obvious shape and the wrong one here. Every table in
    this pilot lives inside ONE Durable Object, and a SQLite-backed object stops
    accepting writes - all writes, for the whole platform - at 10 GB. An event
    log grows without a ceiling inside a database that has one. This keeps at
    most three rows per shop per day however busy the day gets: 100 shops for a
    year is on the order of a hundred thousand rows, which is nothing.

    It also records no viewer. A shop needs to know how many, never who, and
    the column that would answer "who" is the one we would have to justify
    holding. There isn't one.
  */
  if (!hasTable(db, 'local_shop_daily_stats')) {
    db.exec(`
      CREATE TABLE local_shop_daily_stats (
        shop_id TEXT NOT NULL REFERENCES local_shops(id) ON DELETE CASCADE,
        day     TEXT NOT NULL,
        kind    TEXT NOT NULL CHECK(kind IN ('view','phone','route')),
        count   INTEGER NOT NULL DEFAULT 0 CHECK(count >= 0),
        PRIMARY KEY (shop_id, day, kind)
      );
    `);
    applied.push('local_shop_daily_stats');
  }

  /* One fixed-size bucket protects the shared Groq credential across users. */
  if (!hasTable(db, 'concierge_provider_quota')) {
    db.exec(`
      CREATE TABLE concierge_provider_quota (
        provider          TEXT PRIMARY KEY,
        window_started_at INTEGER NOT NULL,
        used              INTEGER NOT NULL CHECK(used >= 0)
      );
    `);
    applied.push('concierge_provider_quota');
  }

  /*
    PHOTOGRAPHS LEAVE THE DATABASE.

    The whole platform is one Durable Object with a 10 GB ceiling, and when it
    fills, SQLITE_FULL stops every write on the island - check-ins, quests,
    SOS - not just the table that grew. A photograph is the one row that can
    be five megabytes, so these three tables were the fastest road there.

    `storage_key` names the object in R2 that holds the bytes. A row that has
    one keeps an EMPTY blob in `bytes`: the column is NOT NULL, and lifting
    that would mean rebuilding the table, which copies every photograph once
    more inside the very object this exists to relieve. ADD COLUMN copies
    nothing.

    A row with no key is from before the move and is still served from
    `bytes`. `media-store.ts` moves those a few megabytes at a time from the
    alarm, and the partial index below is how it finds them without reading
    every row on every pass - rows read are what Durable Objects bill.
  */
  for (const table of ['local_shop_media', 'local_guide_profile_photos', 'local_guide_documents']) {
    if (!hasColumn(db, table, 'storage_key')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN storage_key TEXT`);
      applied.push(`${table}.storage_key`);
    }
  }

  /*
    WHAT HAS LEFT THE DATABASE MUST LEAVE THE OBJECT STORE.

    A review picture somebody deleted, a guide's licence that was replaced:
    under PDPA those have to go, and there are more ways to remove a row than
    there are routes - replacing a cover, deleting a shop, deleting an account,
    and every ON DELETE CASCADE behind them. Route code sees only its own
    deletes. A trigger sees all of them, and writes the key here in the same
    transaction as the delete, so a key cannot be lost between the two. The
    alarm then removes the object and the row.
  */
  if (!hasTable(db, 'media_deletions')) {
    db.exec(`
      CREATE TABLE media_deletions (
        key       TEXT PRIMARY KEY,
        queued_at TEXT NOT NULL
      );
    `);
    applied.push('media_deletions');
  }
  for (const table of ['local_shop_media', 'local_guide_profile_photos', 'local_guide_documents']) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS ${table}_queues_deleted_media
        AFTER DELETE ON ${table} WHEN old.storage_key IS NOT NULL
        BEGIN INSERT OR IGNORE INTO media_deletions(key, queued_at) VALUES (old.storage_key, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')); END;
      CREATE TRIGGER IF NOT EXISTS ${table}_queues_replaced_media
        AFTER UPDATE OF storage_key ON ${table} WHEN old.storage_key IS NOT NULL AND old.storage_key IS NOT new.storage_key
        BEGIN INSERT OR IGNORE INTO media_deletions(key, queued_at) VALUES (old.storage_key, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')); END;
      CREATE INDEX IF NOT EXISTS idx_${table}_unmoved ON ${table}(id) WHERE storage_key IS NULL;
    `);
  }

  /*
    Proof photographs, which the loop above missed. Their key is
    `proof_files.storage_path`, and a proof row goes by CASCADE when its
    traveller deletes their account - so without this the account went and
    the photographs stayed in R2, which is the opposite of what the privacy
    policy says. Found 19 November 2026 (account-deletion.test.ts). Rows from
    before the blob store hold a filesystem path instead of a key; deleting a
    key that does not exist is a no-op, so those drain harmlessly.
  */
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS proof_files_queues_deleted_media
      AFTER DELETE ON proof_files
      BEGIN INSERT OR IGNORE INTO media_deletions(key, queued_at) VALUES (old.storage_path, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')); END;
  `);

  /*
    Signing in with Google: google-auth.ts and google-identity.ts. The same
    shape as line_identities - Google's subject id and the traveller it names,
    nothing else. No email and no name, because the sign-in asks Google for
    `openid` only and a column for something we never receive is a column
    somebody would one day fill.
  */
  if (!hasTable(db, 'google_identities')) {
    db.exec(`
      CREATE TABLE google_identities (
        google_sub TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_google_identities_user ON google_identities(user_id);
    `);
    applied.push('google_identities');
  }

  /*
    One-time invitations for verifiers (host-invite-service.ts). Only the
    token's hash is kept; used_at and used_by say who accepted it and when.
  */
  if (!hasTable(db, 'host_invites')) {
    db.exec(`
      CREATE TABLE host_invites (
        token_hash  TEXT PRIMARY KEY,
        host_id     TEXT NOT NULL,
        host_name   TEXT NOT NULL,
        host_type   TEXT NOT NULL,
        quest_ids   TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        expires_at  TEXT NOT NULL,
        used_at     TEXT,
        used_by     TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_host_invites_host ON host_invites(host_id);
    `);
    applied.push('host_invites');
  }

  /*
    The 2026 community targets, sized to the pilot instead of the design.

    The design's 3,000 kg, 1,620 hours, 1,000 people, 50 activities and 1,500
    trees were drawn for a full Samui season. The pilot reached 21 active
    people in its first ten weeks and has six weeks of 2026 left, so those
    bars would sit at 0% all year. COMMUNITY_TARGETS_2026 is what six weeks
    of Ko Sichang and the campuses can do; trees go, because no planting
    partner exists yet and a target nobody can work toward is not a plan.

    A data correction in a migration, like the opening-balance reversal above,
    and guarded the same way: a row is changed only while it still holds the
    design's own number. A target an operator has since set is theirs and is
    never overwritten, and a second run finds nothing to change.
  */
  if (hasTable(db, 'community_metrics')) {
    let changed = 0;
    for (const [key, placeholder, target] of COMMUNITY_TARGETS_2026) {
      changed += Number(db.prepare(
        'UPDATE community_metrics SET target = ? WHERE key = ? AND year = 2026 AND target = ?',
      ).run(target, key, placeholder).changes);
    }
    changed += Number(db.prepare(
      "DELETE FROM community_metrics WHERE key = 'treesPlanted' AND year = 2026 AND target = 1500",
    ).run().changes);
    if (changed > 0) applied.push('community targets sized to the pilot');
  }

  /*
    A reward belongs to a shop on the island (shop-reward-service.ts).

    Nullable, because every offer seeded before this - the partner offers and
    the examples - belongs to no shop in the app and is settled the old way.
    ON DELETE CASCADE is deliberately absent: a shop deleted after a traveller
    spent points on its reward must not take the voucher's offer row with it.
    The listing hides a reward whose shop is gone or offline instead.
  */
  if (hasTable(db, 'offers') && addColumn(db, 'offers', 'shop_id', 'TEXT')) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_offers_shop ON offers(shop_id) WHERE shop_id IS NOT NULL');
    applied.push('offers.shop_id');
  }

  return applied;
}

/** [key, the design's placeholder target, the pilot's target] for 2026. */
export const COMMUNITY_TARGETS_2026: readonly (readonly [string, number, number])[] = [
  ['wasteCollected', 3000, 30],
  ['volunteerHours', 1620, 15],
  ['participants', 1000, 15],
  ['activities', 50, 20],
];
