
-- Unique constraints needed for upsert
ALTER TABLE public.system_credentials DROP CONSTRAINT IF EXISTS system_credentials_tenant_key_uniq;
ALTER TABLE public.system_credentials ADD CONSTRAINT system_credentials_tenant_key_uniq UNIQUE (tenant_id, key_name);

ALTER TABLE public.system_map DROP CONSTRAINT IF EXISTS system_map_tenant_kind_name_uniq;
ALTER TABLE public.system_map ADD CONSTRAINT system_map_tenant_kind_name_uniq UNIQUE (tenant_id, kind, name);

-- Credential rotation history
CREATE TABLE IF NOT EXISTS public.credential_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'tenant_main',
  key_name text NOT NULL,
  action text NOT NULL,
  actor text NOT NULL DEFAULT 'super_admin',
  old_preview text DEFAULT '',
  new_preview text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.credential_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_all_credential_history ON public.credential_history FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Cost tracking
CREATE TABLE IF NOT EXISTS public.cost_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'tenant_main',
  provider text NOT NULL,
  model text DEFAULT '',
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cost_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_all_cost_tracking ON public.cost_tracking FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE INDEX IF NOT EXISTS idx_cost_tenant_created ON public.cost_tracking(tenant_id, created_at DESC);

-- Kill switch global state
CREATE TABLE IF NOT EXISTS public.kill_switch_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL UNIQUE DEFAULT 'tenant_main',
  external_apis_enabled boolean NOT NULL DEFAULT true,
  public_login_enabled boolean NOT NULL DEFAULT true,
  daily_budget_usd numeric(10,2) NOT NULL DEFAULT 0,
  monthly_budget_usd numeric(10,2) NOT NULL DEFAULT 0,
  reason text DEFAULT '',
  updated_by text DEFAULT 'super_admin',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kill_switch_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_all_kill_switch ON public.kill_switch_state FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Backup runs
CREATE TABLE IF NOT EXISTS public.backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'tenant_main',
  status text NOT NULL DEFAULT 'pending',
  destination text DEFAULT 'snapshot',
  size_bytes bigint DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_all_backup_runs ON public.backup_runs FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Inbound email commands
CREATE TABLE IF NOT EXISTS public.email_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'tenant_main',
  from_email text NOT NULL,
  subject text DEFAULT '',
  body text DEFAULT '',
  parsed_action text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  response text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
ALTER TABLE public.email_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_all_email_commands ON public.email_commands FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
