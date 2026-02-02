-- Allow users to override missing/incorrect CSV units per ingredient

create table if not exists public.csv_unit_overrides (
  user_id text not null,
  ingredient_name text not null,
  csv_unit text not null,
  updated_at timestamp with time zone default now(),
  constraint csv_unit_overrides_pkey primary key (user_id, ingredient_name)
);

alter table public.csv_unit_overrides enable row level security;

-- Select own (and admin)
drop policy if exists csv_unit_overrides_select_own_or_admin on public.csv_unit_overrides;
create policy csv_unit_overrides_select_own_or_admin
  on public.csv_unit_overrides
  for select
  using (user_id = auth.uid()::text or public.is_admin());

-- Insert own (and admin)
drop policy if exists csv_unit_overrides_insert_own_or_admin on public.csv_unit_overrides;
create policy csv_unit_overrides_insert_own_or_admin
  on public.csv_unit_overrides
  for insert
  with check (user_id = auth.uid()::text or public.is_admin());

-- Update own (and admin)
drop policy if exists csv_unit_overrides_update_own_or_admin on public.csv_unit_overrides;
create policy csv_unit_overrides_update_own_or_admin
  on public.csv_unit_overrides
  for update
  using (user_id = auth.uid()::text or public.is_admin())
  with check (user_id = auth.uid()::text or public.is_admin());

-- Delete own (and admin)
drop policy if exists csv_unit_overrides_delete_own_or_admin on public.csv_unit_overrides;
create policy csv_unit_overrides_delete_own_or_admin
  on public.csv_unit_overrides
  for delete
  using (user_id = auth.uid()::text or public.is_admin());

