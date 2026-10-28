-- Forward-only review repairs. Existing command digests may contain a fast
-- password verifier; replace them with unpredictable values so old command IDs
-- fail closed rather than resending or exposing an offline password oracle.
ALTER TABLE phone_command_results ADD COLUMN password_fingerprint TEXT;
ALTER TABLE phone_challenges ADD COLUMN send_owner UUID;
UPDATE phone_command_results SET payload_hash=gen_random_uuid()::text || gen_random_uuid()::text;

-- Serialize mutation against assignment. Existing custody and transitions do
-- not change these records; a first legacy inspection may still insert them.
CREATE FUNCTION wp08_guard_active_certificate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_status TEXT;
BEGIN
  SELECT status INTO order_status FROM orders WHERE id=OLD.order_id FOR UPDATE;
  IF order_status IN ('assigned','at_pickup','in_transit','on_hold','returning') THEN
    RAISE EXCEPTION 'active physical certificate is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND NEW.order_id IS DISTINCT FROM OLD.order_id THEN
    SELECT status INTO order_status FROM orders WHERE id=NEW.order_id FOR UPDATE;
    IF order_status IN ('assigned','at_pickup','in_transit','on_hold','returning') THEN
      RAISE EXCEPTION 'active physical certificate is immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER wp08_reservation_guard BEFORE UPDATE OR DELETE ON capacity_reservations FOR EACH ROW EXECUTE FUNCTION wp08_guard_active_certificate();
CREATE TRIGGER wp08_requirements_guard BEFORE UPDATE OR DELETE ON order_requirements FOR EACH ROW EXECUTE FUNCTION wp08_guard_active_certificate();
