-- Create auth accounts for standalone profiles (imported staff without logins)
-- Password for all: Rm@2025.
-- Email format: {cpf_digits}@grupotomaz.com.br
-- Role: mechanic

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Update trigger to handle conflicts when inserting into auth.users
-- (profiles already exist — we don't want the trigger to fail on duplicate id)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'full_name', new.email))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'driver')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN new;
END; $$;

-- Identify standalone profiles (no matching auth.users entry)
CREATE TEMP TABLE _standalone AS
SELECT p.id, p.full_name, p.cpf,
       regexp_replace(p.cpf, '[^0-9]', '', 'g') || '@grupotomaz.com.br' AS email
FROM public.profiles p
WHERE p.cpf IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

-- Create auth.users entries
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
SELECT
  s.id,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated',
  s.email,
  extensions.crypt('Rm@2025.', extensions.gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', s.full_name)
FROM _standalone s;

-- Create auth.identities entries (required for email/password login)
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  s.id,
  jsonb_build_object('sub', s.id::text, 'email', s.email),
  'email',
  s.email,
  now(), now(), now()
FROM _standalone s;

-- The trigger inserted 'driver' role — replace it with 'mechanic'
UPDATE public.user_roles
SET role = 'mechanic'::app_role
WHERE user_id IN (SELECT id FROM _standalone)
  AND role = 'driver';

DROP TABLE _standalone;

NOTIFY pgrst, 'reload schema';
