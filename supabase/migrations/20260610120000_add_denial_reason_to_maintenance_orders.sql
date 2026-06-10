-- Add denial reason to maintenance orders for Master rejection flow
ALTER TABLE public.maintenance_orders
  ADD COLUMN IF NOT EXISTS denial_reason text;

NOTIFY pgrst, 'reload schema';
