-- A11: immutable delivery-fee collection claim, independent of receipts/settlement and merchandise COD.
CREATE TABLE order_cash_collections (
  order_id BIGINT PRIMARY KEY REFERENCES orders(id) DEFERRABLE INITIALLY DEFERRED,
  expected_minor BIGINT NOT NULL CHECK(expected_minor BETWEEN 0 AND 9007199254740991),
  collected_minor BIGINT NOT NULL CHECK(collected_minor BETWEEN 0 AND 9007199254740991),
  variance_reason TEXT,
  actor_id BIGINT NOT NULL REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  request_id TEXT NOT NULL CHECK(request_id ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'),
  collected_at BIGINT NOT NULL CHECK(collected_at BETWEEN 0 AND 9007199254740991),
  UNIQUE(actor_id, request_id),
  CHECK(CASE
    WHEN collected_minor = expected_minor THEN variance_reason IS NULL
    WHEN variance_reason IN ('INCORRECT_CASH','OTHER_ADMIN_REVIEW') THEN TRUE
    WHEN collected_minor < expected_minor THEN CASE variance_reason
      WHEN 'PARTIAL_PAYMENT' THEN collected_minor > 0
      WHEN 'CUSTOMER_DID_NOT_PAY' THEN collected_minor = 0
      WHEN 'APPROVED_DISCOUNT' THEN TRUE
      WHEN 'RETURNED_ITEMS' THEN TRUE
      ELSE FALSE END
    ELSE FALSE END)
);
CREATE FUNCTION order_cash_collection_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM orders o WHERE o.id=NEW.order_id AND o.service='parcel' AND o.status='completed'
    AND o.driver_id=NEW.actor_id AND o.price_minor-COALESCE(o.discount_minor,0)=NEW.expected_minor) THEN
    RAISE EXCEPTION 'cash collection requires completed assigned parcel and expected delivery fee' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_cash_collection_guard_trigger BEFORE INSERT ON order_cash_collections
  FOR EACH ROW EXECUTE FUNCTION order_cash_collection_guard();
CREATE TRIGGER order_cash_collections_immutable BEFORE UPDATE OR DELETE ON order_cash_collections
  FOR EACH ROW EXECUTE FUNCTION wp05_append_only();
CREATE TRIGGER order_cash_collections_no_truncate BEFORE TRUNCATE ON order_cash_collections
  FOR EACH STATEMENT EXECUTE FUNCTION wp05_append_only();
