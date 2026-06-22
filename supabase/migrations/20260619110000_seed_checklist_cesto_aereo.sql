-- Seed checklist template: CESTO AÉREO

DO $$
DECLARE
  v_tpl_id uuid;
  v_cat_id uuid;
BEGIN
  INSERT INTO public.checklist_templates (name, vehicle_type)
  VALUES ('Checklist Diário - Cesto Aéreo', 'CESTO_AEREO')
  ON CONFLICT (vehicle_type) DO NOTHING;

  SELECT id INTO v_tpl_id
  FROM public.checklist_templates
  WHERE vehicle_type = 'CESTO_AEREO';

  IF NOT EXISTS (
    SELECT 1 FROM public.checklist_categories WHERE template_id = v_tpl_id
  ) THEN

    -- ── IDENTIFICAÇÃO GERAL ──────────────────────────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'IDENTIFICAÇÃO GERAL', 1)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Capacidade da carga: 136 kg', 1),
      (v_cat_id, 'Número de passageiros: 01',   2);

    -- ── DOCUMENTAÇÃO E LAUDOS ────────────────────────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'DOCUMENTAÇÃO E LAUDOS', 2)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Validade do Laudo Mecânico',            1),
      (v_cat_id, 'Validade do Laudo Elétrico',            2),
      (v_cat_id, 'Validade do Ensaio Dielétrico',         3),
      (v_cat_id, 'Validade do Laudo de Emissão Acústica', 4),
      (v_cat_id, 'Validade do Ensaio de Emissão Acústica',5);

    -- ── CONDIÇÕES GERAIS – ESTRUTURA E ESTABILIZAÇÃO ─────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'CONDIÇÕES GERAIS – ESTRUTURA E ESTABILIZAÇÃO', 3)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Sirene das sapatas estabilizadoras',                                          1),
      (v_cat_id, 'Funcionamento das sapatas estabilizadoras',                                   2),
      (v_cat_id, 'Plataforma da carroceria (malão)',                                            3),
      (v_cat_id, 'Estrutura geral da lança (trincas na base, braço inferior, etc.)',            4),
      (v_cat_id, 'Braço superior (trincas na lança isolada, etc.)',                             5),
      (v_cat_id, 'Eixo, cilindros e junção dos braços (barulhos, folgas, etc.)',               6),
      (v_cat_id, 'Parafusos de fixação da base',                                               7),
      (v_cat_id, 'Sistema de nivelamento do cesto aéreo (trincas, desnível do cesto, etc.)',   8),
      (v_cat_id, 'Condições do cesto aéreo (trincas, etc.)',                                   9),
      (v_cat_id, 'Condição da cuba isolante (liner)',                                          10),
      (v_cat_id, 'Capa do braço superior isolado',                                             11),
      (v_cat_id, 'Capa do liner',                                                              12),
      (v_cat_id, 'Guarda-corpo da escada do cesto (se existir no modelo)',                     13),
      (v_cat_id, 'Ponto de ancoragem para cinto paraquedista',                                 14),
      (v_cat_id, 'Limpeza da plataforma',                                                      15);

    -- ── CONDIÇÕES GERAIS – SISTEMA HIDRÁULICO ───────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'CONDIÇÕES GERAIS – SISTEMA HIDRÁULICO', 4)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Nível de óleo hidráulico no reservatório',      1),
      (v_cat_id, 'Mangueiras (vazamentos, danos, etc.)',           2),
      (v_cat_id, 'Cilindros e válvulas (vazamentos, etc.)',        3),
      (v_cat_id, 'Pontos de conexão (vazamentos, etc.)',           4),
      (v_cat_id, 'Lubrificação das engraxadeiras',                 5);

    -- ── CONDIÇÕES GERAIS – COMANDOS E SEGURANÇA ─────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'CONDIÇÕES GERAIS – COMANDOS E SEGURANÇA', 5)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Comandos superiores com travas de segurança',                                                                         1),
      (v_cat_id, 'Funcionamento e estado do botão de parada de emergência nos comandos superior e inferior (testar antes de sair a campo)', 2),
      (v_cat_id, 'Identificação do painel de controle inferior e superior',                                                             3);

    -- ── SINALIZAÇÃO ──────────────────────────────────────────────────────────
    INSERT INTO public.checklist_categories (template_id, name, sort_order)
    VALUES (v_tpl_id, 'SINALIZAÇÃO', 6)
    RETURNING id INTO v_cat_id;

    INSERT INTO public.checklist_items (category_id, name, sort_order) VALUES
      (v_cat_id, 'Luz de sinalização em serviços (Giroled)', 1),
      (v_cat_id, 'Luz rotativa',                             2),
      (v_cat_id, 'Demais luzes auxiliares',                  3);

  END IF;
END $$;
