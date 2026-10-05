ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS electrician_active boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
