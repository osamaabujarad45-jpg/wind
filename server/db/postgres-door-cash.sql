-- WP-01 / A11: door-time cash evidence. Nullable, additive; never read by commission, ledger or cap maths.
-- One immutable fact per order: expected minor units, collected minor units, typed variance reason, actor and replay identity.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS collected_cents BIGINT CHECK (collected_cents BETWEEN 0 AND 100000000);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS variance_reason TEXT CHECK (variance_reason IN ('PARTIAL_PAYMENT','CUSTOMER_DID_NOT_PAY','APPROVED_DISCOUNT','RETURNED_ITEMS','INCORRECT_CASH','OTHER_ADMIN_REVIEW'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS door_expected_cents BIGINT CHECK (door_expected_cents BETWEEN 0 AND 100000000);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS door_collected_by BIGINT REFERENCES users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS door_request_id TEXT CHECK (door_request_id ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$');
-- Write-once: once collected_cents is set, none of the five door columns may change. Clearing or rewriting one is a refusal.
CREATE FUNCTION orders_door_cash_write_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.collected_cents IS NOT NULL AND (NEW.collected_cents IS DISTINCT FROM OLD.collected_cents
    OR NEW.variance_reason IS DISTINCT FROM OLD.variance_reason
    OR NEW.door_expected_cents IS DISTINCT FROM OLD.door_expected_cents
    OR NEW.door_collected_by IS DISTINCT FROM OLD.door_collected_by
    OR NEW.door_request_id IS DISTINCT FROM OLD.door_request_id) THEN
    RAISE EXCEPTION 'door cash is write-once' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_door_cash_write_once BEFORE UPDATE OF collected_cents, variance_reason, door_expected_cents, door_collected_by, door_request_id ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_door_cash_write_once();
