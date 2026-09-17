-- Platform triggers (docs/05 §4.7). Hand-written; drizzle-kit does not manage functions/triggers.

-- updated_at maintenance -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER feature_flags_set_updated_at BEFORE UPDATE ON app.feature_flags
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER outbox_jobs_set_updated_at BEFORE UPDATE ON app.outbox_jobs
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER countries_set_updated_at BEFORE UPDATE ON app.countries
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER currencies_set_updated_at BEFORE UPDATE ON app.currencies
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER taxonomy_terms_set_updated_at BEFORE UPDATE ON app.taxonomy_terms
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
--> statement-breakpoint

-- Immutability guard for append-only tables -----------------------------------------------------
CREATE OR REPLACE FUNCTION app.raise_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table %.% is append-only', TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_update_delete BEFORE UPDATE OR DELETE ON app.audit_logs
  FOR EACH ROW EXECUTE FUNCTION app.raise_immutable();
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON app.audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION app.raise_immutable();
--> statement-breakpoint

-- Audit hash chain ---------------------------------------------------------------------------------
-- row_hash = sha256(prev_hash | id | occurred_at | actor_type | actor_user_id | action | target_type
--                   | target_id | request_id | ip_prefix | user_agent_hash | metadata)
CREATE OR REPLACE FUNCTION app.audit_log_hash(
  p_prev_hash text, p_id bigint, p_occurred_at timestamptz, p_actor_type text, p_actor_user_id uuid,
  p_action text, p_target_type text, p_target_id text, p_request_id text, p_ip_prefix inet,
  p_user_agent_hash text, p_metadata jsonb
) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(digest(concat_ws('|',
    coalesce(p_prev_hash, ''),
    p_id::text,
    to_char(p_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    p_actor_type,
    coalesce(p_actor_user_id::text, ''),
    p_action,
    coalesce(p_target_type, ''),
    coalesce(p_target_id, ''),
    coalesce(p_request_id, ''),
    coalesce(host(p_ip_prefix) || '/' || masklen(p_ip_prefix), ''),
    coalesce(p_user_agent_hash, ''),
    p_metadata::text
  ), 'sha256'), 'hex')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.audit_logs_chain() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  last_hash text;
BEGIN
  -- Serialize chain appends; the lock is held until commit so ids follow chain order.
  PERFORM pg_advisory_xact_lock(hashtext('app.audit_logs_chain'));
  NEW.id := nextval('app.audit_logs_id_seq');
  NEW.occurred_at := coalesce(NEW.occurred_at, now());
  SELECT row_hash INTO last_hash FROM app.audit_logs ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := last_hash;
  NEW.row_hash := app.audit_log_hash(last_hash, NEW.id, NEW.occurred_at, NEW.actor_type,
    NEW.actor_user_id, NEW.action, NEW.target_type, NEW.target_id, NEW.request_id, NEW.ip_prefix,
    NEW.user_agent_hash, NEW.metadata);
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_chain BEFORE INSERT ON app.audit_logs
  FOR EACH ROW EXECUTE FUNCTION app.audit_logs_chain();
--> statement-breakpoint

-- Returns the id of the first row whose hash or back-link does not verify, or NULL if intact.
CREATE OR REPLACE FUNCTION app.verify_audit_chain() RETURNS bigint
LANGUAGE plpgsql STABLE AS $$
DECLARE
  r app.audit_logs%ROWTYPE;
  expected_prev text := NULL;
BEGIN
  FOR r IN SELECT * FROM app.audit_logs ORDER BY id LOOP
    IF r.prev_hash IS DISTINCT FROM expected_prev
       OR r.row_hash <> app.audit_log_hash(r.prev_hash, r.id, r.occurred_at, r.actor_type,
            r.actor_user_id, r.action, r.target_type, r.target_id, r.request_id, r.ip_prefix,
            r.user_agent_hash, r.metadata) THEN
      RETURN r.id;
    END IF;
    expected_prev := r.row_hash;
  END LOOP;
  RETURN NULL;
END
$$;
