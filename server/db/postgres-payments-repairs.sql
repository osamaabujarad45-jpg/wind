-- T32, additive and idempotent (migration 25): partial COD remittance tracking and stable command
-- identities for collect/remit replays. Fresh schemas already carry the columns from
-- postgres-payments.sql; these statements are no-ops there.
ALTER TABLE merchant_cod ADD COLUMN IF NOT EXISTS remitted_minor BIGINT NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE merchant_cod ADD CONSTRAINT merchant_cod_remitted CHECK (remitted_minor >= 0 AND remitted_minor <= collected_minor) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; -- fresh schemas already carry it from the CREATE TABLE
END $$;
ALTER TABLE merchant_cod_events ADD COLUMN IF NOT EXISTS request_id TEXT;
