-- 0015_analytics_events — lightweight product analytics.
--
-- A single append-only table recording funnel/usage events so we can see
-- where first-open users drop off (splash → welcome → auth → onboarding →
-- first friend → first post) and measure time-to-value. No PII: `props` holds
-- only small, non-identifying context (e.g. quest name, platform).
--
-- user_id is NULL for pre-signup events (app_open, signup_started) and set
-- once the request carries a valid access token. ON DELETE SET NULL so a
-- deleted account's events stay countable but de-linked.

CREATE TABLE IF NOT EXISTS analytics_events (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  event      TEXT NOT NULL,
  props      TEXT,                 -- JSON blob, capped server-side
  platform   TEXT,                 -- 'ios' | 'android' | 'web' | NULL
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics_events(event, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_user  ON analytics_events(user_id, created_at);
