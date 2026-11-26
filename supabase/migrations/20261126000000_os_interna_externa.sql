-- OS interna (mecânico <-> Frotas ADM, oficina Grupo Tomaz) e OS externa (só registro + OS da oficina).
-- order_type: SMI = interna, SMV = externa.

ALTER TABLE public.maintenance_orders
  ADD COLUMN IF NOT EXISTS previsao_saida    date,
  ADD COLUMN IF NOT EXISTS part_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS part_requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS part_purchase_due date,
  ADD COLUMN IF NOT EXISTS part_arrival_due  date,
  ADD COLUMN IF NOT EXISTS part_decided_at   timestamptz,
  ADD COLUMN IF NOT EXISTS part_decided_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS part_arrived_at   timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason     text,
  ADD COLUMN IF NOT EXISTS valor_total       numeric;

-- Mecânico (permissão frotas.os_mecanico): lê, abre e atualiza apenas OS internas; não exclui
CREATE POLICY "mec os interna select" ON public.maintenance_orders FOR SELECT TO authenticated
  USING (order_type = 'SMI' AND public.has_module_access(auth.uid(), ARRAY['frotas.os_mecanico']));
CREATE POLICY "mec os interna insert" ON public.maintenance_orders FOR INSERT TO authenticated
  WITH CHECK (order_type = 'SMI' AND public.has_module_access(auth.uid(), ARRAY['frotas.os_mecanico']));
CREATE POLICY "mec os interna update" ON public.maintenance_orders FOR UPDATE TO authenticated
  USING (order_type = 'SMI' AND public.has_module_access(auth.uid(), ARRAY['frotas.os_mecanico']))
  WITH CHECK (order_type = 'SMI' AND public.has_module_access(auth.uid(), ARRAY['frotas.os_mecanico']));

CREATE POLICY "mec evo select" ON public.maintenance_evolutions FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(), ARRAY['frotas.os_mecanico'])
    AND EXISTS (SELECT 1 FROM public.maintenance_orders mo WHERE mo.id = order_id AND mo.order_type = 'SMI'));
CREATE POLICY "mec evo insert" ON public.maintenance_evolutions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.has_module_access(auth.uid(), ARRAY['frotas.os_mecanico'])
    AND EXISTS (SELECT 1 FROM public.maintenance_orders mo WHERE mo.id = order_id AND mo.order_type = 'SMI'));

CREATE POLICY "mec mp select" ON public.maintenance_photos FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(), ARRAY['frotas.os_mecanico'])
    AND EXISTS (SELECT 1 FROM public.maintenance_orders mo WHERE mo.id = order_id AND mo.order_type = 'SMI'));
CREATE POLICY "mec mp insert" ON public.maintenance_photos FOR INSERT TO authenticated
  WITH CHECK (public.has_module_access(auth.uid(), ARRAY['frotas.os_mecanico'])
    AND EXISTS (SELECT 1 FROM public.maintenance_orders mo WHERE mo.id = order_id AND mo.order_type = 'SMI'));
CREATE POLICY "mec mp delete own" ON public.maintenance_photos FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() AND public.has_module_access(auth.uid(), ARRAY['frotas.os_mecanico']));

-- Abrir OS a partir de checklist com falha: leitura dos checklists e respostas
CREATE POLICY "mec checklists read" ON public.checklists FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(), ARRAY['frotas.os_mecanico']));
CREATE POLICY "mec responses read" ON public.checklist_responses FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(), ARRAY['frotas.os_mecanico']));
CREATE POLICY "mec items read" ON public.checklist_items FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(), ARRAY['frotas.os_mecanico']));

-- Regras de negócio que a tela não pode garantir sozinha
CREATE OR REPLACE FUNCTION public.guard_maintenance_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  gestor boolean;
BEGIN
  IF NEW.order_type = 'SMI' THEN
    NEW.workshop := 'Grupo Tomaz';
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service role / funções do servidor
  END IF;

  gestor := public.has_admin_or_master(auth.uid())
    OR public.has_module_access(auth.uid(), ARRAY['frotas', 'frotas.manutencao']);
  IF gestor THEN
    RETURN NEW;
  END IF;

  IF NEW.order_type <> 'SMI' THEN
    RAISE EXCEPTION 'O mecânico só trabalha com OS interna.';
  END IF;
  IF NEW.status = 'cancelada' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'cancelada') THEN
    RAISE EXCEPTION 'Somente o Frotas ADM pode cancelar uma OS.';
  END IF;
  IF TG_OP = 'UPDATE' AND (
       NEW.part_purchase_due IS DISTINCT FROM OLD.part_purchase_due
    OR NEW.part_arrival_due  IS DISTINCT FROM OLD.part_arrival_due
    OR NEW.part_decided_at   IS DISTINCT FROM OLD.part_decided_at
    OR NEW.part_decided_by   IS DISTINCT FROM OLD.part_decided_by
  ) THEN
    RAISE EXCEPTION 'Somente o Frotas ADM responde pedidos de peça.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maintenance_order_guard ON public.maintenance_orders;
CREATE TRIGGER maintenance_order_guard
  BEFORE INSERT OR UPDATE ON public.maintenance_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_maintenance_order();

-- KM informado na OS atualiza o veículo (só para frente)
CREATE OR REPLACE FUNCTION public.sync_vehicle_mileage_from_os()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.vehicle_id IS NOT NULL AND NEW.km_atual IS NOT NULL THEN
    UPDATE public.vehicles
       SET mileage = NEW.km_atual
     WHERE id = NEW.vehicle_id
       AND (mileage IS NULL OR mileage < NEW.km_atual);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_vehicle_mileage_from_os() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS maintenance_order_km_sync ON public.maintenance_orders;
CREATE TRIGGER maintenance_order_km_sync
  AFTER INSERT OR UPDATE OF km_atual ON public.maintenance_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_vehicle_mileage_from_os();

NOTIFY pgrst, 'reload schema';
