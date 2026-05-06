
-- Roles enum + user_roles
create type public.app_role as enum ('admin', 'driver');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  cpf text,
  cnh text,
  company text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Vehicle type enum
create type public.vehicle_type as enum ('PESADOS','OPERACIONAIS','CESTO_AEREO','ADMINISTRATIVO','MUNCK');

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  plate text not null unique,
  model text,
  vehicle_type public.vehicle_type not null,
  sector text,
  base text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  vehicle_type public.vehicle_type not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.checklist_categories (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.checklist_categories(id) on delete cascade,
  name text not null,
  required boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create type public.checklist_status as enum ('in_progress','completed');
create type public.response_status as enum ('OK','NAO_OK','NA');

create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  driver_id uuid not null references auth.users(id) on delete restrict,
  template_id uuid not null references public.checklist_templates(id) on delete restrict,
  itinerary text,
  damage_description text,
  odometer_start numeric,
  odometer_end numeric,
  exit_time time,
  observations text,
  signature_url text,
  status public.checklist_status not null default 'in_progress',
  has_issues boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.checklist_responses (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  item_id uuid not null references public.checklist_items(id) on delete restrict,
  status public.response_status not null,
  observation text,
  photo_url text,
  created_at timestamptz not null default now(),
  unique (checklist_id, item_id)
);

create index on public.checklists (driver_id);
create index on public.checklists (vehicle_id);
create index on public.checklists (created_at desc);
create index on public.checklist_responses (checklist_id);

-- updated_at trigger
create or replace function public.tg_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger profiles_updated before update on public.profiles for each row execute function public.tg_set_updated_at();
create trigger vehicles_updated before update on public.vehicles for each row execute function public.tg_set_updated_at();

-- Auto-create profile + default driver role on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  insert into public.user_roles (user_id, role) values (new.id, 'driver');
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.vehicles enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.checklist_categories enable row level security;
alter table public.checklist_items enable row level security;
alter table public.checklists enable row level security;
alter table public.checklist_responses enable row level security;

-- profiles: user views/updates own; admin sees all
create policy "profiles self select" on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "profiles self update" on public.profiles for update to authenticated using (id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "profiles admin insert" on public.profiles for insert to authenticated with check (id = auth.uid() or public.has_role(auth.uid(),'admin'));

-- user_roles: user reads own, admin manages
create policy "roles self read" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "roles admin all" on public.user_roles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- vehicles: all authenticated read, admin write
create policy "vehicles read" on public.vehicles for select to authenticated using (true);
create policy "vehicles admin all" on public.vehicles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- templates/categories/items: all read, admin write
create policy "tpl read" on public.checklist_templates for select to authenticated using (true);
create policy "tpl admin all" on public.checklist_templates for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "cat read" on public.checklist_categories for select to authenticated using (true);
create policy "cat admin all" on public.checklist_categories for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "item read" on public.checklist_items for select to authenticated using (true);
create policy "item admin all" on public.checklist_items for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- checklists: driver sees/owns own, admin sees all
create policy "checklists own select" on public.checklists for select to authenticated using (driver_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "checklists own insert" on public.checklists for insert to authenticated with check (driver_id = auth.uid());
create policy "checklists own update" on public.checklists for update to authenticated using (driver_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "checklists admin delete" on public.checklists for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- checklist_responses: linked to owning checklist
create policy "resp select" on public.checklist_responses for select to authenticated using (
  exists(select 1 from public.checklists c where c.id = checklist_id and (c.driver_id = auth.uid() or public.has_role(auth.uid(),'admin')))
);
create policy "resp insert" on public.checklist_responses for insert to authenticated with check (
  exists(select 1 from public.checklists c where c.id = checklist_id and c.driver_id = auth.uid())
);
create policy "resp update" on public.checklist_responses for update to authenticated using (
  exists(select 1 from public.checklists c where c.id = checklist_id and (c.driver_id = auth.uid() or public.has_role(auth.uid(),'admin')))
);
create policy "resp delete" on public.checklist_responses for delete to authenticated using (
  exists(select 1 from public.checklists c where c.id = checklist_id and (c.driver_id = auth.uid() or public.has_role(auth.uid(),'admin')))
);

-- Storage bucket
insert into storage.buckets (id, name, public) values ('checklist-photos','checklist-photos', true)
on conflict (id) do nothing;

create policy "checklist photos public read" on storage.objects for select using (bucket_id = 'checklist-photos');
create policy "checklist photos auth write" on storage.objects for insert to authenticated with check (bucket_id = 'checklist-photos');
create policy "checklist photos auth update" on storage.objects for update to authenticated using (bucket_id = 'checklist-photos');
create policy "checklist photos auth delete" on storage.objects for delete to authenticated using (bucket_id = 'checklist-photos');
