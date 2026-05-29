-- 0006_floats — soft proposals before plans.
--
-- A float is a trial balloon: "anyone keen for a surf?" thrown to a chosen
-- audience with no commitment. Recipients respond with one of three states
-- (keen / maybe / nah). The sender can later "lock it in" — promoting the
-- float into a real activity with the keen crowd auto-RSVP'd as joiners.
--
-- Floats are ephemeral; expires_at defaults to created_at + 8h but can be
-- overridden. After expiry they're hidden from the normal list but kept
-- around for ~24h as a "recently expired" surface so users can re-float
-- an idea that didn't catch ("we missed surf today — same thing next week?").
--
-- Floats and activities share NO rows. Promotion creates a fresh activity
-- and sets floats.locked_into_activity_id as a back-reference so the float
-- card can show "locked in →" instead of a response tally.

CREATE TABLE IF NOT EXISTS floats (
  id                       TEXT PRIMARY KEY,
  sender_id                TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question                 TEXT NOT NULL,
  emoji                    TEXT,                                    -- visual decoration; falls back to ✨ in the UI
  place                    TEXT,                                    -- optional rough place
  timing                   TEXT,                                    -- 'today' | 'tomorrow' | 'weekend' | 'whenever' | NULL
  is_open_invite           INTEGER NOT NULL DEFAULT 1               -- 1 = all friends; 0 = squad-only (squad set below)
                           CHECK (is_open_invite IN (0, 1)),
  is_private               INTEGER NOT NULL DEFAULT 0               -- mirrors activities.is_private semantics
                           CHECK (is_private IN (0, 1)),
  created_at               INTEGER NOT NULL,
  expires_at               INTEGER NOT NULL,
  locked_into_activity_id  TEXT REFERENCES activities(id) ON DELETE SET NULL,
  deleted_at               INTEGER                                   -- soft delete by sender
);

CREATE INDEX IF NOT EXISTS idx_floats_sender    ON floats(sender_id);
CREATE INDEX IF NOT EXISTS idx_floats_expires   ON floats(expires_at);

-- Squad audience tags — mirrors activity_squads. Empty when open-invite.
CREATE TABLE IF NOT EXISTS float_squads (
  float_id  TEXT NOT NULL REFERENCES floats(id) ON DELETE CASCADE,
  squad_id  TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  PRIMARY KEY (float_id, squad_id)
);

-- One row per (float, responder). Toggling states overwrites the row.
CREATE TABLE IF NOT EXISTS float_responses (
  float_id    TEXT NOT NULL REFERENCES floats(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state       TEXT NOT NULL CHECK (state IN ('keen', 'maybe', 'nah')),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (float_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_float_responses_float ON float_responses(float_id);

-- Notifications now carry an optional float_id alongside the existing
-- activity_id, so float events (received / keen / locked) can deep-link
-- the recipient straight into the float card.
ALTER TABLE notifications ADD COLUMN float_id TEXT REFERENCES floats(id) ON DELETE SET NULL;

