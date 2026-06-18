-- Step 1: structural changes + enum additions (must commit before seed INSERT)

-- Allow profiles to exist without a corresponding auth.users entry
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Add function roles missing from the driver_function enum
ALTER TYPE public.driver_function ADD VALUE IF NOT EXISTS 'eletricista';
ALTER TYPE public.driver_function ADD VALUE IF NOT EXISTS 'mecanico';

NOTIFY pgrst, 'reload schema';
