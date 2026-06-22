-- Seed checklist template: MAQUINÁRIO
-- Nota: este checklist usa HORÍMETRO em vez de odômetro (campo será adaptado na UI futuramente)

DO $$
DECLARE
  v_tpl_id uuid;
  v_cat_id uuid;
BEGIN
  INSERT INTO public.checklist_templates (name, vehicle_type)
  VALUES ('Checklist Diário - Maquinário', 'MAQUINARIO')
  ON CONFLICT (vehicle_type) DO NOTHING;

  SELECT id INTO v_tpl_id
  FROM public.checklist_templates
  WHERE vehicle_type = 'MAQUINARIO';

  IF NOT EXISTS (
    SELECT 1 FROM public.checklist_categories WHERE template_id = v_tpl_id
  ) THEN

    -- ── VERIFICAÇÃO DIÁRIA ───────────────────────────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'VERIFICAÇÃO DIÁRIA', 1)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Nível óleo motor',                       1),
      (v_cat_id, 'Nível óleo combustível',                 2),
      (v_cat_id, 'Nível óleo do hidráulico',               3),
      (v_cat_id, 'Marcar hora que está no painel',         4),
      (v_cat_id, 'Verificar aperto dos parafusos da lança',5),
      (v_cat_id, 'Engraxar equipamento todos os dias',     6),
      (v_cat_id, 'Limpeza da esteira',                     7),
      (v_cat_id, 'Usar diesel S-500 na máquina',           8);

  END IF;
END $$;
