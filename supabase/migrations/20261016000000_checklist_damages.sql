-- Etapa "Dano no Veículo" no checklist: lista de danos (amassados, riscos, etc.),
-- opcional, com vários registos por checklist. Fotos reaproveitam o bucket
-- "checklist-photos" já existente, em {checklist_id}/damage-{id}.jpg.

CREATE TABLE public.checklist_damages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id  uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  damage_type   text NOT NULL CHECK (damage_type IN ('amassado', 'risco', 'trinca', 'outro')),
  location      text,
  description   text,
  photo_url     text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.checklist_damages (checklist_id);

ALTER TABLE public.checklist_damages ENABLE ROW LEVEL SECURITY;

-- Dono do checklist (motorista que o fez) gere os seus próprios danos
CREATE POLICY "damages owner all" ON public.checklist_damages
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.checklists c WHERE c.id = checklist_id AND c.driver_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.checklists c WHERE c.id = checklist_id AND c.driver_id = auth.uid())
  );

-- Admin/master têm sempre acesso total, igual a checklist_responses
CREATE POLICY "damages admin all" ON public.checklist_damages
  FOR ALL TO authenticated
  USING (public.has_admin_or_master(auth.uid()))
  WITH CHECK (public.has_admin_or_master(auth.uid()));

-- Mecânico e consulta só leem, igual a checklist_responses
CREATE POLICY "damages read roles" ON public.checklist_damages
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'mechanic'::app_role) OR public.has_role(auth.uid(), 'viewer'::app_role));

-- Geral com módulo de checklist, igual ao padrão já usado em checklist_responses
CREATE POLICY "damages module frotas" ON public.checklist_damages
  FOR ALL TO authenticated
  USING (public.has_module_access(auth.uid(), ARRAY['frotas', 'frotas.checklists', 'frotas.checklist_new']))
  WITH CHECK (public.has_module_access(auth.uid(), ARRAY['frotas', 'frotas.checklists', 'frotas.checklist_new']));

NOTIFY pgrst, 'reload schema';
