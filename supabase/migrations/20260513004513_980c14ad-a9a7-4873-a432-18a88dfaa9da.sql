
-- 1) Restrict profiles UPDATE: prevent users from changing credits or is_blocked
CREATE OR REPLACE FUNCTION public.prevent_protected_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.credits IS DISTINCT FROM OLD.credits THEN
    RAISE EXCEPTION 'credits can only be updated by the system';
  END IF;
  IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked THEN
    RAISE EXCEPTION 'is_blocked can only be updated by the system';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_protected_profile_updates ON public.profiles;
CREATE TRIGGER trg_prevent_protected_profile_updates
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_protected_profile_updates();

-- Add WITH CHECK to existing UPDATE policy by recreating it
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2) Storage: restrict project-files INSERT to user's own folder
DROP POLICY IF EXISTS "Authenticated users can upload to project-files" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own project files" ON storage.objects;
CREATE POLICY "Users upload own project files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users update own project files" ON storage.objects;
CREATE POLICY "Users update own project files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3) Make project-files SELECT scoped (no public listing). Bucket stays public for file URLs but listing requires ownership.
DROP POLICY IF EXISTS "Public can view project files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view project files" ON storage.objects;
DROP POLICY IF EXISTS "Users view own project files" ON storage.objects;
CREATE POLICY "Users view own project files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Mark project-files bucket private to prevent public listing while keeping signed-URL access
UPDATE storage.buckets SET public = false WHERE id = 'project-files';

-- 4) Restrict EXECUTE on SECURITY DEFINER trigger functions from anon/authenticated (only triggers/postgres should call them)
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.prevent_protected_profile_updates() FROM anon, authenticated, public;
