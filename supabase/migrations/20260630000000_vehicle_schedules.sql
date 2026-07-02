CREATE TABLE public.vehicle_schedules (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    uuid        NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  type          text        NOT NULL CHECK (type IN ('reserva', 'servico')),
  title         text        NOT NULL,
  notes         text,
  start_date    date        NOT NULL,
  end_date      date        NOT NULL,
  assigned_user_id uuid     REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT end_after_start CHECK (end_date >= start_date)
);

ALTER TABLE public.vehicle_schedules ENABLE ROW LEVEL SECURITY;

-- Admin/master: acesso total
CREATE POLICY "schedules admin full" ON public.vehicle_schedules
  FOR ALL TO authenticated
  USING  (public.has_admin_or_master(auth.uid()))
  WITH CHECK (public.has_admin_or_master(auth.uid()));

-- Utilizadores com frotas.agendamento: acesso total
CREATE POLICY "schedules module full" ON public.vehicle_schedules
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_module_access
      WHERE user_id = auth.uid() AND module_slug = 'frotas.agendamento'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_module_access
      WHERE user_id = auth.uid() AND module_slug = 'frotas.agendamento'
    )
  );

-- Utilizadores com frotas.agendamento.readonly: só leitura
CREATE POLICY "schedules module readonly" ON public.vehicle_schedules
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_module_access
      WHERE user_id = auth.uid() AND module_slug = 'frotas.agendamento.readonly'
    )
  );

NOTIFY pgrst, 'reload schema';
