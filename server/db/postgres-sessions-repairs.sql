-- T43, additive and idempotent (migration 27): session lookups by user (logout-all, admin edits,
-- account deletion) scan no longer once the index exists. Fresh schemas carry it from this file.
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
