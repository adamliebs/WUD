-- 0003_trust_and_safety — Apple App Review Guideline 1.2 (UGC) prerequisites.
-- Adds the persistence layer for:
--   * age-gate at signup (users.date_of_birth)
--   * user blocking (user_blocks)
--   * abuse reports for users / activities / messages (reports)

-- Date of birth captured at signup so we can enforce 13+ (COPPA). Nullable so
-- existing rows keep loading; new signups will require a value app-side.
ALTER TABLE users ADD COLUMN date_of_birth INTEGER;

-- Bidirectional block — if A blocks B, neither sees the other's plans, chats,
-- profile, search hits, or notifications from each other. Friendship is
-- removed at the same time (handled service-side).
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);

-- Abuse reports — Apple requires both a way to flag content and a process to
-- act on flags. status starts 'open' and a moderator (offline, for now) moves
-- it through 'reviewed' → 'actioned' or 'dismissed'.
CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('user','activity','message')),
  target_id   TEXT NOT NULL,
  reason      TEXT NOT NULL,
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','actioned','dismissed')),
  created_at  INTEGER NOT NULL,
  reviewed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
