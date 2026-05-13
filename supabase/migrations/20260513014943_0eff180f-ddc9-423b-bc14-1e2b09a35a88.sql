
-- TIVO Autonomous Architecture: Memory, Approvals, Notifications, Audit, Snapshots, Map, Security

CREATE TABLE IF NOT EXISTS public.system_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_main',
  kind TEXT NOT NULL DEFAULT 'note',
  content TEXT NOT NULL,
  embedding JSONB DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  importance INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_system_memory_tenant ON public.system_memory(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_memory_kind ON public.system_memory(kind);

CREATE TABLE IF NOT EXISTS public.proposed_changes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_main',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  change_type TEXT NOT NULL DEFAULT 'code',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  rollback_data JSONB DEFAULT '{}'::jsonb,
  risk_level TEXT NOT NULL DEFAULT 'low',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proposed_changes_status ON public.proposed_changes(tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_main',
  level TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON public.notifications(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_main',
  actor TEXT NOT NULL DEFAULT 'tivo',
  action TEXT NOT NULL,
  target TEXT DEFAULT '',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON public.audit_logs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.system_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_main',
  label TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_system_snapshots_tenant ON public.system_snapshots(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.system_map (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_main',
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_map ON public.system_map(tenant_id, kind, name);

CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_main',
  threat_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'low',
  source_ip TEXT DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  blocked BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_events_tenant ON public.security_events(tenant_id, created_at DESC);

-- Enable RLS — default-deny; backend functions use service role to access
ALTER TABLE public.system_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposed_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- Realtime: notifications & proposed_changes for live super admin alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.proposed_changes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.security_events;
