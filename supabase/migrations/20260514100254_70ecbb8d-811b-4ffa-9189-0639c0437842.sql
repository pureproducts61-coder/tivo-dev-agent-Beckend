-- Enable RLS + default-deny on all system_* and operational tables (service-role-only access via edge functions)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposed_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_snapshots ENABLE ROW LEVEL SECURITY;

-- Default-deny: no public/anon/authenticated policies. Service role bypasses RLS automatically.
DO $$ BEGIN
  EXECUTE 'CREATE POLICY "deny_all_audit_logs" ON public.audit_logs FOR ALL TO authenticated, anon USING (false) WITH CHECK (false)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'CREATE POLICY "deny_all_notifications" ON public.notifications FOR ALL TO authenticated, anon USING (false) WITH CHECK (false)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'CREATE POLICY "deny_all_proposed_changes" ON public.proposed_changes FOR ALL TO authenticated, anon USING (false) WITH CHECK (false)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'CREATE POLICY "deny_all_security_events" ON public.security_events FOR ALL TO authenticated, anon USING (false) WITH CHECK (false)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'CREATE POLICY "deny_all_system_map" ON public.system_map FOR ALL TO authenticated, anon USING (false) WITH CHECK (false)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'CREATE POLICY "deny_all_system_memory" ON public.system_memory FOR ALL TO authenticated, anon USING (false) WITH CHECK (false)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'CREATE POLICY "deny_all_system_snapshots" ON public.system_snapshots FOR ALL TO authenticated, anon USING (false) WITH CHECK (false)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- New: system_credentials — Super-admin-managed API keys (Gemini, Groq, HF, Tavily, GitHub, etc.)
CREATE TABLE IF NOT EXISTS public.system_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'tenant_main',
  key_name text NOT NULL,
  value text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key_name)
);
ALTER TABLE public.system_credentials ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  EXECUTE 'CREATE POLICY "deny_all_system_credentials" ON public.system_credentials FOR ALL TO authenticated, anon USING (false) WITH CHECK (false)';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_system_credentials_tenant ON public.system_credentials (tenant_id, key_name);

DROP TRIGGER IF EXISTS trg_system_credentials_updated_at ON public.system_credentials;
CREATE TRIGGER trg_system_credentials_updated_at
BEFORE UPDATE ON public.system_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();