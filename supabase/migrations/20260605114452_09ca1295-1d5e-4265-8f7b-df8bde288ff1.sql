
DO $$ BEGIN
  CREATE TYPE public.maintenance_photo_category AS ENUM ('falha','execucao','conclusao');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.maintenance_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.maintenance_orders(id) ON DELETE CASCADE,
  category public.maintenance_photo_category NOT NULL,
  storage_path text NOT NULL,
  caption text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS maintenance_photos_order_id_idx ON public.maintenance_photos(order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_photos TO authenticated;
GRANT ALL ON public.maintenance_photos TO service_role;

ALTER TABLE public.maintenance_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mp select" ON public.maintenance_photos;
CREATE POLICY "mp select" ON public.maintenance_photos
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'mechanic'::app_role)
    OR public.has_role(auth.uid(),'viewer'::app_role)
  );

DROP POLICY IF EXISTS "mp insert mechanic" ON public.maintenance_photos;
CREATE POLICY "mp insert mechanic" ON public.maintenance_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'mechanic'::app_role)
    OR public.has_role(auth.uid(),'admin'::app_role)
  );

DROP POLICY IF EXISTS "mp update mechanic" ON public.maintenance_photos;
CREATE POLICY "mp update mechanic" ON public.maintenance_photos
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'mechanic'::app_role)
    OR public.has_role(auth.uid(),'admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(),'mechanic'::app_role)
    OR public.has_role(auth.uid(),'admin'::app_role)
  );

DROP POLICY IF EXISTS "mp delete mechanic" ON public.maintenance_photos;
CREATE POLICY "mp delete mechanic" ON public.maintenance_photos
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(),'mechanic'::app_role)
    OR public.has_role(auth.uid(),'admin'::app_role)
  );

NOTIFY pgrst, 'reload schema';
