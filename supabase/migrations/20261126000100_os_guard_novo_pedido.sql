-- Num novo pedido de peça o mecânico zera a resposta anterior; ele só não pode preencher prazos.
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
    RETURN NEW;
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
  IF (NEW.part_purchase_due IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.part_purchase_due IS DISTINCT FROM OLD.part_purchase_due))
  OR (NEW.part_arrival_due  IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.part_arrival_due  IS DISTINCT FROM OLD.part_arrival_due))
  OR (NEW.part_decided_at   IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.part_decided_at   IS DISTINCT FROM OLD.part_decided_at))
  OR (NEW.part_decided_by   IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.part_decided_by   IS DISTINCT FROM OLD.part_decided_by)) THEN
    RAISE EXCEPTION 'Somente o Frotas ADM responde pedidos de peça.';
  END IF;
  RETURN NEW;
END;
$$;
