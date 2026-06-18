-- Table: links between approved maintenance orders and ERP financial documents

CREATE TABLE public.maintenance_financial_links (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_order_id uuid NOT NULL REFERENCES public.maintenance_orders(id) ON DELETE CASCADE,
  documento            text NOT NULL,
  ap                   text NOT NULL,
  valor                numeric,
  linked_at            timestamptz NOT NULL DEFAULT now(),
  linked_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (maintenance_order_id)
);

ALTER TABLE public.maintenance_financial_links ENABLE ROW LEVEL SECURITY;

-- Admin and Master can manage
CREATE POLICY "fin_links admin_master all" ON public.maintenance_financial_links
  FOR ALL TO authenticated
  USING  (public.has_admin_or_master(auth.uid()))
  WITH CHECK (public.has_admin_or_master(auth.uid()));

-- Viewer read-only
CREATE POLICY "fin_links viewer read" ON public.maintenance_financial_links
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'viewer'::app_role));

CREATE INDEX ON public.maintenance_financial_links (maintenance_order_id);

NOTIFY pgrst, 'reload schema';
