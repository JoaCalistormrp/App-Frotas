ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS driver_active boolean not null default false;

UPDATE public.profiles
SET driver_active = true
WHERE role_function = 'motorista';
