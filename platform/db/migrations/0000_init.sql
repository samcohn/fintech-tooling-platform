CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE role AS ENUM ('agent', 'approver');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE refund_status AS ENUM
    ('pending', 'recommended', 'approved', 'rejected', 'settled', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  role role NOT NULL
);

CREATE TABLE IF NOT EXISTS charges (
  id text PRIMARY KEY,
  customer_email text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD'
);

CREATE TABLE IF NOT EXISTS refund_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id text NOT NULL REFERENCES charges(id),
  customer_email text NOT NULL,
  card_last4 text NOT NULL,
  billing_address text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'USD',
  reason_code text NOT NULL,
  requested_by uuid NOT NULL REFERENCES users(id),
  recommended_by uuid REFERENCES users(id),
  committed_by uuid REFERENCES users(id),
  status refund_status NOT NULL DEFAULT 'pending',
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Money invariant: a charge cannot be refunded twice for the same
-- operation. Database-level, not application code.
CREATE UNIQUE INDEX IF NOT EXISTS refund_idempotency_key_uq
  ON refund_request (idempotency_key);

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES users(id),
  actor_email text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Append-only: reject UPDATE and DELETE at the database level.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % rejected', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_mutation ON audit_log;
CREATE TRIGGER audit_log_no_mutation
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- Money invariant: the sum of non-rejected/non-failed refunds against a
-- charge can never exceed the original charge amount.
CREATE OR REPLACE FUNCTION refund_sum_within_charge() RETURNS trigger AS $$
DECLARE
  total integer;
  charge_amount integer;
BEGIN
  IF NEW.status IN ('rejected', 'failed') THEN
    RETURN NEW;
  END IF;
  SELECT amount_cents INTO charge_amount FROM charges WHERE id = NEW.charge_id;
  SELECT COALESCE(SUM(amount_cents), 0) INTO total
    FROM refund_request
    WHERE charge_id = NEW.charge_id
      AND status NOT IN ('rejected', 'failed')
      AND id IS DISTINCT FROM NEW.id;
  IF total + NEW.amount_cents > charge_amount THEN
    RAISE EXCEPTION
      'refund total % + % exceeds charge amount % for charge %',
      total, NEW.amount_cents, charge_amount, NEW.charge_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS refund_sum_check ON refund_request;
CREATE TRIGGER refund_sum_check
  BEFORE INSERT OR UPDATE ON refund_request
  FOR EACH ROW EXECUTE FUNCTION refund_sum_within_charge();
