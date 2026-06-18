-- Fix auth.users records for mechanics created via direct SQL INSERT.
-- GoTrue (Supabase auth server) scans these columns into non-pointer Go strings/bools.
-- If they are NULL the scan fails with "Database error loading user".

UPDATE auth.users
SET
  confirmation_token      = COALESCE(confirmation_token,      ''),
  recovery_token          = COALESCE(recovery_token,          ''),
  email_change_token_new  = COALESCE(email_change_token_new,  ''),
  is_super_admin          = COALESCE(is_super_admin,          false)
WHERE email LIKE '%@grupotomaz.com.br';

NOTIFY pgrst, 'reload schema';
