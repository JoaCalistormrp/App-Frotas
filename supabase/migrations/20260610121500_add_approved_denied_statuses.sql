-- Add approved/denied statuses for Master approval workflow
ALTER TYPE public.maintenance_status ADD VALUE IF NOT EXISTS 'aprovada';
ALTER TYPE public.maintenance_status ADD VALUE IF NOT EXISTS 'negada';

NOTIFY pgrst, 'reload schema';
