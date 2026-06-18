CREATE TABLE IF NOT EXISTS user_module_access (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_slug TEXT NOT NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by  UUID REFERENCES auth.users(id),
  PRIMARY KEY (user_id, module_slug)
);

ALTER TABLE user_module_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "module_access_admin_master_all"
  ON user_module_access FOR ALL TO authenticated
  USING  (public.has_admin_or_master(auth.uid()))
  WITH CHECK (public.has_admin_or_master(auth.uid()));

CREATE INDEX ON user_module_access (user_id);

NOTIFY pgrst, 'reload schema';
