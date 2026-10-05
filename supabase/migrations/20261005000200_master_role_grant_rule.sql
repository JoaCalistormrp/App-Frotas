-- Só master pode conceder o perfil master; admin/master podem remover master.
-- Substitui "roles admin all" (FOR ALL) por políticas separadas por operação.

DROP POLICY IF EXISTS "roles admin all" ON public.user_roles;

CREATE POLICY "roles admin select" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_admin_or_master(auth.uid()));

CREATE POLICY "roles admin delete" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_admin_or_master(auth.uid()));

CREATE POLICY "roles admin insert" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_admin_or_master(auth.uid())
    AND (role <> 'master' OR public.has_role(auth.uid(), 'master'))
  );

CREATE POLICY "roles admin update" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_admin_or_master(auth.uid()))
  WITH CHECK (
    public.has_admin_or_master(auth.uid())
    AND (role <> 'master' OR public.has_role(auth.uid(), 'master'))
  );

NOTIFY pgrst, 'reload schema';
