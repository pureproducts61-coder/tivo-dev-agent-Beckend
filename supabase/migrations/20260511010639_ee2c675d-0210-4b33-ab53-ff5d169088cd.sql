ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'tenant_main';
CREATE INDEX IF NOT EXISTS idx_projects_tenant ON public.projects(tenant_id);

ALTER TABLE public.memory_logs ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'tenant_main';
CREATE INDEX IF NOT EXISTS idx_memory_logs_tenant ON public.memory_logs(tenant_id);