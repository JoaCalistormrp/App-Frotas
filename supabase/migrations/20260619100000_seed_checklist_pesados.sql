-- Seed checklist template: VEÍCULOS PESADOS
-- Runs only if no categories exist yet for this template (idempotent)

DO $$
DECLARE
  v_tpl_id uuid;
  v_cat_id uuid;
BEGIN
  -- Garantir que o template existe
  INSERT INTO public.checklist_templates (name, vehicle_type)
  VALUES ('Checklist Diário - Veículos Pesados', 'PESADOS')
  ON CONFLICT (vehicle_type) DO NOTHING;

  SELECT id INTO v_tpl_id
  FROM public.checklist_templates
  WHERE vehicle_type = 'PESADOS';

  -- Só inserir se ainda não houver categorias
  IF NOT EXISTS (
    SELECT 1 FROM public.checklist_categories WHERE template_id = v_tpl_id
  ) THEN

    -- ── CONSERVAÇÃO ─────────────────────────────────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'CONSERVAÇÃO', 1)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Limpeza externa',  1),
      (v_cat_id, 'Limpeza interna',  2),
      (v_cat_id, 'Caçamba',          3),
      (v_cat_id, 'Pneus',            4),
      (v_cat_id, 'Estepe',           5);

    -- ── SISTEMA DE ILUMINAÇÃO TRASEIRA ───────────────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'SISTEMA DE ILUMINAÇÃO TRASEIRA', 2)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Luz de placa',           1),
      (v_cat_id, 'Lanterna direita',        2),
      (v_cat_id, 'Lanterna esquerda',       3),
      (v_cat_id, 'Luz de ré direita',       4),
      (v_cat_id, 'Luz de ré esquerda',      5),
      (v_cat_id, 'Luz de freio direita',    6),
      (v_cat_id, 'Luz de freio esquerda',   7),
      (v_cat_id, 'Seta direita',            8),
      (v_cat_id, 'Seta esquerda',           9);

    -- ── SISTEMA DE ILUMINAÇÃO DIANTEIRA ──────────────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'SISTEMA DE ILUMINAÇÃO DIANTEIRA', 3)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Farol alto direito',                1),
      (v_cat_id, 'Farol alto esquerdo',               2),
      (v_cat_id, 'Farol baixo direito',               3),
      (v_cat_id, 'Farol baixo esquerdo',              4),
      (v_cat_id, 'Luz de posição direita',            5),
      (v_cat_id, 'Luz de posição esquerda',           6),
      (v_cat_id, 'Farol de neblina (quando equipado)',7);

    -- ── SEGURANÇA E ACESSÓRIOS ───────────────────────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'SEGURANÇA E ACESSÓRIOS', 4)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Buzina',                    1),
      (v_cat_id, 'Chave de roda',             2),
      (v_cat_id, 'Macaco',                    3),
      (v_cat_id, 'Triângulo',                 4),
      (v_cat_id, '2 Calços',                  5),
      (v_cat_id, '6 Cones',                   6),
      (v_cat_id, '1 Escada',                  7),
      (v_cat_id, 'Cintos de segurança',       8),
      (v_cat_id, 'Ficha Técnica',             9),
      (v_cat_id, 'Extintor',                 10),
      (v_cat_id, 'Limpadores de para-brisa', 11),
      (v_cat_id, 'Retrovisor interno',       12),
      (v_cat_id, 'Retrovisor direito',       13),
      (v_cat_id, 'Retrovisor esquerdo',      14),
      (v_cat_id, 'Travas das portas',        15),
      (v_cat_id, 'Vidros laterais',          16),
      (v_cat_id, 'Suporte de celular',       17),
      (v_cat_id, 'Tacógrafo',               18),
      (v_cat_id, 'Painel de instrumentos',  19);

    -- ── MOTOR E FUNCIONAMENTO ────────────────────────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'MOTOR E FUNCIONAMENTO', 5)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Chave de ignição',                    1),
      (v_cat_id, 'Óleo do motor',                       2),
      (v_cat_id, 'Óleo hidráulico',                     3),
      (v_cat_id, 'Nível do líquido de arrefecimento',   4),
      (v_cat_id, 'Água do limpador de para-brisa',      5),
      (v_cat_id, 'Bateria',                             6),
      (v_cat_id, 'Freio',                               7),
      (v_cat_id, 'Freio de mão',                        8),
      (v_cat_id, 'Embreagem',                           9),
      (v_cat_id, 'Acelerador',                         10),
      (v_cat_id, 'Vazamentos aparentes',               11),
      (v_cat_id, 'Fluido de freio',                    12),
      (v_cat_id, 'ARLA 32',                            13);

  END IF;
END $$;
