-- Ensure the final_observation column exists in maintenance_orders
ALTER TABLE public.maintenance_orders
  ADD COLUMN IF NOT EXISTS final_observation TEXT;

NOTIFY pgrst, 'reload schema';
