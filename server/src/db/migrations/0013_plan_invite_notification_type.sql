-- 0013_plan_invite_notification_type — extend notifications.type CHECK to
-- accept the new 'plan_invite' kind (host nudges a specific friend to a plan
-- they're already running; distinct from the initial 'activity_created'
-- broadcast at create-time).
--
-- Same rebuild-and-rename dance as 0007 / 0010 because SQLite can't ALTER a
-- CHECK in place. Existing rows satisfy the new (superset) CHECK by
-- construction, so the copy is safe.

CREATE TABLE notifications_new (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN (
                  'join','host_offer','host_taken','ping','invite','reminder',
                  'float_received','float_keen','float_locked',
                  'activity_created','chat_message',
                  'friend_accepted','activity_updated','activity_cancelled',
                  'plan_invite'
                )),
  from_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  activity_id   TEXT REFERENCES activities(id) ON DELETE CASCADE,
  float_id      TEXT REFERENCES floats(id) ON DELETE SET NULL,
  body          TEXT NOT NULL,
  read          INTEGER NOT NULL DEFAULT 0,
  resolved      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

INSERT INTO notifications_new
  SELECT id, user_id, type, from_id, activity_id, float_id, body, read, resolved, created_at
    FROM notifications;

DROP TABLE notifications;

ALTER TABLE notifications_new RENAME TO notifications;

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
