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
      -- When the contact is also a ChivaGo user, they can be pushed directly.
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
      -- group of eight join over a weekend without re-reading it each time.
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

  return applied;
}
