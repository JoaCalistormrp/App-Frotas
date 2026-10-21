-- Anexos de documentos por licitação, guardados com o nome escolhido pelo
-- utilizador (não o nome original do ficheiro).

CREATE TABLE public.licitacao_documentos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licitacao_id  uuid NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  nome          text NOT NULL,
  file_path     text NOT NULL,
  file_size     bigint,
  content_type  text,
  uploaded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.licitacao_documentos (licitacao_id);

ALTER TABLE public.licitacao_documentos ENABLE ROW LEVEL SECURITY;

-- Mesmo círculo de acesso da licitação: módulo "licitacao" ou admin/master
CREATE POLICY "licitacao_documentos_all" ON public.licitacao_documentos
  FOR ALL TO authenticated
  USING (
    public.has_module_access(auth.uid(), ARRAY['licitacao'])
    OR public.has_admin_or_master(auth.uid())
  )
  WITH CHECK (
    public.has_module_access(auth.uid(), ARRAY['licitacao'])
    OR public.has_admin_or_master(auth.uid())
  );

-- Storage
INSERT INTO storage.buckets (id, name, public) VALUES ('licitacao-docs', 'licitacao-docs', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "licitacao-docs module all" ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'licitacao-docs' AND (
      public.has_module_access(auth.uid(), ARRAY['licitacao'])
      OR public.has_admin_or_master(auth.uid())
    )
  )
  WITH CHECK (
    bucket_id = 'licitacao-docs' AND (
      public.has_module_access(auth.uid(), ARRAY['licitacao'])
      OR public.has_admin_or_master(auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';
