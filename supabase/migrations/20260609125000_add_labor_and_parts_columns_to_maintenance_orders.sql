-- Ensure maintenance_orders has all labor and parts cost fields required by the app
ALTER TABLE public.maintenance_orders
  ADD COLUMN IF NOT EXISTS labor_description TEXT,
  ADD COLUMN IF NOT EXISTS labor_hours NUMERIC,
  ADD COLUMN IF NOT EXISTS labor_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS parts_needed TEXT,
  ADD COLUMN IF NOT EXISTS parts_supplier TEXT,
  ADD COLUMN IF NOT EXISTS parts_cost NUMERIC;

NOTIFY pgrst, 'reload schema';
