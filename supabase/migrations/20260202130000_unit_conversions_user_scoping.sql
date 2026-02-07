-- Scope unit_conversions per user (Supabase Auth uid)

alter table public.unit_conversions
  add column if not exists user_id text;

-- Backfill legacy rows to a known display_id bucket if needed (keeps existing data accessible after migration mapping step)
update public.unit_conversions
set user_id = 'yoshito'
where user_id is null;

alter table public.unit_conversions
  alter column user_id set not null;

-- Replace global unique constraint with per-user uniqueness
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'unit_conversions_ingredient_name_key'
  ) then
    alter table public.unit_conversions drop constraint unit_conversions_ingredient_name_key;
  end if;
end $$;

create unique index if not exists idx_unit_conversions_user_ingredient_unique
  on public.unit_conversions(user_id, ingredient_name);

create index if not exists idx_unit_conversions_user_id
  on public.unit_conversions(user_id);

-- Tighten RLS: only own rows (Auth required)
drop policy if exists "Enable read access for all users" on public.unit_conversions;
drop policy if exists "Enable insert for all users" on public.unit_conversions;
drop policy if exists "Enable update for all users" on public.unit_conversions;
drop policy if exists "Enable delete for all users" on public.unit_conversions;
drop policy if exists "unit_conversions_select_own" on public.unit_conversions;
drop policy if exists "unit_conversions_insert_own" on public.unit_conversions;
drop policy if exists "unit_conversions_update_own" on public.unit_conversions;
drop policy if exists "unit_conversions_delete_own" on public.unit_conversions;

create policy "unit_conversions_select_own" on public.unit_conversions
  for select
  using (user_id = auth.uid()::text);

create policy "unit_conversions_insert_own" on public.unit_conversions
  for insert
  with check (user_id = auth.uid()::text);

create policy "unit_conversions_update_own" on public.unit_conversions
  for update
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

create policy "unit_conversions_delete_own" on public.unit_conversions
  for delete
  using (user_id = auth.uid()::text);
