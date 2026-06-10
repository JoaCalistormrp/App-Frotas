-- Allow mechanics to insert new maintenance_orders rows under RLS
ALTER TABLE public.maintenance_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mechanic insert maintenance" ON public.maintenance_orders;
CREATE POLICY "mechanic insert maintenance" ON public.maintenance_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'mechanic'::app_role)
    AND created_by = auth.uid()
    AND deleted_at IS NULL
  );

NOTIFY pgrst, 'reload schema';
