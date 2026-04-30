create table if not exists public.recipe_category_cost_overrides (
  id uuid primary key default gen_random_uuid(),
  recipe_id bigint not null references public.recipes(id) on delete cascade,
  category_key text not null,
  category_name text,
  overridden_cost_tax_included numeric not null check (overridden_cost_tax_included >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_id, category_key)
);

create index if not exists idx_recipe_category_cost_overrides_recipe_id
  on public.recipe_category_cost_overrides(recipe_id);

alter table public.recipe_category_cost_overrides enable row level security;

drop policy if exists "recipe_category_cost_overrides_select_all" on public.recipe_category_cost_overrides;
drop policy if exists "recipe_category_cost_overrides_insert_authenticated" on public.recipe_category_cost_overrides;
drop policy if exists "recipe_category_cost_overrides_update_authenticated" on public.recipe_category_cost_overrides;
drop policy if exists "recipe_category_cost_overrides_delete_authenticated" on public.recipe_category_cost_overrides;

create policy "recipe_category_cost_overrides_select_all"
on public.recipe_category_cost_overrides
for select
using (true);

create policy "recipe_category_cost_overrides_insert_authenticated"
on public.recipe_category_cost_overrides
for insert
to authenticated
with check (true);

create policy "recipe_category_cost_overrides_update_authenticated"
on public.recipe_category_cost_overrides
for update
to authenticated
using (true)
with check (true);

create policy "recipe_category_cost_overrides_delete_authenticated"
on public.recipe_category_cost_overrides
for delete
to authenticated
using (true);

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_recipe_category_cost_overrides_updated_at on public.recipe_category_cost_overrides;
create trigger update_recipe_category_cost_overrides_updated_at
before update on public.recipe_category_cost_overrides
for each row
execute function public.update_updated_at_column();
