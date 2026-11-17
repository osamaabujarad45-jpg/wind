-- SHIP-16/17: why a captain refused a parcel at pickup. Set only with exception_reason = 'captain_refused_pickup'; never reused for
-- the delivery `damaged` reason, so the pickup check stays separate evidence for goods-COD refunds (DLV-22).
ALTER TABLE orders ADD COLUMN exception_detail TEXT
  CHECK (exception_detail IS NULL OR (exception_detail IN ('prohibited_goods','damaged_parcel') AND exception_reason = 'captain_refused_pickup'));
