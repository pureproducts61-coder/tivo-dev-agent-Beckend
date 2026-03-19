
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS version_history jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS build_metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS installer_url text DEFAULT '';
