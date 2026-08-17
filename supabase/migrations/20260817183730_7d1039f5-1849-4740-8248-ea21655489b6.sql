-- A4: normalize approval status vocabulary to 'rejected'
UPDATE public.proposed_changes SET status = 'rejected' WHERE status = 'denied';

ALTER TABLE public.proposed_changes DROP CONSTRAINT IF EXISTS proposed_changes_status_check;
ALTER TABLE public.proposed_changes
  ADD CONSTRAINT proposed_changes_status_check
  CHECK (status IN ('pending','approved','rejected','edited','applied','cancelled'));

CREATE OR REPLACE FUNCTION public.on_proposal_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('approved','rejected') THEN

    BEGIN
      INSERT INTO public.notifications (title, message, level, meta)
      VALUES (
        'Proposal ' || NEW.status,
        COALESCE(NEW.title, 'Change #' || NEW.id::text),
        CASE WHEN NEW.status = 'approved' THEN 'info' ELSE 'warning' END,
        jsonb_build_object('proposal_id', NEW.id, 'status', NEW.status)
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    IF NEW.status = 'approved' THEN
      INSERT INTO public.job_queue (kind, priority, payload)
      VALUES (
        COALESCE(NEW.kind, 'proposal.execute'),
        3,
        jsonb_build_object(
          'proposal_id', NEW.id,
          'title', NEW.title,
          'payload', NEW.payload,
          'source', 'proposal_approval'
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- B1/B2: canonical model registry
CREATE TABLE IF NOT EXISTS public.model_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_main',
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'remote_api'
    CHECK (source_kind IN ('remote_api','downloadable')),
  format TEXT,
  size_bytes BIGINT,
  required_ram_mb INTEGER,
  supported_runtimes TEXT[] NOT NULL DEFAULT '{}',
  download_url TEXT,
  checksum TEXT,
  storage_path TEXT,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','downloading','downloaded','verifying','installed','ready','active','failed','deleting')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_model_registry_active
  ON public.model_registry(tenant_id) WHERE is_active = true;

GRANT SELECT ON public.model_registry TO authenticated;
GRANT ALL ON public.model_registry TO service_role;
ALTER TABLE public.model_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "model_registry read auth" ON public.model_registry;
CREATE POLICY "model_registry read auth" ON public.model_registry
  FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS trg_model_registry_updated ON public.model_registry;
CREATE TRIGGER trg_model_registry_updated
BEFORE UPDATE ON public.model_registry
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- seed the remote providers TIVO already supports (no fake local runtimes)
INSERT INTO public.model_registry (tenant_id, name, provider, source_kind, supported_runtimes, status, metadata)
VALUES
  ('tenant_main','google/gemini-3-flash-preview','lovable_gateway','remote_api','{cloud_api}','ready','{"default":true}'),
  ('tenant_main','gemini-2.0-flash','gemini_direct','remote_api','{cloud_api}','ready','{}'),
  ('tenant_main','Qwen/Qwen2.5-Coder-32B-Instruct','hf_router','remote_api','{cloud_api}','ready','{}')
ON CONFLICT (tenant_id, provider, name) DO NOTHING;