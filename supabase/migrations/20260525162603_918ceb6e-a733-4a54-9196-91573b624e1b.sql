
-- 1) Add new role enum values
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'mechanic';

-- 2) Extra SMI/SMV fields
ALTER TABLE public.maintenance_orders
  ADD COLUMN IF NOT EXISTS validade_oleo text,
  ADD COLUMN IF NOT EXISTS km_atual numeric,
  ADD COLUMN IF NOT EXISTS combustivel_chegada text,
  ADD COLUMN IF NOT EXISTS data_entrada date,
  ADD COLUMN IF NOT EXISTS hora_entrada time,
  ADD COLUMN IF NOT EXISTS data_saida date,
  ADD COLUMN IF NOT EXISTS hora_saida time,
  ADD COLUMN IF NOT EXISTS mod_carro text,
  ADD COLUMN IF NOT EXISTS maintenance_category text,
  ADD COLUMN IF NOT EXISTS solution_description text,
  ADD COLUMN IF NOT EXISTS items_replaced text;
