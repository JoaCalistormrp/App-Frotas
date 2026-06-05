
ALTER TABLE public.maintenance_orders
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason text;

CREATE INDEX IF NOT EXISTS maintenance_orders_deleted_at_idx ON public.maintenance_orders(deleted_at);

-- Reescreve policies SELECT para esconder ordens excluídas dos perfis não-admin
DROP POLICY IF EXISTS "mechanic read maintenance" ON public.maintenance_orders;
CREATE POLICY "mechanic read maintenance" ON public.maintenance_orders
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'mechanic'::app_role) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "viewer read maintenance" ON public.maintenance_orders;
CREATE POLICY "viewer read maintenance" ON public.maintenance_orders
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'viewer'::app_role) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "mo own read" ON public.maintenance_orders;
CREATE POLICY "mo own read" ON public.maintenance_orders
  FOR SELECT TO authenticated
  USING ((driver_id = auth.uid() OR created_by = auth.uid()) AND deleted_at IS NULL);

-- mechanic só pode atualizar OSs não excluídas
DROP POLICY IF EXISTS "mechanic update maintenance" ON public.maintenance_orders;
CREATE POLICY "mechanic update maintenance" ON public.maintenance_orders
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'mechanic'::app_role) AND deleted_at IS NULL)
  WITH CHECK (public.has_role(auth.uid(),'mechanic'::app_role) AND deleted_at IS NULL);

NOTIFY pgrst, 'reload schema';
