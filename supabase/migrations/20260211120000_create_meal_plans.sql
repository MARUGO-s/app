-- Create/normalize meal_plans table for planner persistence (Supabase-first, user scoped)
begin;

create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  plan_date date not null,
  recipe_id bigint not null,
  meal_type text not null default 'dinner',
  note text not null default '',
  multiplier numeric(10, 3) not null default 1,
  total_weight numeric(10, 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meal_plans' and column_name = 'user_id'
  ) then
    alter table public.meal_plans add column user_id text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meal_plans' and column_name = 'plan_date'
  ) then
    alter table public.meal_plans add column plan_date date;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meal_plans' and column_name = 'date'
  ) then
    execute 'update public.meal_plans set plan_date = coalesce(plan_date, "date"::date) where plan_date is null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meal_plans' and column_name = 'date_str'
  ) then
    execute 'update public.meal_plans set plan_date = coalesce(plan_date, nullif(date_str, '''')::date) where plan_date is null';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meal_plans' and column_name = 'recipe_id'
  ) then
    alter table public.meal_plans add column recipe_id bigint;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meal_plans' and column_name = 'recipeid'
  ) then
    execute 'update public.meal_plans set recipe_id = coalesce(recipe_id, nullif(recipeid::text, '''')::bigint) where recipe_id is null';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meal_plans' and column_name = 'meal_type'
  ) then
    alter table public.meal_plans add column meal_type text default 'dinner';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meal_plans' and column_name = 'type'
  ) then
    execute 'update public.meal_plans set meal_type = coalesce(meal_type, "type"::text)';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meal_plans' and column_name = 'note'
  ) then
    alter table public.meal_plans add column note text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meal_plans' and column_name = 'multiplier'
  ) then
    alter table public.meal_plans add column multiplier numeric(10, 3);
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meal_plans' and column_name = 'total_weight'
  ) then
    alter table public.meal_plans add column total_weight numeric(10, 3);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meal_plans' and column_name = 'totalweight'
  ) then
    execute 'update public.meal_plans set total_weight = coalesce(total_weight, nullif(totalweight::text, '''')::numeric)';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meal_plans' and column_name = 'created_at'
  ) then
    alter table public.meal_plans add column created_at timestamptz default now();
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meal_plans' and column_name = 'updated_at'
  ) then
    alter table public.meal_plans add column updated_at timestamptz default now();
  end if;
end $$;

alter table public.meal_plans alter column user_id set not null;
alter table public.meal_plans alter column plan_date set not null;
alter table public.meal_plans alter column recipe_id set not null;

alter table public.meal_plans alter column meal_type set default 'dinner';
update public.meal_plans set meal_type = coalesce(nullif(meal_type, ''), 'dinner');
alter table public.meal_plans alter column meal_type set not null;

alter table public.meal_plans alter column note set default '';
update public.meal_plans set note = coalesce(note, '');
alter table public.meal_plans alter column note set not null;

alter table public.meal_plans alter column multiplier set default 1;
update public.meal_plans set multiplier = coalesce(multiplier, 1);
alter table public.meal_plans alter column multiplier set not null;

alter table public.meal_plans alter column created_at set default now();
update public.meal_plans set created_at = coalesce(created_at, now());
alter table public.meal_plans alter column created_at set not null;

alter table public.meal_plans alter column updated_at set default now();
update public.meal_plans set updated_at = coalesce(updated_at, now());
alter table public.meal_plans alter column updated_at set not null;

create index if not exists meal_plans_user_date_idx
  on public.meal_plans (user_id, plan_date);

create index if not exists meal_plans_user_recipe_idx
  on public.meal_plans (user_id, recipe_id);

alter table public.meal_plans enable row level security;

drop policy if exists meal_plans_select_own on public.meal_plans;
drop policy if exists meal_plans_insert_own on public.meal_plans;
drop policy if exists meal_plans_update_own on public.meal_plans;
drop policy if exists meal_plans_delete_own on public.meal_plans;

create policy meal_plans_select_own
on public.meal_plans
for select
to authenticated
using (user_id = auth.uid()::text);

create policy meal_plans_insert_own
on public.meal_plans
for insert
to authenticated
with check (user_id = auth.uid()::text);

create policy meal_plans_update_own
on public.meal_plans
for update
to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);

create policy meal_plans_delete_own
on public.meal_plans
for delete
to authenticated
using (user_id = auth.uid()::text);

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_meal_plans_updated_at on public.meal_plans;
create trigger update_meal_plans_updated_at
before update on public.meal_plans
for each row
execute function public.update_updated_at_column();

commit;
