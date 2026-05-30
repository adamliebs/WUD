-- 0007_notification_types — rebuild the notifications table with a CHECK
-- constraint that allows the newer notification types we've added since
-- 0001: float_received / float_keen / float_locked (from 0006-era work),
-- activity_created (friend posted a plan or went live), chat_message (new
-- chat in an activity I'm a participant of).
--
-- SQLite doesn't let you ALTER a CHECK constraint in place, so the standard
-- rebuild-and-rename dance: create a fresh table with the right shape, copy
-- everything across, drop the old table, rename.
--
-- The column set is identical to the live shape after 0006 (which added
-- float_id). The only change is the CHECK expression — every value in the
-- existing table satisfies the new CHECK by construction, so the copy is
-- safe.

CREATE TABLE notifications_new (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN (
                  'join','host_offer','host_taken','ping','invite','reminder',
                  'float_received','float_keen','float_locked',
                  'activity_created','chat_message'
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
