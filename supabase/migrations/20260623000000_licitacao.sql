-- Módulo de Licitação

-- Enums
CREATE TYPE public.licitacao_status AS ENUM (
  'mapeada',
  'em_analise',
  'proposta_enviada',
  'aguardando_resultado',
  'ganha',
  'perdida'
);

CREATE TYPE public.licitacao_modalidade AS ENUM (
  'pregao_eletronico',
  'pregao_presencial',
  'concorrencia',
  'tomada_de_precos',
  'convite',
  'dispensa',
  'inexigibilidade'
);

-- Tabela principal de licitações
CREATE TABLE IF NOT EXISTS public.licitacoes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo           TEXT NOT NULL,
  numero_processo  TEXT,
  orgao_licitante  TEXT,
  valor_estimado   NUMERIC(15, 2),
  modalidade       public.licitacao_modalidade,
  responsavel_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status           public.licitacao_status NOT NULL DEFAULT 'mapeada',
  data_abertura    DATE,
  data_vencimento  DATE,  -- "ganha até que data?" – data de vencimento do contrato
  observacoes      TEXT,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER licitacoes_updated_at
  BEFORE UPDATE ON public.licitacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Tabela de dispositivos autorizados (IP + device token por utilizador)
CREATE TABLE IF NOT EXISTS public.licitacao_trusted_devices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE,
  device_label TEXT,          -- ex: "iPhone do João", "PC do escritório"
  ip_address   TEXT,          -- IP registado na altura da aprovação
  approved     BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at  TIMESTAMPTZ,
  approved_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- RLS
ALTER TABLE public.licitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licitacao_trusted_devices ENABLE ROW LEVEL SECURITY;

-- licitacoes: qualquer autenticado com módulo licitacao pode ler/inserir/actualizar
CREATE POLICY "licitacoes_select" ON public.licitacoes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "licitacoes_insert" ON public.licitacoes
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "licitacoes_update" ON public.licitacoes
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "licitacoes_delete" ON public.licitacoes
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','master'))
  );

-- devices: utilizador vê os seus próprios; admin/master vê todos
CREATE POLICY "devices_select" ON public.licitacao_trusted_devices
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','master'))
  );

CREATE POLICY "devices_insert_own" ON public.licitacao_trusted_devices
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "devices_update_admin" ON public.licitacao_trusted_devices
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','master'))
  );

CREATE POLICY "devices_delete_admin" ON public.licitacao_trusted_devices
  FOR DELETE USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','master'))
  );
