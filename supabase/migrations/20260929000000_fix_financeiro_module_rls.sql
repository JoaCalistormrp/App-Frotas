-- SECURITY FIX: maintenance_financial_links / maintenance_os_link_finalized
-- PROBLEMA: RLS só exigia role admin/master, sem checar o grant do módulo
-- "financeiro" em user_module_access — inconsistente com a UI e com
-- queryOracleFinancial (src/lib/oracle.server.ts), que exigem esse grant.
-- Um admin/master sem o módulo financeiro atribuído conseguia inserir
-- documentos financeiros falsos e finalizar OS via API direta, sem nunca
-- passar pela consulta real ao Oracle.
-- CORREÇÃO: exigir sempre o grant explícito do módulo "financeiro".

DROP POLICY IF EXISTS "fin_links admin_master all" ON public.maintenance_financial_links;
DROP POLICY IF EXISTS "fin_links viewer read"       ON public.maintenance_financial_links;

CREATE POLICY "fin_links financeiro_module_all" ON public.maintenance_financial_links
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_module_access
            WHERE user_id = auth.uid() AND module_slug = 'financeiro')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_module_access
            WHERE user_id = auth.uid() AND module_slug = 'financeiro')
  );

DROP POLICY IF EXISTS "finalized_admin_master_all" ON public.maintenance_os_link_finalized;

CREATE POLICY "finalized_financeiro_module_all" ON public.maintenance_os_link_finalized
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_module_access
            WHERE user_id = auth.uid() AND module_slug = 'financeiro')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_module_access
            WHERE user_id = auth.uid() AND module_slug = 'financeiro')
  );

NOTIFY pgrst, 'reload schema';
