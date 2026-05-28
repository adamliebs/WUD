-- 0004_email_verified — surface Firebase Auth's email-verified flag on the
-- user model so the client can show a "verify your email" banner until the
-- user has clicked the verification link.
--
-- Nullable + defaults to 0 (false). Updated on every successful Firebase
-- signin from the verified claim in the ID token. Legacy users who don't
-- sign in through Firebase stay at 0 forever — they have no verification
-- path yet, so we just don't show the banner for them.

ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
