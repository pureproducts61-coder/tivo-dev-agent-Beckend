-- Force client-submitted payments to be pending and unreviewed
DROP POLICY IF EXISTS "Users can create own payments" ON public.payments;

CREATE POLICY "Users can create own pending payments"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND status = 'pending'
  AND admin_note IS NULL
  AND reviewed_at IS NULL
);

CREATE OR REPLACE FUNCTION public.enforce_payment_submission_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- service_role (backend/admin code) may set review fields; clients may not
  IF current_setting('request.jwt.claims', true) IS NOT NULL
     AND coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     AND auth.uid() IS NOT NULL THEN
    NEW.status := 'pending';
    NEW.admin_note := NULL;
    NEW.reviewed_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_payment_submission_defaults ON public.payments;
CREATE TRIGGER trg_enforce_payment_submission_defaults
BEFORE INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_submission_defaults();