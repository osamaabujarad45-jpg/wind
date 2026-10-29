-- Account-level audit rows (support reset, admin identity edit) have no order reference.
ALTER TABLE security_events ALTER COLUMN order_id DROP NOT NULL;
