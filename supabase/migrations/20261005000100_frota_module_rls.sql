-- Acesso às tabelas de frota também por grant de módulo (user_module_access).
-- Políticas permissivas somam-se (OR) às existentes: só ampliam acesso a quem
-- tem o módulo atribuído; nenhum perfil atual perde permissões.

CREATE OR REPLACE FUNCTION public.has_module_access(_user_id uuid, _slugs text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_module_access
    WHERE user_id = _user_id AND module_slug = ANY (_slugs)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_module_access(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_module_access(uuid, text[]) TO authenticated;

CREATE POLICY "mod vehicles frotas" ON public.vehicles FOR ALL TO authenticated
  USING (public.has_module_access(auth.uid(), ARRAY['frotas', 'frotas.veiculos']))
  WITH CHECK (public.has_module_access(auth.uid(), ARRAY['frotas', 'frotas.veiculos']));

CREATE POLICY "mod mo frotas" ON public.maintenance_orders FOR ALL TO authenticated
  USING (public.has_module_access(auth.uid(), ARRAY['frotas', 'frotas.manutencao']))
  WITH CHECK (public.has_module_access(auth.uid(), ARRAY['frotas', 'frotas.manutencao']));

CREATE POLICY "mod moc frotas" ON public.maintenance_order_counters FOR ALL TO authenticated
  USING (public.has_module_access(auth.uid(), ARRAY['frotas', 'frotas.manutencao']))
  WITH CHECK (public.has_module_access(auth.uid(), ARRAY['frotas', 'frotas.manutencao']));

CREATE POLICY "mod mp frotas" ON public.maintenance_photos FOR ALL TO authenticated
  USING (public.has_module_access(auth.uid(), ARRAY['frotas', 'frotas.manutencao']))
  WITH CHECK (public.has_module_access(auth.uid(), ARRAY['frotas', 'frotas.manutencao']));

CREATE POLICY "mod evo frotas" ON public.maintenance_evolutions FOR ALL TO authenticated
  USING (public.has_module_access(auth.uid(), ARRAY['frotas', 'frotas.manutencao']))
  WITH CHECK (public.has_module_access(auth.uid(), ARRAY['frotas', 'frotas.manutencao']));

CREATE POLICY "mod checklists frotas" ON public.checklists FOR ALL TO authenticated
  USING (public.has_module_access(auth.uid(), ARRAY['frotas', 'frotas.checklists', 'frotas.checklist_new']))
  WITH CHECK (public.has_module_access(auth.uid(), ARRAY['frotas', 'frotas.checklists', 'frotas.checklist_new']));

CREATE POLICY "mod responses frotas" ON public.checklist_responses FOR ALL TO authenticated
  USING (public.has_module_access(auth.uid(), ARRAY['frotas', 'frotas.checklists', 'frotas.checklist_new']))
  WITH CHECK (public.has_module_access(auth.uid(), ARRAY['frotas', 'frotas.checklists', 'frotas.checklist_new']));

CREATE POLICY "mod tpl frotas read" ON public.checklist_templates FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(), ARRAY['frotas', 'frotas.checklists', 'frotas.checklist_new']));

CREATE POLICY "mod cat frotas read" ON public.checklist_categories FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(), ARRAY['frotas', 'frotas.checklists', 'frotas.checklist_new']));

CREATE POLICY "mod item frotas read" ON public.checklist_items FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(), ARRAY['frotas', 'frotas.checklists', 'frotas.checklist_new']));

CREATE POLICY "mod profiles motoristas read" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(), ARRAY['frotas', 'frotas.motoristas']));

NOTIFY pgrst, 'reload schema';
