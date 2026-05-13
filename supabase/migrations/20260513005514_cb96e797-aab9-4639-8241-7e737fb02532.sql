
-- 1) Drop overly permissive storage INSERT policy
DROP POLICY IF EXISTS "Authenticated users can upload project files" ON storage.objects;

-- 2) Tighten profiles UPDATE policy with column-protective WITH CHECK
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND credits = (SELECT credits FROM public.profiles WHERE user_id = auth.uid())
  AND is_blocked = (SELECT is_blocked FROM public.profiles WHERE user_id = auth.uid())
);
