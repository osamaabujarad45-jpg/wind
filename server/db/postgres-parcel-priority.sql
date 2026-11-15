-- A12: one parcel attribute; no new lifecycle, surcharge or reserved capacity. Existing rows read as standard.
ALTER TABLE orders ADD COLUMN priority TEXT NOT NULL DEFAULT 'standard'
  CHECK (priority IN ('standard','same_day') AND (service = 'parcel' OR priority = 'standard'));
ALTER TABLE quotes ADD COLUMN priority TEXT NOT NULL DEFAULT 'standard'
  CHECK (priority IN ('standard','same_day') AND (service = 'parcel' OR priority = 'standard'));
CREATE FUNCTION quotes_priority_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    RAISE EXCEPTION 'quotes are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER quotes_priority_immutable_trigger BEFORE UPDATE OF priority ON quotes
  FOR EACH ROW EXECUTE FUNCTION quotes_priority_immutable();
-- Terminal refusals for a booking key (see order_command_rejections in sqlite-schema.ts).
CREATE TABLE IF NOT EXISTS order_command_rejections (
  user_id BIGINT NOT NULL REFERENCES users(id),
  request_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  error TEXT NOT NULL CHECK (error IN ('priority_cutoff')),
  created_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, request_id)
);
