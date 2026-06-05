DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.messages';
  END IF;
END $$;

-- Drop the misleading deny_all/super_admin_realtime SELECT policies on messages.
-- The remaining "Users can view own messages" policy already correctly scopes reads.
DROP POLICY IF EXISTS "deny_all_realtime_messages" ON public.messages;
DROP POLICY IF EXISTS "super_admin_realtime_messages" ON public.messages;