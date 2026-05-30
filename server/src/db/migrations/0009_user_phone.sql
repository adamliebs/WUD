-- 0009_user_phone — add optional phone number to users for friend-discovery.
--
-- Two columns:
--   • phone_e164 — normalized "+27821234567" form for display & equality
--     checks. Set when the user enters their phone in onboarding or profile.
--   • phone_hash — HMAC-SHA256(phone_e164, pepper) for contact-match lookups.
--     We never store the raw phone numbers we read from the user's contacts
--     book; both sides of the match are hashed and compared, so a DB leak
--     does not expose enumerable phone numbers.
--
-- phone_hash is indexed for fast bulk lookup during the contact-match
-- endpoint (hundreds of hashes in one request).

ALTER TABLE users ADD COLUMN phone_e164 TEXT;
ALTER TABLE users ADD COLUMN phone_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_users_phone_hash ON users(phone_hash) WHERE phone_hash IS NOT NULL;
