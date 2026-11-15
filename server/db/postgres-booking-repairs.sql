-- Forward-only booking/cash repairs for schemas that already recorded migrations 3–29.
CREATE TABLE order_command_rejections (
  user_id BIGINT NOT NULL REFERENCES users(id),
  request_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  error TEXT NOT NULL CHECK (error IN ('quote_expired','promo_used')),
  created_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, request_id)
);

CREATE OR REPLACE FUNCTION immutable_cash() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'cash ledger is append-only' USING ERRCODE='23514'; END IF;
  IF OLD.status <> 'pending' OR OLD.kind <> 'remittance' OR NEW.status NOT IN ('confirmed','disputed')
    OR NEW.decided_at IS NULL OR (to_jsonb(NEW) - 'status' - 'decided_at' - 'resolved_by' - 'resolution_note') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'decided_at' - 'resolved_by' - 'resolution_note') THEN
    RAISE EXCEPTION 'cash ledger is append-only' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
