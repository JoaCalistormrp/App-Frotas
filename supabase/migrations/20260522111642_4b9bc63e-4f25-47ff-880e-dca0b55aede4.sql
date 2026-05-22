
-- Enums
DO $$ BEGIN
  CREATE TYPE public.vehicle_category AS ENUM ('pesado', 'operacional', 'administrativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.driver_function AS ENUM ('diretor', 'administrativo', 'encarregado', 'motorista');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.maintenance_type AS ENUM ('SMI', 'SMV');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.maintenance_status AS ENUM ('pendente', 'em_manutencao', 'solucionado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- vehicles: campos extras
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS year INTEGER,
  ADD COLUMN IF NOT EXISTS renavam TEXT,
  ADD COLUMN IF NOT EXISTS category public.vehicle_category,
  ADD COLUMN IF NOT EXISTS mileage NUMERIC,
  ADD COLUMN IF NOT EXISTS fuel_type TEXT,
  ADD COLUMN IF NOT EXISTS document_url TEXT;

-- profiles: campos extras
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS base TEXT,
  ADD COLUMN IF NOT EXISTS role_function public.driver_function DEFAULT 'motorista',
  ADD COLUMN IF NOT EXISTS unlock_card TEXT,
  ADD COLUMN IF NOT EXISTS cnh_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS cnh_renewal_history JSONB DEFAULT '[]'::jsonb;

-- checklist_responses: status de resolução
ALTER TABLE public.checklist_responses
  ADD COLUMN IF NOT EXISTS resolution_status public.maintenance_status DEFAULT 'pendente';

-- Tabela maintenance_orders (SMV/SMI)
CREATE TABLE IF NOT EXISTS public.maintenance_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  order_type public.maintenance_type NOT NULL,
  base_code TEXT NOT NULL,
  checklist_id UUID,
  response_id UUID,
  vehicle_id UUID,
  driver_id UUID,
  failure_description TEXT,
  service_type TEXT,
  workshop TEXT,
  status public.maintenance_status NOT NULL DEFAULT 'pendente',
  observations TEXT,
  mechanic_signature_url TEXT,
  responsible_signature_url TEXT,
  signed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.maintenance_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mo admin all" ON public.maintenance_orders;
CREATE POLICY "mo admin all" ON public.maintenance_orders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "mo own read" ON public.maintenance_orders;
CREATE POLICY "mo own read" ON public.maintenance_orders
  FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR created_by = auth.uid());

CREATE TRIGGER mo_updated_at BEFORE UPDATE ON public.maintenance_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Sequência por base para gerar order_number
CREATE TABLE IF NOT EXISTS public.maintenance_order_counters (
  base_code TEXT PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.maintenance_order_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "moc admin" ON public.maintenance_order_counters;
CREATE POLICY "moc admin" ON public.maintenance_order_counters FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.next_order_number(_base TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n INTEGER;
BEGIN
  INSERT INTO public.maintenance_order_counters(base_code, last_number)
  VALUES (_base, 1)
  ON CONFLICT (base_code) DO UPDATE SET last_number = public.maintenance_order_counters.last_number + 1
  RETURNING last_number INTO n;
  RETURN 'OS' || LPAD(n::text, 2, '0') || '_' || _base;
END;
$$;

-- Buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('vehicle-docs', 'vehicle-docs', false)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('maintenance-signatures', 'maintenance-signatures', false)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "vehicle-docs admin all" ON storage.objects;
CREATE POLICY "vehicle-docs admin all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'vehicle-docs' AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id = 'vehicle-docs' AND public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "maintenance-signatures admin all" ON storage.objects;
CREATE POLICY "maintenance-signatures admin all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'maintenance-signatures' AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id = 'maintenance-signatures' AND public.has_role(auth.uid(),'admin'));
