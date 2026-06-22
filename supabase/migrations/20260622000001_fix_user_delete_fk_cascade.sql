-- Fix FK constraints that block auth user deletion.
-- These columns are nullable audit fields; setting ON DELETE SET NULL is correct.

ALTER TABLE maintenance_os_link_finalized
  DROP CONSTRAINT IF EXISTS maintenance_os_link_finalized_finalized_by_fkey,
  ADD CONSTRAINT maintenance_os_link_finalized_finalized_by_fkey
    FOREIGN KEY (finalized_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE user_module_access
  DROP CONSTRAINT IF EXISTS user_module_access_granted_by_fkey,
  ADD CONSTRAINT user_module_access_granted_by_fkey
    FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
