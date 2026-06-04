-- Allow super admin to bypass the protected-profile trigger via a session-local flag.
CREATE OR REPLACE FUNCTION public.prevent_protected_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('app.super_admin_action', true) = 'on' THEN
    RETURN NEW;
  END IF;
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

REVOKE EXECUTE ON FUNCTION public.prevent_protected_profile_updates() FROM PUBLIC, anon, authenticated;

-- Super-admin-only RPC: set is_blocked / credits on a profile.
CREATE OR REPLACE FUNCTION public.super_admin_set_profile_flags(
  _user_id uuid,
  _is_blocked boolean DEFAULT NULL,
  _credits integer DEFAULT NULL
) RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.profiles;
BEGIN
  PERFORM set_config('app.super_admin_action', 'on', true);
  UPDATE public.profiles
     SET is_blocked = COALESCE(_is_blocked, is_blocked),
         credits    = COALESCE(_credits,    credits),
         updated_at = now()
   WHERE user_id = _user_id
   RETURNING * INTO r;
  PERFORM set_config('app.super_admin_action', '', true);
  RETURN r;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_set_profile_flags(uuid, boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_set_profile_flags(uuid, boolean, integer) TO service_role;