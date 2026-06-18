-- Nuclear fix: delete and cleanly re-insert auth records for imported mechanics.
-- Direct SQL INSERTs leave several varchar fields NULL; GoTrue's Go scanner
-- expects non-pointer strings (empty string, not NULL) and fails with
-- "Database error loading user" when any are NULL.

CREATE TEMP TABLE _mech AS
SELECT
  u.id,
  u.email,
  u.encrypted_password
FROM auth.users u
WHERE u.email LIKE '%@grupotomaz.com.br';

-- Delete in dependency order to avoid FK violations
DELETE FROM public.user_module_access WHERE user_id IN (SELECT id FROM _mech);
DELETE FROM public.user_roles          WHERE user_id IN (SELECT id FROM _mech);
DELETE FROM auth.identities            WHERE user_id IN (SELECT id FROM _mech);
DELETE FROM auth.users                 WHERE id      IN (SELECT id FROM _mech);

-- Re-insert with every field GoTrue expects
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change_token_current,
  email_change,
  phone_change,
  phone_change_token,
  reauthentication_token,
  email_change_confirm_status,
  is_super_admin,
  is_sso_user,
  is_anonymous,
  raw_app_meta_data,
  raw_user_meta_data
)
SELECT
  m.id,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated',
  m.email, m.encrypted_password,
  now(), now(), now(),
  '',    -- confirmation_token
  '',    -- recovery_token
  '',    -- email_change_token_new
  '',    -- email_change_token_current
  '',    -- email_change
  '',    -- phone_change
  '',    -- phone_change_token
  '',    -- reauthentication_token
  0,     -- email_change_confirm_status
  false, -- is_super_admin
  false, -- is_sso_user
  false, -- is_anonymous
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', (
    SELECT p.full_name FROM public.profiles p WHERE p.id = m.id
  ))
FROM _mech m;
-- handle_new_user trigger fires here, inserting 'driver' role for each user

-- Re-insert identities with complete identity_data
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  m.id,
  jsonb_build_object(
    'sub',            m.id::text,
    'email',          m.email,
    'email_verified', true,
    'phone_verified', false,
    'provider',       'email'
  ),
  'email',
  m.email,
  now(), now(), now()
FROM _mech m;

-- Trigger inserted 'driver'; promote back to 'mechanic'
UPDATE public.user_roles
SET role = 'mechanic'::app_role
WHERE user_id IN (SELECT id FROM _mech)
  AND role = 'driver';

DROP TABLE _mech;

NOTIFY pgrst, 'reload schema';
