ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'geral';

NOTIFY pgrst, 'reload schema';
