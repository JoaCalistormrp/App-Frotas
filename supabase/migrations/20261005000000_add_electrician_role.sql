ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'electrician';

NOTIFY pgrst, 'reload schema';
