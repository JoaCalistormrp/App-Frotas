-- Excluir um usuário apaga a conta de acesso (auth.users), mas o perfil fica para o histórico.
-- Estas três referências bloqueavam a exclusão (RESTRICT) de quem já enviou checklist,
-- registrou histórico de OS ou criou agendamento. Passam a apontar para o perfil,
-- que não é apagado, então o histórico continua mostrando o nome da pessoa.

ALTER TABLE public.checklists DROP CONSTRAINT checklists_driver_id_fkey;
ALTER TABLE public.checklists
  ADD CONSTRAINT checklists_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.profiles(id);

ALTER TABLE public.maintenance_evolutions DROP CONSTRAINT maintenance_evolutions_user_id_fkey;
ALTER TABLE public.maintenance_evolutions
  ADD CONSTRAINT maintenance_evolutions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.vehicle_schedules DROP CONSTRAINT vehicle_schedules_created_by_fkey;
ALTER TABLE public.vehicle_schedules
  ADD CONSTRAINT vehicle_schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);

NOTIFY pgrst, 'reload schema';
