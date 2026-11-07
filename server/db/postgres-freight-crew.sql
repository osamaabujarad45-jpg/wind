-- Migration 28: preserve declared crew seats alongside inspected freight cargo.
-- Replaces the assignment guard; prior migration files remain immutable.
CREATE OR REPLACE FUNCTION wp05_assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d driver_eligibility%ROWTYPE; r capacity_reservations%ROWTYPE; v vehicles%ROWTYPE;
  q order_requirements%ROWTYPE; s order_declared_scope%ROWTYPE; prior record; item jsonb; run_revision bigint; policy_revision bigint;
  total_grams numeric:=0; total_volume numeric:=0; total_pieces numeric:=0; total_seats numeric:=0; total_length numeric:=0;
  now_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
  e_grams numeric; e_cm3 numeric; e_pieces numeric; e_seats numeric;
BEGIN
  IF NEW.driver_id IS NULL OR NEW.status NOT IN('assigned','at_pickup','in_transit','on_hold','returning') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.driver_id IS NOT DISTINCT FROM NEW.driver_id AND OLD.status IN('assigned','at_pickup','in_transit','on_hold','returning') THEN RETURN NEW; END IF;
  SELECT * INTO d FROM driver_eligibility WHERE driver_id=NEW.driver_id FOR UPDATE;
  IF NOT FOUND THEN
    IF EXISTS(SELECT 1 FROM order_requirements WHERE order_id=NEW.id) OR EXISTS(SELECT 1 FROM order_declared_scope WHERE order_id=NEW.id) THEN RAISE EXCEPTION 'measured enrollment required' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO v FROM vehicles WHERE id=d.vehicle_id FOR UPDATE;
  SELECT revision INTO run_revision FROM vehicle_runs WHERE vehicle_id=v.id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM orders o JOIN driver_eligibility selected ON selected.driver_id=o.driver_id
    WHERE selected.vehicle_id=v.id AND o.id<>NEW.id AND o.status IN('assigned','at_pickup','in_transit','on_hold','returning')
    AND (NEW.service<>'parcel' OR o.service<>'parcel')) THEN
    RAISE EXCEPTION 'shared vehicle incompatible commitment' USING ERRCODE='23514'; END IF;
  IF d.enrolled<>1 THEN
    IF EXISTS(SELECT 1 FROM order_requirements WHERE order_id=NEW.id) OR EXISTS(SELECT 1 FROM order_declared_scope WHERE order_id=NEW.id) OR EXISTS(SELECT 1 FROM capacity_reservations c JOIN orders o ON o.id=c.order_id WHERE c.vehicle_id=v.id
      AND o.status IN('assigned','at_pickup','in_transit','on_hold','returning')) THEN
      RAISE EXCEPTION 'unknown load cannot join measured vehicle' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  SELECT revision INTO policy_revision FROM eligibility_policy WHERE id=1;
  SELECT * INTO q FROM order_requirements WHERE order_id=NEW.id FOR SHARE;
  SELECT * INTO s FROM order_declared_scope WHERE order_id=NEW.id FOR SHARE;
  IF q.order_id IS NOT NULL AND NEW.service='freight' THEN q.seats:=greatest(q.seats,coalesce(s.crew_count,0)); END IF;
  SELECT * INTO r FROM capacity_reservations WHERE order_id=NEW.id FOR UPDATE;
  IF r.order_id IS NULL OR r.driver_id<>NEW.driver_id OR r.vehicle_id<>v.id OR r.vehicle_revision<>v.revision
    OR r.driver_revision<>d.revision OR r.policy_revision<>policy_revision OR r.run_revision IS DISTINCT FROM run_revision
    OR r.evidence_kind<>'new_acceptance' OR d.state<>'approved' OR v.state<>'approved' OR v.inspection_required<>0
    OR d.valid_until<=r.planned_end OR v.valid_until<=r.planned_end OR r.planned_end<=now_ms
    OR NOT EXISTS(SELECT 1 FROM users u WHERE u.id=NEW.driver_id AND u.role='driver' AND u.status='active' AND u.vehicle=v.class) THEN
    RAISE EXCEPTION 'canonical measured reservation required' USING ERRCODE='23514'; END IF;
  IF q.order_id IS NOT NULL THEN
    IF r.requirements_revision<>q.revision OR (r.grams,r.cm3,r.pieces,r.seats,r.service) IS DISTINCT FROM (q.grams,q.cm3,q.pieces,q.seats,NEW.service) THEN
      RAISE EXCEPTION 'canonical measured reservation required' USING ERRCODE='23514'; END IF;
  ELSIF s.order_id IS NOT NULL THEN
    e_grams:=COALESCE(s.mass_grams,0); e_cm3:=COALESCE(s.volume_cm3,0); e_pieces:=COALESCE(s.item_count,1);
    e_seats:=CASE WHEN NEW.service='freight' THEN COALESCE(s.crew_count,1) ELSE 0 END;
    IF s.service<>NEW.service OR r.requirements_revision<>s.revision
      OR (r.grams,r.cm3,r.pieces,r.seats,r.service) IS DISTINCT FROM (e_grams,e_cm3,e_pieces,e_seats,NEW.service) THEN
      RAISE EXCEPTION 'canonical measured reservation required' USING ERRCODE='23514'; END IF;
  ELSE
    RAISE EXCEPTION 'canonical measured reservation required' USING ERRCODE='23514';
  END IF;
  FOR prior IN
    SELECT NEW.id order_id,NEW.service service,NEW.driver_id driver_id,NEW.option booked_option
    UNION ALL SELECT o.id,o.service,o.driver_id,o.option FROM orders o JOIN driver_eligibility selected ON selected.driver_id=o.driver_id
      WHERE selected.vehicle_id=v.id AND o.id<>NEW.id AND o.status IN('assigned','at_pickup','in_transit','on_hold','returning')
  LOOP
    SELECT * INTO q FROM order_requirements WHERE order_id=prior.order_id FOR SHARE;
    SELECT * INTO s FROM order_declared_scope WHERE order_id=prior.order_id FOR SHARE;
    IF q.order_id IS NOT NULL AND prior.service='freight' THEN q.seats:=greatest(q.seats,coalesce(s.crew_count,0)); END IF;
    SELECT * INTO r FROM capacity_reservations WHERE order_id=prior.order_id FOR UPDATE;
    IF r.order_id IS NULL OR r.vehicle_id<>v.id OR r.driver_id<>prior.driver_id THEN
      RAISE EXCEPTION 'invalid physical scope or unknown prior load' USING ERRCODE='23514'; END IF;
    IF q.order_id IS NOT NULL THEN
      IF r.requirements_revision<>q.revision OR (r.grams,r.cm3,r.pieces,r.seats,r.service) IS DISTINCT FROM (q.grams,q.cm3,q.pieces,q.seats,prior.service)
        OR NOT wp05_resources_valid(q) OR NOT q.equipment <@ v.equipment
        OR (prior.service='ride' AND (q.seats<1 OR q.pieces<>0)) OR (prior.service='parcel' AND (q.seats<>0 OR q.pieces<1)) OR (prior.service='freight' AND q.pieces<1) THEN
        RAISE EXCEPTION 'invalid physical scope or unknown prior load' USING ERRCODE='23514'; END IF;
      IF prior.service='ride' THEN
        IF prior.booked_option!~'^[0-9]{1,3}$' THEN RAISE EXCEPTION 'invalid booked seats' USING ERRCODE='23514'; END IF;
        IF q.seats<prior.booked_option::numeric THEN RAISE EXCEPTION 'booked seats understated' USING ERRCODE='23514'; END IF;
      END IF;
      total_grams:=total_grams+q.grams; total_volume:=total_volume+q.cm3; total_pieces:=total_pieces+q.pieces; total_seats:=total_seats+q.seats;
      FOR item IN SELECT value FROM jsonb_array_elements(q.items) LOOP
        IF (item->>'lengthMm')::numeric>v.length_mm OR (item->>'widthMm')::numeric>v.width_mm OR (item->>'heightMm')::numeric>v.height_mm THEN
          RAISE EXCEPTION 'fixed axis dimensions exceeded' USING ERRCODE='23514'; END IF;
        total_length:=total_length+(item->>'count')::numeric*(item->>'lengthMm')::numeric;
      END LOOP;
    ELSIF s.order_id IS NOT NULL THEN
      e_grams:=COALESCE(s.mass_grams,0); e_cm3:=COALESCE(s.volume_cm3,0); e_pieces:=COALESCE(s.item_count,1);
      e_seats:=CASE WHEN prior.service='freight' THEN COALESCE(s.crew_count,1) ELSE 0 END;
      IF s.service<>prior.service OR prior.service='ride' OR r.requirements_revision<>s.revision
        OR (r.grams,r.cm3,r.pieces,r.seats,r.service) IS DISTINCT FROM (e_grams,e_cm3,e_pieces,e_seats,prior.service)
        OR jsonb_typeof(s.equipment)<>'array' OR jsonb_typeof(s.access_constraints)<>'array'
        OR NOT s.equipment <@ v.equipment OR NOT s.access_constraints <@ v.equipment
        OR e_pieces<1 OR (prior.service='parcel' AND e_seats<>0)
        OR (s.length_mm IS NOT NULL AND e_cm3<>e_pieces*ceil(s.length_mm::numeric*s.width_mm::numeric*s.height_mm::numeric/1000)) THEN
        RAISE EXCEPTION 'invalid physical scope or unknown prior load' USING ERRCODE='23514'; END IF;
      total_grams:=total_grams+e_grams; total_volume:=total_volume+e_cm3; total_pieces:=total_pieces+e_pieces; total_seats:=total_seats+e_seats;
      IF s.length_mm IS NOT NULL THEN
        IF s.length_mm>v.length_mm OR s.width_mm>v.width_mm OR s.height_mm>v.height_mm THEN
          RAISE EXCEPTION 'fixed axis dimensions exceeded' USING ERRCODE='23514'; END IF;
        total_length:=total_length+e_pieces*s.length_mm;
      END IF;
    ELSE
      RAISE EXCEPTION 'invalid physical scope or unknown prior load' USING ERRCODE='23514';
    END IF;
  END LOOP;
  IF total_grams>v.usable_grams OR total_volume>v.usable_cm3 OR total_pieces>least(200,v.max_pieces) OR total_seats>v.seats OR total_length>v.length_mm THEN
    RAISE EXCEPTION 'shared physical capacity exceeded' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

