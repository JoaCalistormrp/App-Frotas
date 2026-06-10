-- Ensure the maintenance_orders -> vehicles relationship exists in the new database
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'maintenance_orders_vehicle_id_fkey'
  ) THEN
    ALTER TABLE public.maintenance_orders
      ADD CONSTRAINT maintenance_orders_vehicle_id_fkey
      FOREIGN KEY (vehicle_id)
      REFERENCES public.vehicles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Reload PostgREST schema cache so the relationship is available to API queries
NOTIFY pgrst, 'reload schema';
