-- 0005_activity_end_time — every activity now has an end time, and the
-- per-user "live status" concept is absorbed into activities. A live moment
-- IS an activity that's happening right now (now ∈ [starts_at, ends_at]).
--
-- Existing rows are backfilled to starts_at + 2h — a sensible default for
-- the casual hangs we have in seed data. Going forward the app always
-- supplies ends_at on create.
--
-- live_statuses is dropped: anything that used to be a per-user live
-- status is now an open-invite activity (or just an activity the user
-- hosts that's currently happening).

-- 1. Add ends_at as NOT NULL with a sentinel default so SQLite is happy.
--    The follow-up UPDATE overwrites the sentinel with a real value.
ALTER TABLE activities ADD COLUMN ends_at INTEGER NOT NULL DEFAULT 0;

-- 2. Backfill: 2h after start. Past activities (those already concluded)
--    end up with an ends_at in the past, which is correct — they shouldn't
--    show in the "live now" strip and should be in History.
UPDATE activities SET ends_at = starts_at + 7200000 WHERE ends_at = 0;

-- 3. Index for the live-now query (activities currently between starts_at
--    and ends_at). idx_activities_starts already covers starts_at; this
--    composite catches the common scan.
CREATE INDEX IF NOT EXISTS idx_activities_window ON activities(starts_at, ends_at);

-- 4. live_statuses is no longer used. Drop it cleanly. Anything in flight
--    when the migration runs gets discarded — acceptable since live
--    statuses were short-lived by design.
DROP TABLE IF EXISTS live_statuses;
