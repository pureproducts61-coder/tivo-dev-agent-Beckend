CREATE TABLE public.ai_variables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  description TEXT,
  is_secret BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_variables TO authenticated;
GRANT ALL ON public.ai_variables TO service_role;

ALTER TABLE public.ai_variables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own variables" ON public.ai_variables
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_ai_variables_updated_at
  BEFORE UPDATE ON public.ai_variables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX ai_variables_user_id_idx ON public.ai_variables(user_id);