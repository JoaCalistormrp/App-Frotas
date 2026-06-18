-- Allow any authenticated user to read active driver profiles (needed for dropdowns)
CREATE POLICY "profiles driver directory"
  ON public.profiles FOR SELECT TO authenticated
  USING (driver_active = true);

-- Also extend the admin self-select policy to cover master role
DROP POLICY IF EXISTS "profiles self select" ON public.profiles;
CREATE POLICY "profiles self select"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'master'::app_role)
  );

NOTIFY pgrst, 'reload schema';
