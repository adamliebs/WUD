-- 0001_init — WUD base schema (SQLite dialect).
-- Mirrors SRS §4. All *_at columns are epoch milliseconds (INTEGER).
-- Connection pragmas (WAL, foreign_keys) are set in db/index.ts.

------------------------------------------------------------------- users + auth
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  handle        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  avatar_emoji  TEXT NOT NULL DEFAULT '✨',
  color         TEXT NOT NULL DEFAULT 'from-rose-400 to-orange-500',
  photo_url     TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_identities (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL CHECK (provider IN ('google','apple','facebook','email')),
  provider_subject TEXT NOT NULL,
  email            TEXT COLLATE NOCASE,
  password_hash    TEXT,
  created_at       INTEGER NOT NULL,
  UNIQUE (provider, provider_subject)
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id                  TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  push_enabled             INTEGER NOT NULL DEFAULT 1,
  pings_enabled            INTEGER NOT NULL DEFAULT 1,
  host_transfer_enabled    INTEGER NOT NULL DEFAULT 1,
  show_me_to_fof           INTEGER NOT NULL DEFAULT 1,
  default_private          INTEGER NOT NULL DEFAULT 0,
  appearance               TEXT NOT NULL DEFAULT 'dark',
  default_reminder_minutes INTEGER          -- NULL = reminders off
);

CREATE TABLE IF NOT EXISTS devices (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL CHECK (platform IN ('ios','android','web')),
  push_token   TEXT NOT NULL,
  last_seen_at INTEGER NOT NULL
);

-- Refresh tokens — rotating, revocable (SRS SEC-02).
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         TEXT PRIMARY KEY,        -- token id (jti)
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,           -- sha256 of the secret half
  expires_at INTEGER NOT NULL,
  revoked    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

------------------------------------------------------------------- social graph
-- Friendship stored once as an ordered pair (user_a < user_b).
CREATE TABLE IF NOT EXISTS friendships (
  user_a     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id           TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at   INTEGER NOT NULL,
  resolved_at  INTEGER
);

CREATE TABLE IF NOT EXISTS squads (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  emoji      TEXT NOT NULL DEFAULT '✨',
  host_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS squad_members (
  squad_id  TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (squad_id, user_id)
);

------------------------------------------------------------------- activities
CREATE TABLE IF NOT EXISTS activities (
  id                    TEXT PRIMARY KEY,
  host_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category              TEXT NOT NULL,
  custom_emoji          TEXT,
  custom_label          TEXT,
  title                 TEXT NOT NULL,
  description           TEXT NOT NULL DEFAULT '',
  place                 TEXT NOT NULL DEFAULT '',
  lat                   REAL,
  lng                   REAL,
  map_x                 REAL,            -- normalized stylized-map coord (0..1)
  map_y                 REAL,
  starts_at             INTEGER NOT NULL,
  max_size              INTEGER,         -- NULL = unlimited
  is_private            INTEGER NOT NULL DEFAULT 0,
  is_open_invite        INTEGER NOT NULL DEFAULT 1,
  banner_url            TEXT,
  recurrence            TEXT,            -- JSON: {"freq":...,"weekday":...}
  reminder_minutes      INTEGER,         -- NULL = use user default; -1 = off
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  dissolved_at          INTEGER
);

CREATE TABLE IF NOT EXISTS activity_squads (
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  squad_id    TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  PRIMARY KEY (activity_id, squad_id)
);

CREATE TABLE IF NOT EXISTS rsvps (
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state       TEXT NOT NULL CHECK (state IN ('going','maybe','cant')),
  order_index INTEGER NOT NULL,        -- join order — drives host-transfer succession
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (activity_id, user_id)
);

CREATE TABLE IF NOT EXISTS reactions (
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (activity_id, user_id)   -- one reaction per user per activity
);

------------------------------------------------------------------- chat + polls
-- One messages table, polymorphic parent: exactly one of activity_id / squad_id set.
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  activity_id TEXT REFERENCES activities(id) ON DELETE CASCADE,
  squad_id    TEXT REFERENCES squads(id) ON DELETE CASCADE,
  author_id   TEXT REFERENCES users(id) ON DELETE SET NULL,  -- NULL = system message
  type        TEXT NOT NULL DEFAULT 'text'
                CHECK (type IN ('text','photo','poll','system')),
  body        TEXT,
  photo_url   TEXT,
  created_at  INTEGER NOT NULL,
  CHECK ((activity_id IS NOT NULL) <> (squad_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS polls (
  message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  question   TEXT NOT NULL,
  closed     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS poll_options (
  id              TEXT PRIMARY KEY,
  poll_message_id TEXT NOT NULL REFERENCES polls(message_id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  order_index     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_votes (
  poll_message_id TEXT NOT NULL REFERENCES polls(message_id) ON DELETE CASCADE,
  option_id       TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (poll_message_id, user_id)   -- one vote per poll per user
);

------------------------------------------------------------------- presence
CREATE TABLE IF NOT EXISTS live_statuses (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  emoji        TEXT NOT NULL,
  text         TEXT NOT NULL,
  place        TEXT,
  open_to_join INTEGER NOT NULL DEFAULT 0,
  started_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);

------------------------------------------------------------------- notifications
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- recipient
  type        TEXT NOT NULL
                CHECK (type IN ('join','host_offer','host_taken','ping','invite','reminder')),
  from_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  activity_id TEXT REFERENCES activities(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  read        INTEGER NOT NULL DEFAULT 0,
  resolved    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

-- Tracks which (user, activity) reminders have already fired (idempotency).
CREATE TABLE IF NOT EXISTS reminder_log (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  fired_at    INTEGER NOT NULL,
  PRIMARY KEY (user_id, activity_id)
);

------------------------------------------------------------------- indexes
CREATE INDEX IF NOT EXISTS idx_activities_starts        ON activities(starts_at);
CREATE INDEX IF NOT EXISTS idx_activities_host          ON activities(host_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_activity           ON rsvps(activity_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_user               ON rsvps(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_activity        ON messages(activity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_squad           ON messages(squad_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user       ON notifications(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_squads_squad    ON activity_squads(squad_id);
CREATE INDEX IF NOT EXISTS idx_squad_members_user       ON squad_members(user_id);
