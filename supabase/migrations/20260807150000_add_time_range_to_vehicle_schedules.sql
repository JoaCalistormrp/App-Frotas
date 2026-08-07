-- Permite agendar por faixa de horário dentro do dia (ex: 08:00-12:00 com uma pessoa,
-- 13:00-17:00 com outra), além do agendamento de dia inteiro já existente.
-- Nulo em ambos = agendamento de dia inteiro (comportamento anterior, sem mudança).
ALTER TABLE public.vehicle_schedules
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time time;

ALTER TABLE public.vehicle_schedules
  ADD CONSTRAINT time_range_consistent CHECK (
    (start_time IS NULL AND end_time IS NULL)
    OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  );

NOTIFY pgrst, 'reload schema';
