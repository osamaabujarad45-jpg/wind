-- T33: destination-change parity on PostgreSQL. The proposals table mirrors the SQLite definition with
-- PostgreSQL types; orders gain the commission-rate snapshot the assignment agreement binds (fresh
-- schemas may already carry it through future schema revisions; the ALTER is idempotent).
CREATE TABLE IF NOT EXISTS destination_changes (
  id UUID PRIMARY KEY, order_id BIGINT NOT NULL REFERENCES orders(id), customer_id BIGINT NOT NULL REFERENCES users(id),
  driver_id BIGINT NOT NULL REFERENCES users(id), original TEXT NOT NULL, dropoff_city TEXT NOT NULL,
  dropoff_lat DOUBLE PRECISION, dropoff_lng DOUBLE PRECISION, dropoff_note TEXT NOT NULL, price DOUBLE PRECISION NOT NULL,
  discount DOUBLE PRECISION, commission DOUBLE PRECISION NOT NULL, route_km DOUBLE PRECISION NOT NULL,
  road_info TEXT NOT NULL, tariff_version TEXT NOT NULL, customer_plan TEXT,
  state TEXT NOT NULL CHECK (state IN ('quote','pending','accepted','declined','withdrawn')),
  created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, decided_at BIGINT);
CREATE INDEX IF NOT EXISTS destination_changes_order ON destination_changes(order_id, state, created_at);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_rate DOUBLE PRECISION;
