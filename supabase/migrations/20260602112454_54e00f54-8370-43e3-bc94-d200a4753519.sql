
-- 1) checklist-photos: ownership-scoped policies
DROP POLICY IF EXISTS "checklist photos auth read" ON storage.objects;
DROP POLICY IF EXISTS "checklist photos auth write" ON storage.objects;
DROP POLICY IF EXISTS "checklist photos auth update" ON storage.objects;
DROP POLICY IF EXISTS "checklist photos auth delete" ON storage.objects;

CREATE POLICY "checklist photos scoped read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'checklist-photos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'mechanic'::app_role)
    OR has_role(auth.uid(), 'viewer'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND c.driver_id = auth.uid()
    )
  )
);

CREATE POLICY "checklist photos owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'checklist-photos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND c.driver_id = auth.uid()
    )
  )
);

CREATE POLICY "checklist photos owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'checklist-photos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND c.driver_id = auth.uid()
    )
  )
);

CREATE POLICY "checklist photos owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'checklist-photos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND c.driver_id = auth.uid()
    )
  )
);

-- 2) maintenance-signatures: scoped read/insert for mechanics and admins
CREATE POLICY "maintenance signatures own insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'maintenance-signatures'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'mechanic'::app_role)
      AND (auth.uid())::text = (storage.foldername(name))[1]
    )
  )
);

CREATE POLICY "maintenance signatures scoped read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'maintenance-signatures'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'mechanic'::app_role)
    OR has_role(auth.uid(), 'viewer'::app_role)
  )
);

-- 3) profiles: replace blanket mechanic read with a minimal driver directory view
DROP POLICY IF EXISTS "mechanic read profiles" ON public.profiles;

CREATE OR REPLACE VIEW public.drivers_directory
WITH (security_invoker = on) AS
SELECT p.id, p.full_name
FROM public.profiles p;

GRANT SELECT ON public.drivers_directory TO authenticated;

-- Allow mechanics to read minimal profile fields through the base table via a
-- restricted policy limited to drivers who appear in maintenance orders or checklists.
CREATE POLICY "mechanic read driver context"
ON public.profiles FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'mechanic'::app_role)
  AND (
    EXISTS (SELECT 1 FROM public.maintenance_orders mo WHERE mo.driver_id = profiles.id)
    OR EXISTS (SELECT 1 FROM public.checklists c WHERE c.driver_id = profiles.id)
  )
);

-- 4) Restrict execution of internal/trigger SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_order_number(text) FROM PUBLIC, anon;

-- 5) Add admin gate inside next_order_number for defense-in-depth
CREATE OR REPLACE FUNCTION public.next_order_number(_base text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  n INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.maintenance_order_counters(base_code, last_number)
  VALUES (_base, 1)
  ON CONFLICT (base_code) DO UPDATE SET last_number = public.maintenance_order_counters.last_number + 1
  RETURNING last_number INTO n;
  RETURN 'OS' || LPAD(n::text, 2, '0') || '_' || _base;
END;
$function$;
