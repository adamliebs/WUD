-- 0014_squad_invites — let a squad host add people who AREN'T friends yet.
--
-- Adding a non-friend to a squad creates a squad_invite instead of a direct
-- membership row. The invitee gets a 'squad_invite' notification with
-- Join / Pass CTAs; accepting creates the friendship (host ↔ invitee) AND the
-- membership in one step — consent to join the squad doubles as consent to
-- be friends, mirroring the invite-link flow.
--
-- One row per (squad, invitee). Re-inviting after a decline flips the row
-- back to 'pending' (upsert in service code) rather than stacking rows.

CREATE TABLE IF NOT EXISTS squad_invites (
  id          TEXT PRIMARY KEY,
  squad_id    TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  inviter_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','accepted','declined')),
  created_at  INTEGER NOT NULL,
  resolved_at INTEGER,
  UNIQUE (squad_id, invitee_id)
);

CREATE INDEX IF NOT EXISTS idx_squad_invites_invitee ON squad_invites(invitee_id, status);
CREATE INDEX IF NOT EXISTS idx_squad_invites_squad   ON squad_invites(squad_id, status);

-- Rebuild notifications: add the 'squad_invite' type to the CHECK and a
-- squad_id reference so the Join/Pass CTAs know which squad to act on.
-- Same rebuild-and-rename dance as 0007 / 0010 / 0013 (SQLite can't ALTER
-- a CHECK in place). Existing rows satisfy the superset CHECK and get a
-- NULL squad_id, so the copy is safe.

CREATE TABLE notifications_new (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN (
                  'join','host_offer','host_taken','ping','invite','reminder',
                  'float_received','float_keen','float_locked',
                  'activity_created','chat_message',
                  'friend_accepted','activity_updated','activity_cancelled',
                  'plan_invite','squad_invite'
                )),
  from_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  activity_id   TEXT REFERENCES activities(id) ON DELETE CASCADE,
  float_id      TEXT REFERENCES floats(id) ON DELETE SET NULL,
  squad_id      TEXT REFERENCES squads(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  read          INTEGER NOT NULL DEFAULT 0,
  resolved      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

INSERT INTO notifications_new
  SELECT id, user_id, type, from_id, activity_id, float_id, NULL, body, read, resolved, created_at
    FROM notifications;

DROP TABLE notifications;

ALTER TABLE notifications_new RENAME TO notifications;

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
