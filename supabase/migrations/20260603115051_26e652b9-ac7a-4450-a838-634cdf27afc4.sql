
-- 1. Expand maintenance_status enum (keep existing values for compatibility)
ALTER TYPE public.maintenance_status ADD VALUE IF NOT EXISTS 'aberta';
ALTER TYPE public.maintenance_status ADD VALUE IF NOT EXISTS 'em_analise';
ALTER TYPE public.maintenance_status ADD VALUE IF NOT EXISTS 'orcando_mao_obra';
ALTER TYPE public.maintenance_status ADD VALUE IF NOT EXISTS 'orcando_pecas';
ALTER TYPE public.maintenance_status ADD VALUE IF NOT EXISTS 'aguardando_aprovacao';
ALTER TYPE public.maintenance_status ADD VALUE IF NOT EXISTS 'aguardando_pecas';
ALTER TYPE public.maintenance_status ADD VALUE IF NOT EXISTS 'em_execucao';
ALTER TYPE public.maintenance_status ADD VALUE IF NOT EXISTS 'teste_final';
ALTER TYPE public.maintenance_status ADD VALUE IF NOT EXISTS 'finalizada';
ALTER TYPE public.maintenance_status ADD VALUE IF NOT EXISTS 'cancelada';

-- 2. Budget fields on maintenance_orders
ALTER TABLE public.maintenance_orders
  ADD COLUMN IF NOT EXISTS labor_description TEXT,
  ADD COLUMN IF NOT EXISTS labor_hours NUMERIC,
  ADD COLUMN IF NOT EXISTS labor_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS parts_needed TEXT,
  ADD COLUMN IF NOT EXISTS parts_supplier TEXT,
  ADD COLUMN IF NOT EXISTS parts_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS final_observation TEXT;

-- 3. Evolution log table
CREATE TABLE IF NOT EXISTS public.maintenance_evolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.maintenance_orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status public.maintenance_status,
  observation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.maintenance_evolutions TO authenticated;
GRANT ALL ON public.maintenance_evolutions TO service_role;

ALTER TABLE public.maintenance_evolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evo read auth"
  ON public.maintenance_evolutions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "evo insert mech admin"
  ON public.maintenance_evolutions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'mechanic'::app_role))
  );

CREATE INDEX IF NOT EXISTS idx_evo_order_id ON public.maintenance_evolutions(order_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
