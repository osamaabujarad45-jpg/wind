-- WP11: ride arrival evidence, grace clock and boarding challenge. PG-only
-- operational tables; no legacy SQLite counterpart and no rows are seeded.
-- The boarding counter is a separate table from proof_attempts, so parcel
-- handover and sender-return attempts/lockout are never affected.
CREATE TABLE ride_lifecycle (
  order_id BIGINT PRIMARY KEY REFERENCES orders(id),
  driver_id BIGINT REFERENCES users(id),
  assignment_epoch BIGINT NOT NULL CHECK(assignment_epoch BETWEEN 0 AND 9007199254740991),
  arrived_at BIGINT CHECK(arrived_at BETWEEN 0 AND 9007199254740991),
  arrival_source TEXT CHECK(arrival_source IN('gps','operator_override')),
  arrival_actor_id BIGINT REFERENCES users(id),
  boarding_code TEXT CHECK(boarding_code ~ '^[0-9]{4}$'),
  boarding_required BIGINT NOT NULL DEFAULT 0 CHECK(boarding_required IN(0,1)),
  created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  updated_at BIGINT NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991),
  CHECK((arrived_at IS NULL AND arrival_source IS NULL) OR (arrived_at IS NOT NULL AND arrival_source IS NOT NULL)),
  CHECK(boarding_required=0 OR boarding_code IS NOT NULL)
);
CREATE INDEX ride_lifecycle_driver ON ride_lifecycle(driver_id, order_id);

CREATE TABLE ride_boarding_attempts (
  order_id BIGINT PRIMARY KEY REFERENCES orders(id),
  assignment_epoch BIGINT NOT NULL CHECK(assignment_epoch BETWEEN 0 AND 9007199254740991),
  failures BIGINT NOT NULL DEFAULT 0 CHECK(failures BETWEEN 0 AND 9007199254740991)
);
