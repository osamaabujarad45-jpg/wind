-- A12: one parcel attribute; no new lifecycle, surcharge or reserved capacity.
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
ALTER TABLE order_command_rejections DROP CONSTRAINT order_command_rejections_error_check;
ALTER TABLE order_command_rejections ADD CONSTRAINT order_command_rejections_error_check
  CHECK (error IN ('quote_expired','promo_used','priority_cutoff'));
