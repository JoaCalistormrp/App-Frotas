
-- 1) Fix EXPOSED_SENSITIVE_DATA: viewers no longer get blanket SELECT on profiles.
--    Provide a safe public view with only non-sensitive fields.
DROP POLICY IF EXISTS "viewer read profiles" ON public.profiles;

CREATE OR REPLACE VIEW public.profiles_public AS
SELECT id, full_name, base, company, role_function
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.drivers_directory TO authenticated;

-- 2) Fix MISSING_RLS_PROTECTION on maintenance_order_counters:
--    Mechanics should not have arbitrary UPDATE/DELETE. Restrict to SELECT/INSERT;
--    counter increments go through SECURITY DEFINER function next_order_number.
DROP POLICY IF EXISTS "moc mechanic" ON public.maintenance_order_counters;

CREATE POLICY "moc mechanic select"
ON public.maintenance_order_counters
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'mechanic'::app_role));

CREATE POLICY "moc mechanic insert"
ON public.maintenance_order_counters
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'mechanic'::app_role));

-- 3) Fix MISSING_STORAGE_POLICY: allow drivers to UPDATE/DELETE their own
--    documents in the driver-docs bucket (scoped to their own folder).
CREATE POLICY "driver-docs own update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'driver-docs'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'driver-docs'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "driver-docs own delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'driver-docs'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

NOTIFY pgrst, 'reload schema';
