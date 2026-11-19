-- DRV-17 / SRS §2.1: a courier block's review. A ride ended in transit or a shop order taken into custody by a courier block
-- pays the blocked captain the trip so far only if a second admin records that the review cleared them, within 2 working days.
CREATE TABLE IF NOT EXISTS courier_block_reviews (
  order_id BIGINT PRIMARY KEY REFERENCES orders(id),
  driver_id BIGINT NOT NULL REFERENCES users(id),
  blocked_by BIGINT NOT NULL REFERENCES users(id),
  service TEXT NOT NULL CHECK (service IN ('ride','shop')),
  from_status TEXT NOT NULL,
  trip_pay_cents BIGINT NOT NULL CHECK (trip_pay_cents >= 0),
  blocked_at BIGINT NOT NULL,
  due_at BIGINT NOT NULL,
  decided_at BIGINT,
  decided_by BIGINT REFERENCES users(id),
  cleared BOOLEAN,
  paid_cents BIGINT CHECK (paid_cents >= 0),
  note TEXT NOT NULL DEFAULT '',
  CHECK ((decided_at IS NULL) = (decided_by IS NULL) AND (decided_at IS NULL) = (cleared IS NULL)),
  CHECK (decided_by IS NULL OR decided_by <> blocked_by)
);
CREATE INDEX IF NOT EXISTS courier_block_reviews_open ON courier_block_reviews(due_at) WHERE decided_at IS NULL;
