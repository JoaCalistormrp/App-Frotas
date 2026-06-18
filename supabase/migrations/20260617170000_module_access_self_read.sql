-- Allow any authenticated user to read their own module access rows.
-- The existing policy (module_access_admin_master_all) already covers admin/master for all rows.
-- This policy lets viewers and others read only their own assigned modules.
CREATE POLICY "module_access_self_select"
  ON user_module_access FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
