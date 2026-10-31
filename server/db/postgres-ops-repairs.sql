-- T24/T25, additive and idempotent (migration 23): one-time approval consumption and the administrator
-- cash-resolution audit columns, for staging schemas created before they existed. Fresh schemas already
-- carry the columns from postgres-ops.sql; these statements are no-ops there.
ALTER TABLE financial_approvals ADD COLUMN IF NOT EXISTS consumed_at BIGINT;
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS resolved_by BIGINT REFERENCES users;
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS resolution_note TEXT;
