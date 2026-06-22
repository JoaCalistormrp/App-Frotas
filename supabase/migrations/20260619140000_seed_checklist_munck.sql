-- Seed checklist template: MUNCK

DO $$
DECLARE
  v_tpl_id uuid;
  v_cat_id uuid;
BEGIN
  INSERT INTO public.checklist_templates (name, vehicle_type)
  VALUES ('Checklist Diário - Munck', 'MUNCK')
  ON CONFLICT (vehicle_type) DO NOTHING;

  SELECT id INTO v_tpl_id
  FROM public.checklist_templates
  WHERE vehicle_type = 'MUNCK';

  IF NOT EXISTS (
    SELECT 1 FROM public.checklist_categories WHERE template_id = v_tpl_id
  ) THEN

    -- ── IDENTIFICAÇÃO GERAL ──────────────────────────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'IDENTIFICAÇÃO GERAL', 1)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Identificação de capacidade da carga (12 t)',   1),
      (v_cat_id, 'Identificação nas alavancas de comando',        2),
      (v_cat_id, 'Placas de advertência (na lança ou base)',      3);

    -- ── LISTA DE FERRAMENTAS ─────────────────────────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'LISTA DE FERRAMENTAS', 2)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Pá',                                                       1),
      (v_cat_id, 'Picareta / Chibanca',                                      2),
      (v_cat_id, 'Cavadeira',                                                3),
      (v_cat_id, 'Enxada',                                                   4),
      (v_cat_id, 'Soquete',                                                  5),
      (v_cat_id, 'Alavanca',                                                 6),
      (v_cat_id, 'Cinta de elevação 3 m – capacidade 3 t',                  7),
      (v_cat_id, 'Cinta de elevação 1,5 m – capacidade 3 t',                8),
      (v_cat_id, 'Estropo de aço 5/8 com sapatilha 1,5 m – capacidade 3 t', 9);

    -- ── CONDIÇÕES GERAIS – ESTABILIZAÇÃO E PLATAFORMA ────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'CONDIÇÕES GERAIS – ESTABILIZAÇÃO E PLATAFORMA', 3)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Sirene das sapatas estabilizadoras',       1),
      (v_cat_id, 'Funcionamento das sapatas estabilizadoras',2),
      (v_cat_id, 'Plataforma de operação',                   3);

    -- ── CONDIÇÕES GERAIS – ESTRUTURA DO MUNCK ────────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'CONDIÇÕES GERAIS – ESTRUTURA DO MUNCK', 4)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Estado do braço hidráulico (trincas, deformidades, empenamento, etc.)', 1),
      (v_cat_id, 'Eixos dos cilindros (barulhos, folgas, etc.)',                          2),
      (v_cat_id, 'Estado da lança estendida (empenamento, folgas, etc.)',                 3),
      (v_cat_id, 'Pinos e travas de segurança da lança',                                 4);

    -- ── CONDIÇÕES GERAIS – SISTEMA HIDRÁULICO ───────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'CONDIÇÕES GERAIS – SISTEMA HIDRÁULICO', 5)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Nível de óleo hidráulico no reservatório',                          1),
      (v_cat_id, 'Condição geral das mangueiras hidráulicas (vazamentos, desgastes)', 2),
      (v_cat_id, 'Condição das conexões (vazamentos, desgastes)',                     3),
      (v_cat_id, 'Cilindros e válvulas de segurança (vazamentos, danos)',             4),
      (v_cat_id, 'Lubrificação das engraxadeiras',                                   5);

    -- ── CONDIÇÕES GERAIS – SISTEMA DE IÇAMENTO ──────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'CONDIÇÕES GERAIS – SISTEMA DE IÇAMENTO', 6)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Estado do moitão e trava de segurança', 1),
      (v_cat_id, 'Estado das cintas de elevação',         2),
      (v_cat_id, 'Estado dos estropos de aço',            3);

    -- ── DOCUMENTAÇÃO E ENSAIOS ───────────────────────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'DOCUMENTAÇÃO E ENSAIOS', 7)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Validade do Ensaio Não Destrutivo (END)', 1);

    -- ── SINALIZAÇÃO ──────────────────────────────────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'SINALIZAÇÃO', 8)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Placas de advertência (Homens Trabalhando)',    1),
      (v_cat_id, 'Cones de sinalização',                         2),
      (v_cat_id, 'Demais materiais de sinalização (fitas, etc.)',3);

  END IF;
END $$;
