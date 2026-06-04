
-- RLS policies for maintenance-photos bucket
CREATE POLICY "mp mechanic upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'maintenance-photos' AND public.has_role(auth.uid(), 'mechanic'::app_role));

CREATE POLICY "mp mechanic update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'maintenance-photos' AND public.has_role(auth.uid(), 'mechanic'::app_role));

CREATE POLICY "mp mechanic delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'maintenance-photos' AND public.has_role(auth.uid(), 'mechanic'::app_role));

CREATE POLICY "mp scoped read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'maintenance-photos' AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'mechanic'::app_role)
      OR public.has_role(auth.uid(), 'viewer'::app_role)
    )
  );
