-- Add updated_at column to public.recipes.
-- The frontend selects this column in list/detail views and uses it for cache/ordering.

begin;

alter table public.recipes
  add column if not exists updated_at timestamptz;

update public.recipes
set updated_at = coalesce(updated_at, created_at, now());

alter table public.recipes
  alter column updated_at set default now();

alter table public.recipes
  alter column updated_at set not null;

-- Ensure trigger function exists (shared by multiple tables).
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_recipes_updated_at on public.recipes;
create trigger update_recipes_updated_at
before update on public.recipes
for each row
execute function public.update_updated_at_column();

commit;

