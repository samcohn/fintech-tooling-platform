DO $$ BEGIN
  CREATE TYPE cr_lane AS ENUM ('app', 'platform');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cr_status AS ENUM
    ('triaging', 'awaiting_spec', 'in_progress', 'pr_open', 'blocked', 'merged');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS change_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request text NOT NULL,
  requested_by uuid NOT NULL REFERENCES users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  lane cr_lane,
  status cr_status NOT NULL DEFAULT 'triaging',
  pr_url text,
  blocked_reason text,
  classification_reasoning text
);
