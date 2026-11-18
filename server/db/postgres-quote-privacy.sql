-- Account deletion must be able to scrub a quote's personal fields (notes, phones, names, pins and the itinerary
-- hash, which hashes the phones), which the immutability guard froze with the fare. Only for a deleted (blocked)
-- customer, and only to the scrubbed value ('' or NULL); pricing, service, cities, scope and consumption stay
-- immutable for everyone. declared_scope (migration 15) joins the guard. Release review, 18 Nov.
CREATE OR REPLACE FUNCTION quotes_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scrub boolean := EXISTS (SELECT 1 FROM users WHERE id = OLD.customer_id AND status = 'blocked');
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'quotes are immutable' USING ERRCODE='23514'; END IF;
  IF OLD.id IS DISTINCT FROM NEW.id OR OLD.customer_id IS DISTINCT FROM NEW.customer_id OR OLD.service IS DISTINCT FROM NEW.service
    OR OLD.pickup_city IS DISTINCT FROM NEW.pickup_city OR OLD.dropoff_city IS DISTINCT FROM NEW.dropoff_city
    OR (OLD.pickup_lat IS DISTINCT FROM NEW.pickup_lat AND (NEW.pickup_lat IS NOT NULL OR NOT scrub))
    OR (OLD.pickup_lng IS DISTINCT FROM NEW.pickup_lng AND (NEW.pickup_lng IS NOT NULL OR NOT scrub))
    OR (OLD.dropoff_lat IS DISTINCT FROM NEW.dropoff_lat AND (NEW.dropoff_lat IS NOT NULL OR NOT scrub))
    OR (OLD.dropoff_lng IS DISTINCT FROM NEW.dropoff_lng AND (NEW.dropoff_lng IS NOT NULL OR NOT scrub))
    OR (OLD.pickup_note IS DISTINCT FROM NEW.pickup_note AND (NEW.pickup_note <> '' OR NOT scrub))
    OR (OLD.dropoff_note IS DISTINCT FROM NEW.dropoff_note AND (NEW.dropoff_note <> '' OR NOT scrub))
    OR (OLD.contact IS DISTINCT FROM NEW.contact AND (NEW.contact <> '' OR NOT scrub))
    OR (OLD.pickup_contact IS DISTINCT FROM NEW.pickup_contact AND (NEW.pickup_contact IS NOT NULL OR NOT scrub))
    OR (OLD.recipient_name IS DISTINCT FROM NEW.recipient_name AND (NEW.recipient_name IS NOT NULL OR NOT scrub))
    OR (OLD.recipient_phone IS DISTINCT FROM NEW.recipient_phone AND (NEW.recipient_phone IS NOT NULL OR NOT scrub))
    OR (OLD.detail IS DISTINCT FROM NEW.detail AND (NEW.detail <> '' OR NOT scrub))
    OR OLD.option IS DISTINCT FROM NEW.option
    OR OLD.loading_help IS DISTINCT FROM NEW.loading_help OR OLD.shared IS DISTINCT FROM NEW.shared
    OR OLD.scheduled_for IS DISTINCT FROM NEW.scheduled_for OR OLD.currency IS DISTINCT FROM NEW.currency
    OR OLD.price_minor IS DISTINCT FROM NEW.price_minor OR OLD.discount_minor IS DISTINCT FROM NEW.discount_minor
    OR OLD.commission_minor IS DISTINCT FROM NEW.commission_minor OR OLD.tariff_snapshot IS DISTINCT FROM NEW.tariff_snapshot
    OR OLD.tariff_basis_points IS DISTINCT FROM NEW.tariff_basis_points OR OLD.tariff_version IS DISTINCT FROM NEW.tariff_version
    OR OLD.graph_version IS DISTINCT FROM NEW.graph_version OR OLD.profile_version IS DISTINCT FROM NEW.profile_version
    OR OLD.restriction_version IS DISTINCT FROM NEW.restriction_version OR OLD.provider_version IS DISTINCT FROM NEW.provider_version
    OR OLD.eta_min_seconds IS DISTINCT FROM NEW.eta_min_seconds OR OLD.eta_max_seconds IS DISTINCT FROM NEW.eta_max_seconds
    OR OLD.feasibility IS DISTINCT FROM NEW.feasibility OR OLD.reasons IS DISTINCT FROM NEW.reasons
    OR OLD.disclosures IS DISTINCT FROM NEW.disclosures OR OLD.lines IS DISTINCT FROM NEW.lines
    OR (OLD.itinerary_hash IS DISTINCT FROM NEW.itinerary_hash AND (NEW.itinerary_hash <> '' OR NOT scrub)) OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
    OR OLD.declared_scope IS DISTINCT FROM NEW.declared_scope
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN RAISE EXCEPTION 'quotes are immutable' USING ERRCODE='23514'; END IF;
  IF OLD.consumed_at IS NOT NULL AND (NEW.consumed_at IS DISTINCT FROM OLD.consumed_at OR NEW.consumed_order_id IS DISTINCT FROM OLD.consumed_order_id)
  THEN RAISE EXCEPTION 'quote already consumed' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
