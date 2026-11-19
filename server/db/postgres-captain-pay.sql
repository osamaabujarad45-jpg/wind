-- Migration 40: widen reviews on schemas that already applied 39 and identify generated cash entries.
ALTER TABLE courier_block_reviews DROP CONSTRAINT IF EXISTS courier_block_reviews_service_check;
ALTER TABLE courier_block_reviews ADD CONSTRAINT courier_block_reviews_service_check CHECK (service IN ('ride','shop','parcel','freight'));

ALTER TABLE cash_entries ADD COLUMN order_id BIGINT REFERENCES orders(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE cash_entries ADD COLUMN source TEXT CHECK (source IS NULL OR (
  kind = 'adjustment' AND status = 'confirmed' AND (
    (source IN ('trip_pay','pickup_pay') AND order_id IS NOT NULL AND amount_cents < 0)
    OR (source = 'payout' AND order_id IS NULL AND amount_cents > 0 AND request_id IS NOT NULL)
  )
));
CREATE UNIQUE INDEX cash_entries_source_order ON cash_entries(source, order_id) WHERE order_id IS NOT NULL;
CREATE INDEX security_events_order_action ON security_events(order_id, action);

-- Preserve assignment evidence when importing an order from SQLite.
CREATE OR REPLACE FUNCTION order_revision_money() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.version := OLD.version + 1;
    NEW.assignment_epoch := OLD.assignment_epoch + CASE WHEN NEW.driver_id IS DISTINCT FROM OLD.driver_id OR
      (OLD.status NOT IN ('assigned','at_pickup','in_transit','on_hold','returning') AND NEW.status IN ('assigned','at_pickup','in_transit','on_hold','returning')) THEN 1 ELSE 0 END;
  ELSE
    NEW.version := 1;
    NEW.assignment_epoch := GREATEST(NEW.assignment_epoch, CASE WHEN NEW.driver_id IS NULL THEN 0 ELSE 1 END);
  END IF;
  NEW.price_minor := legacy_money_minor(NEW.price);
  NEW.commission_minor := legacy_money_minor(NEW.commission);
  NEW.discount_minor := legacy_money_minor(NEW.discount);
  RETURN NEW;
END $$;
