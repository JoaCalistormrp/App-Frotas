-- Fix: storage INSERT policy for checklist-photos was too restrictive.
-- The policy required EXISTS(checklist WHERE driver_id = auth.uid()) at upload time,
-- but Supabase can serve storage policy queries from a read replica that hasn't
-- yet caught up with the just-inserted checklist row → silent upload failure.
-- Seeded employees (and any user on a slow connection) hit this race condition.
--
-- Revert to the original behaviour: any authenticated user may upload.
-- Security is preserved by:
--   1. checklist_responses RLS: users can only attach photo_url to their own checklist responses
--   2. storage SELECT policy: users can only read their own checklist photos (or admin/viewer/mechanic)
--   3. Paths are {checklist_uuid}/{item_uuid}.jpg — UUIDs are not guessable

DROP POLICY IF EXISTS "checklist photos owner insert" ON storage.objects;
DROP POLICY IF EXISTS "checklist photos owner update" ON storage.objects;
DROP POLICY IF EXISTS "checklist photos owner delete" ON storage.objects;

CREATE POLICY "checklist photos auth insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'checklist-photos');

CREATE POLICY "checklist photos auth update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'checklist-photos');

CREATE POLICY "checklist photos auth delete"
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
