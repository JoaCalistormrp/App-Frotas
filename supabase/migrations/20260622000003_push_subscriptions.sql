CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL,
  subscription JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- User can manage only their own subscriptions
CREATE POLICY "push_sub_own"
  ON push_subscriptions FOR ALL TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admin/master can read all (to send notifications)
CREATE POLICY "push_sub_admin_read"
  ON push_subscriptions FOR SELECT TO authenticated
  USING (public.has_admin_or_master(auth.uid()));

NOTIFY pgrst, 'reload schema';
