-- KM alvo da próxima troca de óleo. Quando a quilometragem atual do veículo
-- atinge/ultrapassa este valor, o dashboard mostra alerta de óleo vencido.
alter table public.vehicles add column if not exists oil_change_due_km integer;

notify pgrst, 'reload schema';
