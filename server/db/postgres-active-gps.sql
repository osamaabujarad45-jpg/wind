CREATE TABLE driver_active_gps_sessions (
  driver_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  id UUID NOT NULL UNIQUE,
  auth_session_hash TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  opened_generation BIGINT NOT NULL CHECK(opened_generation BETWEEN 0 AND 9007199254740990),
  seq BIGINT NOT NULL DEFAULT 0 CHECK(seq BETWEEN 0 AND 9007199254740991),
  FOREIGN KEY(auth_session_hash, driver_id) REFERENCES sessions(token_hash, user_id) ON DELETE CASCADE
);
CREATE TABLE driver_active_gps_generations (
  driver_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  generation BIGINT NOT NULL DEFAULT 0 CHECK(generation BETWEEN 0 AND 9007199254740991)
);
CREATE TABLE driver_active_gps_session_ids (
  id UUID PRIMARY KEY,
  driver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX driver_active_gps_session_ids_driver ON driver_active_gps_session_ids(driver_id);
CREATE OR REPLACE FUNCTION order_revision_money() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.version := OLD.version + 1;
    NEW.assignment_epoch := OLD.assignment_epoch + CASE WHEN NEW.driver_id IS DISTINCT FROM OLD.driver_id OR
      (OLD.status NOT IN ('assigned','at_pickup','in_transit','on_hold','returning') AND NEW.status IN ('assigned','at_pickup','in_transit','on_hold','returning')) THEN 1 ELSE 0 END;
  ELSE
    NEW.version := 1;
    NEW.assignment_epoch := CASE WHEN NEW.driver_id IS NULL THEN 0 ELSE 1 END;
  END IF;
  NEW.price_minor := legacy_money_minor(NEW.price);
  NEW.commission_minor := legacy_money_minor(NEW.commission);
  NEW.discount_minor := legacy_money_minor(NEW.discount);
  RETURN NEW;
END $$;
CREATE FUNCTION active_gps_invalidate_assignment_fix() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.driver_id IS NOT NULL AND NEW.status IN ('assigned','at_pickup','in_transit','on_hold','returning') THEN
      UPDATE driver_active_gps_generations SET generation=generation+1 WHERE driver_id=NEW.driver_id;
      DELETE FROM driver_locations WHERE driver_id=NEW.driver_id AND EXISTS (SELECT 1 FROM driver_active_gps_sessions WHERE driver_id=NEW.driver_id);
    END IF;
  ELSIF NEW.driver_id IS DISTINCT FROM OLD.driver_id OR
    (OLD.status IN ('assigned','at_pickup','in_transit','on_hold','returning')) IS DISTINCT FROM
    (NEW.status IN ('assigned','at_pickup','in_transit','on_hold','returning')) THEN
    UPDATE driver_active_gps_generations SET generation=generation+1 WHERE driver_id IN (OLD.driver_id,NEW.driver_id);
    DELETE FROM driver_locations WHERE driver_id IN (OLD.driver_id,NEW.driver_id) AND EXISTS (SELECT 1 FROM driver_active_gps_sessions s WHERE s.driver_id=driver_locations.driver_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER active_gps_assignment_invalidation AFTER INSERT OR UPDATE OF driver_id,status ON orders FOR EACH ROW EXECUTE FUNCTION active_gps_invalidate_assignment_fix();
CREATE FUNCTION active_gps_session_deleted() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE driver_active_gps_generations SET generation=generation+1 WHERE driver_id=OLD.driver_id;
  DELETE FROM driver_locations WHERE driver_id=OLD.driver_id;
  RETURN OLD;
END $$;
CREATE TRIGGER active_gps_session_deleted AFTER DELETE ON driver_active_gps_sessions FOR EACH ROW EXECUTE FUNCTION active_gps_session_deleted();
CREATE FUNCTION active_gps_revoke_ineligible() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role <> 'driver' OR NEW.status <> 'active' THEN
    UPDATE driver_active_gps_generations SET generation=generation+1 WHERE driver_id=NEW.id;
    DELETE FROM driver_active_gps_sessions WHERE driver_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER active_gps_user_revocation AFTER UPDATE OF role,status ON users FOR EACH ROW EXECUTE FUNCTION active_gps_revoke_ineligible();
CREATE FUNCTION active_gps_auth_deleted() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE driver_active_gps_generations SET generation=generation+1 WHERE driver_id=OLD.user_id;
  RETURN OLD;
END $$;
CREATE TRIGGER active_gps_auth_deleted AFTER DELETE ON sessions FOR EACH ROW EXECUTE FUNCTION active_gps_auth_deleted();
