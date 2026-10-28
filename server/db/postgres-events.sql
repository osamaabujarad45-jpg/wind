-- WP04: transaction-local actor metadata; no private record snapshots are journalled.
CREATE TABLE event_sequences(order_id BIGINT PRIMARY KEY, sequence BIGINT NOT NULL);
CREATE TABLE domain_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id BIGINT,
 sequence BIGINT NOT NULL, type TEXT NOT NULL, actor_id BIGINT,
 correlation_id UUID NOT NULL,
 occurred_at BIGINT NOT NULL DEFAULT (extract(epoch FROM clock_timestamp())*1000)::bigint,
 schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version=1), payload JSONB NOT NULL,
 UNIQUE(order_id,sequence));
CREATE INDEX domain_events_order ON domain_events(order_id,sequence);
CREATE TABLE outbox (
 event_id UUID NOT NULL REFERENCES domain_events(id), destination TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0), next_attempt_at BIGINT NOT NULL DEFAULT 0,
 lease_owner UUID, lease_until BIGINT, status TEXT NOT NULL DEFAULT 'pending'
 CHECK(status IN ('pending','processing','delivered','obsolete','review')),
 last_error TEXT, PRIMARY KEY(event_id,destination));
CREATE INDEX outbox_due ON outbox(next_attempt_at,lease_until) WHERE status IN ('pending','processing');
CREATE TABLE consumer_inbox (
 event_id UUID NOT NULL REFERENCES domain_events(id), destination TEXT NOT NULL,
 received_at BIGINT NOT NULL, PRIMARY KEY(event_id,destination));
-- A local safe projection proves logical consumer dedupe and ignores older aggregate sequences.
CREATE TABLE event_projection(order_id BIGINT PRIMARY KEY, sequence BIGINT NOT NULL, event_id UUID NOT NULL);

CREATE FUNCTION append_domain_event(oid BIGINT, event_type TEXT, body JSONB) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE seq BIGINT; eid UUID; actor TEXT;
BEGIN
 IF oid IS NOT NULL THEN
  INSERT INTO event_sequences(order_id,sequence) VALUES(oid,1)
   ON CONFLICT(order_id) DO UPDATE SET sequence=event_sequences.sequence+1 RETURNING sequence INTO seq;
 ELSE seq:=1; END IF;
 IF oid IS NOT NULL THEN
  body:=jsonb_build_object('aggregateVersion',(SELECT version FROM orders WHERE id=oid),
   'assignmentEpoch',(SELECT assignment_epoch FROM orders WHERE id=oid)) || body;
 END IF;
 actor:=nullif(current_setting('wind.actor_id',true),'');
 INSERT INTO domain_events(order_id,sequence,type,actor_id,correlation_id,payload)
 VALUES(oid,seq,event_type,actor::bigint,coalesce(nullif(current_setting('wind.correlation_id',true),'')::uuid,gen_random_uuid()),body || jsonb_build_object(
  'systemPurpose',CASE WHEN actor IS NULL THEN coalesce(nullif(current_setting('wind.system_purpose',true),''),'database_maintenance') ELSE NULL END)) RETURNING id INTO eid;
 INSERT INTO outbox(event_id,destination) VALUES(eid,'timeline');
 RETURN eid;
END $$;
CREATE FUNCTION journal_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM append_domain_event(NEW.id,CASE WHEN TG_OP='INSERT' THEN 'order.created' ELSE 'order.changed' END,
  jsonb_build_object('status',NEW.status,'aggregateVersion',NEW.version,'assignmentEpoch',NEW.assignment_epoch,
   'driverId',NEW.driver_id,'currency',NEW.currency,'priceMinor',NEW.price_minor,'commissionMinor',NEW.commission_minor));
 RETURN NEW;
END $$;
CREATE TRIGGER orders_domain_event AFTER INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION journal_order();
CREATE FUNCTION journal_proof() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- A proof miss is a committed aggregate mutation even when public lifecycle status stays unchanged.
 UPDATE orders SET updated_at=updated_at WHERE id=NEW.order_id;
 PERFORM append_domain_event(NEW.order_id,'proof.attempted',jsonb_build_object('failures',NEW.failures,
  'aggregateVersion',(SELECT version FROM orders WHERE id=NEW.order_id),
  'assignmentEpoch',(SELECT assignment_epoch FROM orders WHERE id=NEW.order_id)));
 RETURN NEW;
END $$;
CREATE TRIGGER proof_domain_event AFTER INSERT OR UPDATE ON proof_attempts FOR EACH ROW EXECUTE FUNCTION journal_proof();
CREATE FUNCTION journal_security() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- Intentionally omit free-form detail, notes and all proof material.
 PERFORM append_domain_event(NEW.order_id,'security.recorded',jsonb_build_object('action',NEW.action));
 RETURN NEW;
END $$;
CREATE TRIGGER security_domain_event AFTER INSERT ON security_events FOR EACH ROW EXECUTE FUNCTION journal_security();
CREATE FUNCTION journal_cash() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM append_domain_event(NULL,'cash.changed',jsonb_build_object('entryId',NEW.id,'driverId',NEW.driver_id,
  'kind',NEW.kind,'status',NEW.status,'aggregateVersion',NEW.version,'amountMinor',NEW.amount_cents,'currency','ILS'));
 RETURN NEW;
END $$;
CREATE TRIGGER cash_domain_event AFTER INSERT OR UPDATE ON cash_entries FOR EACH ROW EXECUTE FUNCTION journal_cash();

-- Cash decisions expose a revision only to opt-in clients; existing receipt serialization is unchanged.
ALTER TABLE cash_entries ADD COLUMN version BIGINT NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991);
CREATE FUNCTION cash_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.version:=OLD.version+1; RETURN NEW; END $$;
-- Runs after the existing immutable-column guard, before the AFTER journal trigger.
CREATE TRIGGER cash_entries_revision BEFORE UPDATE ON cash_entries FOR EACH ROW EXECUTE FUNCTION cash_revision();
