-- Lock down model_registry: no client-side reads. All access via backend (service_role).
DROP POLICY IF EXISTS "model_registry read auth" ON public.model_registry;
REVOKE SELECT ON public.model_registry FROM authenticated;
REVOKE ALL ON public.model_registry FROM anon;
GRANT ALL ON public.model_registry TO service_role;
ALTER TABLE public.model_registry ENABLE ROW LEVEL SECURITY;

-- Deny-by-default explicit policy so intent is documented (service_role bypasses RLS).
DROP POLICY IF EXISTS "model_registry no client access" ON public.model_registry;
CREATE POLICY "model_registry no client access" ON public.model_registry
  FOR SELECT TO authenticated USING (false);

-- Extend lifecycle vocabulary (backward compatible: all previous values kept).
ALTER TABLE public.model_registry DROP CONSTRAINT IF EXISTS model_registry_status_check;
ALTER TABLE public.model_registry ADD CONSTRAINT model_registry_status_check
  CHECK (status IN ('available','downloading','downloaded','verifying','installed','ready','active','failed','deleting','inactive','deleted'));

-- Minimal, additive device/runtime metadata.
ALTER TABLE public.model_registry ADD COLUMN IF NOT EXISTS platforms TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.model_registry ADD COLUMN IF NOT EXISTS quantization TEXT;