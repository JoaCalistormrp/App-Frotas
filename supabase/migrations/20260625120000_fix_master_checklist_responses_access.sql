-- Fix: master role was added in 20260609130000 but checklist_responses
-- and checklist-photos storage policies were never updated to include it.
-- master users could see the checklists list but got zero rows for responses
-- (descriptions, photos) because the original policy still uses has_role('admin').

-- ── checklist_responses ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "resp select" ON public.checklist_responses;
DROP POLICY IF EXISTS "resp update" ON public.checklist_responses;
DROP POLICY IF EXISTS "resp delete" ON public.checklist_responses;

CREATE POLICY "resp select" ON public.checklist_responses
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id = checklist_id
        AND (c.driver_id = auth.uid() OR public.has_admin_or_master(auth.uid()))
    )
  );

CREATE POLICY "resp update" ON public.checklist_responses
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id = checklist_id
        AND (c.driver_id = auth.uid() OR public.has_admin_or_master(auth.uid()))
    )
  );

CREATE POLICY "resp delete" ON public.checklist_responses
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id = checklist_id
        AND (c.driver_id = auth.uid() OR public.has_admin_or_master(auth.uid()))
    )
  );

-- ── storage: checklist-photos ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "checklist photos scoped read" ON storage.objects;
DROP POLICY IF EXISTS "checklist photos owner insert" ON storage.objects;
DROP POLICY IF EXISTS "checklist photos owner update" ON storage.objects;
DROP POLICY IF EXISTS "checklist photos owner delete" ON storage.objects;

CREATE POLICY "checklist photos scoped read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'checklist-photos'
    AND (
      public.has_admin_or_master(auth.uid())
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
      public.has_admin_or_master(auth.uid())
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
      public.has_admin_or_master(auth.uid())
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
      public.has_admin_or_master(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.checklists c
        WHERE c.id::text = (storage.foldername(name))[1]
          AND c.driver_id = auth.uid()
      )
    )
  );

NOTIFY pgrst, 'reload schema';
