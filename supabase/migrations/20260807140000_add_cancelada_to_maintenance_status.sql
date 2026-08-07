-- A migração 20260603115051 já pretendia adicionar 'cancelada' ao enum maintenance_status,
-- mas o valor nunca chegou a existir na base real (drift entre migrations e o banco).
-- Sem isso, salvar uma OS com status "Cancelada" (opção já presente na UI) falha com
-- "invalid input value for enum maintenance_status: cancelada".
ALTER TYPE public.maintenance_status ADD VALUE IF NOT EXISTS 'cancelada';

NOTIFY pgrst, 'reload schema';
