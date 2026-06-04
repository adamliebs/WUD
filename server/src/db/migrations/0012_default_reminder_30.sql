-- Bump the default reminder lead time from "off" (NULL) to 30 minutes.
-- Users who explicitly turned reminders off see them reset; acceptable
-- pre-launch since we're still in TestFlight / Play internal testing
-- and the value used to default to off implicitly (the column DEFAULT
-- was NULL with no INSERT specifying it).
--
-- Going forward, the INSERT in users.ts explicitly writes 30 so this
-- migration covers existing rows only.

UPDATE user_settings
   SET default_reminder_minutes = 30
 WHERE default_reminder_minutes IS NULL;
