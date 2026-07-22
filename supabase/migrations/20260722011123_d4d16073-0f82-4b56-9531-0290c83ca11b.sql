
-- 1. JOB QUEUE (Replit bridge)
CREATE TABLE IF NOT EXISTS public.job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  kind TEXT NOT NULL,
  priority SMALLINT NOT NULL DEFAULT 5,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','running','done','failed','cancelled')),
  claimed_by TEXT,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  result JSONB,
  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_queue_status_priority ON public.job_queue(status, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_job_queue_tenant ON public.job_queue(tenant_id);

GRANT ALL ON public.job_queue TO service_role;
ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_queue service only" ON public.job_queue FOR ALL USING (false) WITH CHECK (false);

DROP TRIGGER IF EXISTS trg_job_queue_updated ON public.job_queue;
CREATE TRIGGER trg_job_queue_updated
BEFORE UPDATE ON public.job_queue
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. AI CONSTITUTION (shared brain across Lovable + Replit)
CREATE TABLE IF NOT EXISTS public.ai_constitution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_constitution_active ON public.ai_constitution(is_active) WHERE is_active = true;

GRANT SELECT ON public.ai_constitution TO authenticated;
GRANT ALL ON public.ai_constitution TO service_role;
ALTER TABLE public.ai_constitution ENABLE ROW LEVEL SECURITY;
CREATE POLICY "constitution read auth" ON public.ai_constitution FOR SELECT TO authenticated USING (is_active = true);

DROP TRIGGER IF EXISTS trg_ai_constitution_updated ON public.ai_constitution;
CREATE TRIGGER trg_ai_constitution_updated
BEFORE UPDATE ON public.ai_constitution
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. APPROVAL → JOB + NOTIFICATION TRIGGER
CREATE OR REPLACE FUNCTION public.on_proposal_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('approved','denied') THEN

    -- Notification for the admin
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

    -- Auto-queue downstream execution job when approved
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

DROP TRIGGER IF EXISTS trg_proposal_status_hook ON public.proposed_changes;
CREATE TRIGGER trg_proposal_status_hook
AFTER UPDATE ON public.proposed_changes
FOR EACH ROW EXECUTE FUNCTION public.on_proposal_status_change();
