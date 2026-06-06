
-- 1. Remove mechanic direct insert/select on counter table (use SECURITY DEFINER function only)
DROP POLICY IF EXISTS "moc mechanic insert" ON public.maintenance_order_counters;
DROP POLICY IF EXISTS "moc mechanic select" ON public.maintenance_order_counters;

-- 2. Restrict maintenance_evolutions reads
DROP POLICY IF EXISTS "evo read auth" ON public.maintenance_evolutions;

CREATE POLICY "evo read scoped"
ON public.maintenance_evolutions
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'mechanic'::app_role)
  OR public.has_role(auth.uid(), 'viewer'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.maintenance_orders mo
    WHERE mo.id = maintenance_evolutions.order_id
      AND (mo.driver_id = auth.uid() OR mo.created_by = auth.uid())
  )
);

NOTIFY pgrst, 'reload schema';
