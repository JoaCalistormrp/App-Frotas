-- Allow multiple financial links per OS (remove unique constraint)
ALTER TABLE maintenance_financial_links
  DROP CONSTRAINT maintenance_financial_links_maintenance_order_id_key;

-- Track when all links for an OS are finalized
CREATE TABLE IF NOT EXISTS maintenance_os_link_finalized (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_order_id UUID UNIQUE NOT NULL REFERENCES maintenance_orders(id) ON DELETE CASCADE,
  finalized_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_by         UUID REFERENCES auth.users(id)
);

ALTER TABLE maintenance_os_link_finalized ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finalized_admin_master_all"
  ON maintenance_os_link_finalized
  FOR ALL TO authenticated
  USING  (public.has_admin_or_master(auth.uid()))
  WITH CHECK (public.has_admin_or_master(auth.uid()));

CREATE INDEX ON maintenance_os_link_finalized (maintenance_order_id);

NOTIFY pgrst, 'reload schema';
