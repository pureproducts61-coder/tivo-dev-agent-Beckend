CREATE TABLE public.runtime_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  name text NOT NULL,
  endpoint text NOT NULL,
  auth_type text NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none','token','api_key')),
  credential_key text,
  enabled boolean NOT NULL DEFAULT true,
  capabilities text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT ALL ON public.runtime_connections TO service_role;
ALTER TABLE public.runtime_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Backend only" ON public.runtime_connections FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_runtime_connections_tenant_enabled ON public.runtime_connections(tenant_id, enabled);
CREATE TRIGGER trg_runtime_connections_updated BEFORE UPDATE ON public.runtime_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();