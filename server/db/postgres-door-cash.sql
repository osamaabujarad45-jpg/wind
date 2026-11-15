-- WP-01: door-time cash evidence. Nullable, additive; never read by commission, ledger or cap maths.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS collected_cents BIGINT CHECK (collected_cents BETWEEN 0 AND 100000000);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS variance_reason TEXT CHECK (variance_reason IN ('PARTIAL_PAYMENT','CUSTOMER_DID_NOT_PAY','APPROVED_DISCOUNT','RETURNED_ITEMS','INCORRECT_CASH','OTHER_ADMIN_REVIEW'));
