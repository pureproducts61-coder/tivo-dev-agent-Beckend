
REVOKE ALL ON FUNCTION public.on_proposal_status_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.on_proposal_status_change() TO service_role;
