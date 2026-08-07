-- Sincroniza vehicles.mileage com o odômetro informado pelo motorista no checklist.
-- Drivers não têm permissão de UPDATE em public.vehicles (RLS restringe a admin/master),
-- então o sync precisa rodar via trigger security definer, não pelo cliente.
create or replace function public.tg_sync_vehicle_mileage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.odometer_start is not null then
    update public.vehicles
    set mileage = new.odometer_start
    where id = new.vehicle_id
      and (mileage is null or mileage < new.odometer_start);
  end if;
  return new;
end;
$$;

drop trigger if exists checklists_sync_vehicle_mileage on public.checklists;
create trigger checklists_sync_vehicle_mileage
  after insert or update of odometer_start on public.checklists
  for each row execute function public.tg_sync_vehicle_mileage();

notify pgrst, 'reload schema';
