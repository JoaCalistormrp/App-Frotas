-- Seed checklist template: VEÍCULOS OPERACIONAIS

DO $$
DECLARE
  v_tpl_id uuid;
  v_cat_id uuid;
BEGIN
  INSERT INTO public.checklist_templates (name, vehicle_type)
  VALUES ('Checklist Diário - Veículos Operacionais', 'OPERACIONAIS')
  ON CONFLICT (vehicle_type) DO NOTHING;

  SELECT id INTO v_tpl_id
  FROM public.checklist_templates
  WHERE vehicle_type = 'OPERACIONAIS';

  IF NOT EXISTS (
    SELECT 1 FROM public.checklist_categories WHERE template_id = v_tpl_id
  ) THEN

    -- ── CONSERVAÇÃO ──────────────────────────────────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'CONSERVAÇÃO', 1)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Limpeza externa', 1),
      (v_cat_id, 'Limpeza interna', 2),
      (v_cat_id, 'Caçamba',         3),
      (v_cat_id, 'Pneus',           4),
      (v_cat_id, 'Estepe',          5);

    -- ── SISTEMA DE ILUMINAÇÃO TRASEIRA ───────────────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'SISTEMA DE ILUMINAÇÃO TRASEIRA', 2)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Luz de placa',          1),
      (v_cat_id, 'Lanterna direita',       2),
      (v_cat_id, 'Lanterna esquerda',      3),
      (v_cat_id, 'Luz de ré direita',      4),
      (v_cat_id, 'Luz de ré esquerda',     5),
      (v_cat_id, 'Luz de freio direita',   6),
      (v_cat_id, 'Luz de freio esquerda',  7),
      (v_cat_id, 'Seta direita',           8),
      (v_cat_id, 'Seta esquerda',          9);

    -- ── SISTEMA DE ILUMINAÇÃO DIANTEIRA ──────────────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'SISTEMA DE ILUMINAÇÃO DIANTEIRA', 3)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Farol alto direito',                 1),
      (v_cat_id, 'Farol alto esquerdo',                2),
      (v_cat_id, 'Farol baixo direito',                3),
      (v_cat_id, 'Farol baixo esquerdo',               4),
      (v_cat_id, 'Luz de posição direita',             5),
      (v_cat_id, 'Luz de posição esquerda',            6),
      (v_cat_id, 'Farol de neblina (quando equipado)', 7);

    -- ── SEGURANÇA E ACESSÓRIOS ───────────────────────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'SEGURANÇA E ACESSÓRIOS', 4)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Alarme',                    1),
      (v_cat_id, 'Buzina',                    2),
      (v_cat_id, 'Chave de roda',             3),
      (v_cat_id, 'Macaco',                    4),
      (v_cat_id, 'Triângulo',                 5),
      (v_cat_id, 'Cintos de segurança',       6),
      (v_cat_id, 'Ficha Técnica',             7),
      (v_cat_id, 'Limpadores de para-brisa',  8),
      (v_cat_id, 'Retrovisor interno',        9),
      (v_cat_id, 'Retrovisor direito',       10),
      (v_cat_id, 'Retrovisor esquerdo',      11),
      (v_cat_id, 'Travas das portas',        12),
      (v_cat_id, 'Vidros laterais',          13),
      (v_cat_id, 'Suporte de celular',       14),
      (v_cat_id, 'Painel de instrumentos',   15);

    -- ── MOTOR E FUNCIONAMENTO ────────────────────────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'MOTOR E FUNCIONAMENTO', 5)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Chave de ignição',                  1),
      (v_cat_id, 'Nível do óleo do motor',            2),
      (v_cat_id, 'Nível do líquido de arrefecimento', 3),
      (v_cat_id, 'Água do limpador de para-brisa',    4),
      (v_cat_id, 'Bateria',                           5),
      (v_cat_id, 'Freio',                             6),
      (v_cat_id, 'Freio de mão',                      7),
      (v_cat_id, 'Embreagem',                         8),
      (v_cat_id, 'Acelerador',                        9),
      (v_cat_id, 'Vazamentos aparentes',             10);

  END IF;
END $$;
