-- Per-message reactions (Slack-style).
--
-- One row per (message, user, emoji) so the same user can drop several
-- distinct emojis on a single message but can't double-up the same emoji.
-- A delete on the parent message cascades us; a user delete cascades the
-- author column out, and the FK below cascades their reactions too — both
-- sides clean.

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_msg
  ON message_reactions (message_id);
