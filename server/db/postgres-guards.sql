-- Authoritative legacy-compatible constraints; no new tariff, return, or rating policy.
ALTER TABLE orders
  ADD COLUMN version BIGINT NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  ADD COLUMN assignment_epoch BIGINT NOT NULL DEFAULT 0 CHECK (assignment_epoch BETWEEN 0 AND 9007199254740991),
  ADD COLUMN currency TEXT NOT NULL DEFAULT 'ILS' CHECK (currency = 'ILS'),
  ADD COLUMN price_minor BIGINT NOT NULL CHECK (price_minor BETWEEN 0 AND 9007199254740991),
  ADD COLUMN commission_minor BIGINT CHECK (commission_minor BETWEEN 0 AND 9007199254740991),
  ADD COLUMN discount_minor BIGINT CHECK (discount_minor BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT orders_service_check CHECK (service IN ('ride','parcel','freight')),
  ADD CONSTRAINT orders_status_check CHECK (status IN ('searching','assigned','at_pickup','in_transit','completed','cancelled','on_hold','returning','returned')),
  ADD CONSTRAINT orders_flags_check CHECK (shared IN (0,1) AND loading_help IN (0,1)),
  ADD CONSTRAINT orders_custody_check CHECK (status NOT IN ('assigned','at_pickup','in_transit','on_hold','returning','completed','returned') OR driver_id IS NOT NULL),
  ADD CONSTRAINT orders_searching_check CHECK (status <> 'searching' OR driver_id IS NULL),
  ADD CONSTRAINT orders_finished_check CHECK (status NOT IN ('completed','returned') OR completed_at IS NOT NULL),
  ADD CONSTRAINT orders_ratings_valid CHECK ((rating IS NULL OR rating BETWEEN 1 AND 5) AND (price_rating IS NULL OR price_rating BETWEEN 1 AND 5) AND (customer_rating IS NULL OR customer_rating BETWEEN 1 AND 5));

CREATE UNIQUE INDEX orders_exclusive_driver ON orders(driver_id)
  WHERE service IN ('ride','freight') AND status IN ('assigned','at_pickup','in_transit','on_hold','returning');
-- The single driver_id on the order is the unique active assignment; no synthetic duplicate assignment table.
CREATE INDEX orders_open_driver ON orders(driver_id,service) WHERE status IN ('assigned','at_pickup','in_transit','on_hold','returning');
-- WP05 supplies measured vehicle resources. NULL is explicitly unknown, never an invented capacity.
CREATE TABLE driver_run_resources (
  driver_id BIGINT PRIMARY KEY REFERENCES users(id), revision BIGINT NOT NULL DEFAULT 0,
  capacity_state TEXT NOT NULL DEFAULT 'unknown_legacy' CHECK (capacity_state = 'unknown_legacy'),
  usable_kg DOUBLE PRECISION CHECK (usable_kg IS NULL), usable_m3 DOUBLE PRECISION CHECK (usable_m3 IS NULL),
  CHECK (revision BETWEEN 0 AND 9007199254740991));

CREATE FUNCTION legacy_money_minor(amount DOUBLE PRECISION) RETURNS BIGINT
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE rounded DOUBLE PRECISION;
BEGIN
  -- Preserve the legacy JavaScript Math.round(amount * 100) rule, including binary REAL input.
  rounded := floor(amount * 100);
  IF amount * 100 - rounded >= 0.5 THEN rounded := rounded + 1; END IF;
  IF amount < 0 OR amount = 'NaN'::float8 OR rounded > 9007199254740991 OR rounded < 0 THEN
    RAISE EXCEPTION 'unsafe legacy money amount' USING ERRCODE='22003';
  END IF;
  RETURN rounded::bigint;
END $$;

CREATE FUNCTION order_revision_money() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.version := OLD.version + 1;
    NEW.assignment_epoch := OLD.assignment_epoch + CASE WHEN NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN 1 ELSE 0 END;
  ELSE
    NEW.version := 1;
    NEW.assignment_epoch := CASE WHEN NEW.driver_id IS NULL THEN 0 ELSE 1 END;
  END IF;
  NEW.price_minor := legacy_money_minor(NEW.price);
  NEW.commission_minor := legacy_money_minor(NEW.commission);
  NEW.discount_minor := legacy_money_minor(NEW.discount);
  RETURN NEW;
END $$;
CREATE TRIGGER orders_revision_money BEFORE INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION order_revision_money();

CREATE FUNCTION assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.driver_id IS NOT NULL AND NEW.status IN ('assigned','at_pickup','in_transit','on_hold','returning') THEN
    -- Same driver account lock as HTTP acceptance; applies even to direct SQL writers.
    PERFORM id FROM users WHERE id = NEW.driver_id FOR UPDATE;
    INSERT INTO driver_run_resources(driver_id) VALUES(NEW.driver_id) ON CONFLICT DO NOTHING;
    PERFORM driver_id FROM driver_run_resources WHERE driver_id = NEW.driver_id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM orders WHERE driver_id=NEW.driver_id AND id<>NEW.id
      AND status IN ('assigned','at_pickup','in_transit','on_hold','returning')
      AND (NEW.service <> 'parcel' OR service <> 'parcel')) THEN
      RAISE EXCEPTION 'incompatible active driver commitment' USING ERRCODE='23514';
    END IF;
    IF NEW.service='parcel' AND (SELECT count(*) FROM orders WHERE driver_id=NEW.driver_id AND id<>NEW.id
      AND status IN ('assigned','at_pickup','in_transit','on_hold','returning')) >= 200 THEN
      RAISE EXCEPTION 'legacy parcel count capacity exceeded' USING ERRCODE='23514';
    END IF;
    UPDATE driver_run_resources SET revision=revision+1 WHERE driver_id=NEW.driver_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_assignment_guard BEFORE INSERT OR UPDATE OF driver_id,status,service ON orders FOR EACH ROW EXECUTE FUNCTION assignment_guard();

CREATE FUNCTION immutable_cash() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'cash ledger is append-only' USING ERRCODE='23514'; END IF;
  IF OLD.status <> 'pending' OR OLD.kind <> 'remittance' OR NEW.status NOT IN ('confirmed','disputed')
    OR NEW.decided_at IS NULL OR (to_jsonb(NEW) - 'status' - 'decided_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'decided_at') THEN
    RAISE EXCEPTION 'cash ledger is append-only' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cash_entries_immutable BEFORE UPDATE OR DELETE ON cash_entries FOR EACH ROW EXECUTE FUNCTION immutable_cash();
CREATE TRIGGER cash_entries_no_truncate BEFORE TRUNCATE ON cash_entries FOR EACH STATEMENT EXECUTE FUNCTION immutable_cash();

ALTER TABLE driver_locations
  ADD CONSTRAINT driver_location_coordinates CHECK (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180),
  ADD COLUMN point geometry(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng,lat),4326)) STORED;
CREATE INDEX driver_locations_point_gist ON driver_locations USING GIST(point);
ALTER TABLE checkpoints ADD CONSTRAINT checkpoint_coordinates CHECK ((lat IS NULL AND lng IS NULL) OR (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180));
ALTER TABLE orders ADD CONSTRAINT order_coordinates CHECK (
  ((pickup_lat IS NULL AND pickup_lng IS NULL) OR (pickup_lat IS NOT NULL AND pickup_lng IS NOT NULL AND pickup_lat BETWEEN -90 AND 90 AND pickup_lng BETWEEN -180 AND 180)) AND
  ((dropoff_lat IS NULL AND dropoff_lng IS NULL) OR (dropoff_lat IS NOT NULL AND dropoff_lng IS NOT NULL AND dropoff_lat BETWEEN -90 AND 90 AND dropoff_lng BETWEEN -180 AND 180)));
-- Storage only, no legal service coverage is fabricated or activated before WP05.
CREATE TABLE service_zone_geometries (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  policy_version BIGINT NOT NULL, geometry geometry(MultiPolygon,4326) NOT NULL,
  CHECK (ST_IsValid(geometry)));
CREATE INDEX service_zone_geometries_gist ON service_zone_geometries USING GIST(geometry);
CREATE TABLE command_results (actor_id BIGINT NOT NULL REFERENCES users(id), command_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL, http_status BIGINT NOT NULL, response TEXT NOT NULL, created_at BIGINT NOT NULL,
  PRIMARY KEY(actor_id,command_id));
-- Existing order_commands/order_actions retain requestId serialization; WP04 extends durable command/events.
