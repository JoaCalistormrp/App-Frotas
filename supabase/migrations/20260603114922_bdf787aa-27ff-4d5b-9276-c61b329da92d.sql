
-- Limpa eventuais vehicle_id órfãos antes de criar a FK
UPDATE public.maintenance_orders mo
SET vehicle_id = NULL
WHERE vehicle_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = mo.vehicle_id);

UPDATE public.maintenance_orders mo
SET driver_id = NULL
WHERE driver_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = mo.driver_id);

UPDATE public.maintenance_orders mo
SET checklist_id = NULL
WHERE checklist_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.checklists c WHERE c.id = mo.checklist_id);

UPDATE public.maintenance_orders mo
SET response_id = NULL
WHERE response_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.checklist_responses r WHERE r.id = mo.response_id);

UPDATE public.maintenance_orders mo
SET created_by = NULL
WHERE created_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = mo.created_by);

ALTER TABLE public.maintenance_orders
  ADD CONSTRAINT maintenance_orders_vehicle_id_fkey
    FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL,
  ADD CONSTRAINT maintenance_orders_driver_id_fkey
    FOREIGN KEY (driver_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT maintenance_orders_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT maintenance_orders_checklist_id_fkey
    FOREIGN KEY (checklist_id) REFERENCES public.checklists(id) ON DELETE SET NULL,
  ADD CONSTRAINT maintenance_orders_response_id_fkey
    FOREIGN KEY (response_id) REFERENCES public.checklist_responses(id) ON DELETE SET NULL;

-- Relacionamentos úteis também para checklists / responses
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='checklists_vehicle_id_fkey') THEN
    ALTER TABLE public.checklists
      ADD CONSTRAINT checklists_vehicle_id_fkey
      FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='checklists_driver_id_fkey') THEN
    ALTER TABLE public.checklists
      ADD CONSTRAINT checklists_driver_id_fkey
      FOREIGN KEY (driver_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='checklist_responses_checklist_id_fkey') THEN
    ALTER TABLE public.checklist_responses
      ADD CONSTRAINT checklist_responses_checklist_id_fkey
      FOREIGN KEY (checklist_id) REFERENCES public.checklists(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='checklist_responses_item_id_fkey') THEN
    ALTER TABLE public.checklist_responses
      ADD CONSTRAINT checklist_responses_item_id_fkey
      FOREIGN KEY (item_id) REFERENCES public.checklist_items(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Índices para performance dos joins
CREATE INDEX IF NOT EXISTS idx_mo_vehicle_id ON public.maintenance_orders(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_mo_driver_id ON public.maintenance_orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_mo_checklist_id ON public.maintenance_orders(checklist_id);
CREATE INDEX IF NOT EXISTS idx_checklists_vehicle_id ON public.checklists(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_checklists_driver_id ON public.checklists(driver_id);

-- Força o PostgREST a recarregar o schema cache
NOTIFY pgrst, 'reload schema';
