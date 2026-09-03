CREATE TABLE public.execution_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  task_id uuid,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  type text NOT NULL,
  runtime text,
  capability text,
  message text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.execution_events TO authenticated;
GRANT ALL ON public.execution_events TO service_role;

ALTER TABLE public.execution_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own execution events"
  ON public.execution_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own execution events"
  ON public.execution_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX execution_events_conversation_created_idx
  ON public.execution_events (conversation_id, created_at DESC);
CREATE INDEX execution_events_task_created_idx
  ON public.execution_events (task_id, created_at DESC);
CREATE INDEX execution_events_project_created_idx
  ON public.execution_events (project_id, created_at DESC);
CREATE INDEX execution_events_user_created_idx
  ON public.execution_events (user_id, created_at DESC);

ALTER TABLE public.execution_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.execution_events;