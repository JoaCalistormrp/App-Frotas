-- ═══════════════════════════════════════════════════════════════════════
-- SECURITY HARDENING — ref: "The Web Application Hacker's Handbook"
-- ═══════════════════════════════════════════════════════════════════════

-- ── Cap. 8: Access Control ───────────────────────────────────────────────
-- PROBLEMA: RLS licitacoes usava auth.uid() IS NOT NULL
-- qualquer user autenticado acedia às licitações via API direta (bypass total)
-- CORREÇÃO: obrigar módulo licitacao em user_module_access OU role admin/master

DROP POLICY IF EXISTS "licitacoes_select" ON public.licitacoes;
DROP POLICY IF EXISTS "licitacoes_insert" ON public.licitacoes;
DROP POLICY IF EXISTS "licitacoes_update" ON public.licitacoes;
DROP POLICY IF EXISTS "licitacoes_delete" ON public.licitacoes;

CREATE POLICY "licitacoes_select" ON public.licitacoes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_module_access
            WHERE user_id = auth.uid() AND module_slug = 'licitacao')
    OR EXISTS (SELECT 1 FROM public.user_roles
               WHERE user_id = auth.uid() AND role IN ('admin','master'))
  );

CREATE POLICY "licitacoes_insert" ON public.licitacoes
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_module_access
            WHERE user_id = auth.uid() AND module_slug = 'licitacao')
    OR EXISTS (SELECT 1 FROM public.user_roles
               WHERE user_id = auth.uid() AND role IN ('admin','master'))
  );

CREATE POLICY "licitacoes_update" ON public.licitacoes
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.user_module_access
            WHERE user_id = auth.uid() AND module_slug = 'licitacao')
    OR EXISTS (SELECT 1 FROM public.user_roles
               WHERE user_id = auth.uid() AND role IN ('admin','master'))
  );

CREATE POLICY "licitacoes_delete" ON public.licitacoes
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role IN ('admin','master'))
  );

-- ── Cap. 6: Brute Force — rate limit de tentativas em licitacao-auth ─────
-- Tabela para registar tentativas falhadas por IP
CREATE TABLE IF NOT EXISTS public.auth_attempts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,          -- IP ou user_id
  action     TEXT NOT NULL,          -- 'licitacao_auth', 'login', etc.
  success    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_attempts_identifier_action_idx
  ON public.auth_attempts (identifier, action, created_at DESC);

ALTER TABLE public.auth_attempts ENABLE ROW LEVEL SECURITY;
-- Só admins lêem os logs de tentativas
CREATE POLICY "auth_attempts_admin" ON public.auth_attempts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role IN ('admin','master'))
  );
-- A edge function insere via service_role (bypassa RLS), tabela não precisa INSERT policy

-- ── Cap. 2: Audit Trail ──────────────────────────────────────────────────
-- Registo imutável de acções sensíveis
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,     -- 'licitacao_access_granted', 'device_approved', etc.
  resource   TEXT,              -- tabela ou recurso afectado
  details    JSONB,             -- contexto adicional (sem dados sensíveis)
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_admin_only" ON public.security_audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role IN ('admin','master'))
  );
-- Apenas service_role pode inserir (edge functions)
