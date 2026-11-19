-- Finance may add its audit fields only during the one pending-remittance decision.
CREATE OR REPLACE FUNCTION immutable_cash() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'cash ledger is append-only' USING ERRCODE='23514'; END IF;
  IF OLD.status <> 'pending' OR OLD.kind <> 'remittance' OR NEW.status NOT IN ('confirmed','disputed')
    OR NEW.decided_at IS NULL OR OLD.resolved_by IS NOT NULL OR OLD.resolution_note IS NOT NULL
    OR (NEW.resolved_by IS NULL) <> (NEW.resolution_note IS NULL)
    OR length(btrim(NEW.resolution_note)) < 5
    OR (to_jsonb(NEW) - 'status' - 'decided_at' - 'resolved_by' - 'resolution_note') IS DISTINCT FROM
       (to_jsonb(OLD) - 'status' - 'decided_at' - 'resolved_by' - 'resolution_note') THEN
    RAISE EXCEPTION 'cash ledger is append-only' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
