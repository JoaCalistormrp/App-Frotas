-- Add master role, approval metadata, and master/admin access semantics
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'master';

CREATE OR REPLACE FUNCTION public.has_admin_or_master(_user_id uuid)
RETURNS boolean LANGUAGE sql AS $$
  SELECT public.has_role(_user_id, 'admin')
    OR public.has_role(_user_id, 'master');
$$;

CREATE OR REPLACE FUNCTION public.is_master_user(_user_id uuid)
RETURNS boolean LANGUAGE sql AS $$
  SELECT public.has_role(_user_id, 'master');
$$;

ALTER TABLE public.maintenance_orders
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Profiles
DROP POLICY IF EXISTS "profiles self select" ON public.profiles;
DROP POLICY IF EXISTS "profiles self update" ON public.profiles;
DROP POLICY IF EXISTS "profiles admin insert" ON public.profiles;
CREATE POLICY "profiles self select" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_admin_or_master(auth.uid()));
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.has_admin_or_master(auth.uid()));
CREATE POLICY "profiles admin insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid() OR public.has_admin_or_master(auth.uid()));

-- User roles
DROP POLICY IF EXISTS "roles admin all" ON public.user_roles;
CREATE POLICY "roles admin all" ON public.user_roles FOR ALL TO authenticated USING (public.has_admin_or_master(auth.uid())) WITH CHECK (public.has_admin_or_master(auth.uid()));

-- Vehicles
DROP POLICY IF EXISTS "vehicles admin all" ON public.vehicles;
CREATE POLICY "vehicles admin all" ON public.vehicles FOR ALL TO authenticated USING (public.has_admin_or_master(auth.uid())) WITH CHECK (public.has_admin_or_master(auth.uid()));

-- Checklist templates
DROP POLICY IF EXISTS "tpl admin all" ON public.checklist_templates;
CREATE POLICY "tpl admin all" ON public.checklist_templates FOR ALL TO authenticated USING (public.has_admin_or_master(auth.uid())) WITH CHECK (public.has_admin_or_master(auth.uid()));

-- Checklist categories
DROP POLICY IF EXISTS "cat admin all" ON public.checklist_categories;
CREATE POLICY "cat admin all" ON public.checklist_categories FOR ALL TO authenticated USING (public.has_admin_or_master(auth.uid())) WITH CHECK (public.has_admin_or_master(auth.uid()));

-- Checklist items
DROP POLICY IF EXISTS "item admin all" ON public.checklist_items;
CREATE POLICY "item admin all" ON public.checklist_items FOR ALL TO authenticated USING (public.has_admin_or_master(auth.uid())) WITH CHECK (public.has_admin_or_master(auth.uid()));

-- Checklists
DROP POLICY IF EXISTS "checklists own select" ON public.checklists;
DROP POLICY IF EXISTS "checklists own update" ON public.checklists;
DROP POLICY IF EXISTS "checklists admin delete" ON public.checklists;
CREATE POLICY "checklists own select" ON public.checklists FOR SELECT TO authenticated USING (driver_id = auth.uid() OR public.has_admin_or_master(auth.uid()));
CREATE POLICY "checklists own update" ON public.checklists FOR UPDATE TO authenticated USING (driver_id = auth.uid() OR public.has_admin_or_master(auth.uid())) WITH CHECK (driver_id = auth.uid() OR public.has_admin_or_master(auth.uid()));
CREATE POLICY "checklists admin delete" ON public.checklists FOR DELETE TO authenticated USING (public.has_admin_or_master(auth.uid()));

-- Maintenance orders
DROP POLICY IF EXISTS "mo admin all" ON public.maintenance_orders;
CREATE POLICY "mo admin all" ON public.maintenance_orders FOR ALL TO authenticated USING (public.has_admin_or_master(auth.uid())) WITH CHECK (public.has_admin_or_master(auth.uid()));

-- Maintenance order counters
DROP POLICY IF EXISTS "moc admin" ON public.maintenance_order_counters;
CREATE POLICY "moc admin" ON public.maintenance_order_counters FOR ALL TO authenticated USING (public.has_admin_or_master(auth.uid())) WITH CHECK (public.has_admin_or_master(auth.uid()));

-- Storage: driver docs, vehicle docs, maintenance signatures
DROP POLICY IF EXISTS "driver-docs admin all" ON storage.objects;
CREATE POLICY "driver-docs admin all" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'driver-docs' AND public.has_admin_or_master(auth.uid())) WITH CHECK (bucket_id = 'driver-docs' AND public.has_admin_or_master(auth.uid()));

DROP POLICY IF EXISTS "vehicle-docs admin all" ON storage.objects;
CREATE POLICY "vehicle-docs admin all" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'vehicle-docs' AND public.has_admin_or_master(auth.uid())) WITH CHECK (bucket_id = 'vehicle-docs' AND public.has_admin_or_master(auth.uid()));

DROP POLICY IF EXISTS "maintenance-signatures admin all" ON storage.objects;
CREATE POLICY "maintenance-signatures admin all" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'maintenance-signatures' AND public.has_admin_or_master(auth.uid())) WITH CHECK (bucket_id = 'maintenance-signatures' AND public.has_admin_or_master(auth.uid()));

-- Maintenance photos admin/master access
DROP POLICY IF EXISTS "mp insert mechanic" ON public.maintenance_photos;
DROP POLICY IF EXISTS "mp update mechanic" ON public.maintenance_photos;
DROP POLICY IF EXISTS "mp delete mechanic" ON public.maintenance_photos;
CREATE POLICY "mp insert mechanic" ON public.maintenance_photos FOR INSERT TO authenticated WITH CHECK (
  order_id IS NOT NULL
  AND (public.has_role(auth.uid(), 'mechanic'::app_role) OR public.has_admin_or_master(auth.uid()))
);
CREATE POLICY "mp update mechanic" ON public.maintenance_photos FOR UPDATE TO authenticated USING (
  order_id IS NOT NULL
  AND (public.has_role(auth.uid(), 'mechanic'::app_role) OR public.has_admin_or_master(auth.uid()))
);
CREATE POLICY "mp delete mechanic" ON public.maintenance_photos FOR DELETE TO authenticated USING (
  order_id IS NOT NULL
  AND (public.has_role(auth.uid(), 'mechanic'::app_role) OR public.has_admin_or_master(auth.uid()))
);

-- Maintenance evolutions access
DROP POLICY IF EXISTS "evo read scoped" ON public.maintenance_evolutions;
DROP POLICY IF EXISTS "evo insert mech admin" ON public.maintenance_evolutions;
CREATE POLICY "evo read scoped" ON public.maintenance_evolutions FOR SELECT TO authenticated USING (
  public.has_admin_or_master(auth.uid())
  OR public.has_role(auth.uid(), 'mechanic'::app_role)
  OR public.has_role(auth.uid(), 'viewer'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.maintenance_orders mo
    WHERE mo.id = maintenance_evolutions.order_id
      AND (mo.driver_id = auth.uid() OR mo.created_by = auth.uid())
  )
);
CREATE POLICY "evo insert mech admin" ON public.maintenance_evolutions FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'mechanic'::app_role)
    OR public.has_admin_or_master(auth.uid())
  )
);

NOTIFY pgrst, 'reload schema';
