-- 0008_notification_categories — expand user_settings with per-category
-- push toggles and an allow-friend-requests switch.
--
-- The existing push_enabled column stays as the master gate: if a user
-- turns push off entirely, nothing is dispatched regardless of the
-- per-category flags. The per-category flags only matter when push is on.
--
-- Defaults are 1 (enabled) so every existing user keeps their current
-- behavior — opting in to more granular control later via Settings.

ALTER TABLE user_settings ADD COLUMN notify_joins           INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_settings ADD COLUMN notify_chat            INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_settings ADD COLUMN notify_floats          INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_settings ADD COLUMN notify_reminders       INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_settings ADD COLUMN allow_friend_requests  INTEGER NOT NULL DEFAULT 1;
