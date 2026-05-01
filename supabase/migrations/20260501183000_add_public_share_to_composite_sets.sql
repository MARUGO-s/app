begin;

alter table public.recipe_composite_sets
  add column if not exists is_public boolean not null default false;

create index if not exists idx_recipe_composite_sets_is_public
  on public.recipe_composite_sets(is_public);

drop policy if exists "composite_sets_select_own" on public.recipe_composite_sets;
create policy "composite_sets_select_own_or_public"
on public.recipe_composite_sets
for select
using (
  created_by = auth.uid()
  or is_public = true
);

drop policy if exists "composite_set_items_select_own" on public.recipe_composite_set_items;
create policy "composite_set_items_select_own_or_public"
on public.recipe_composite_set_items
for select
using (
  exists (
    select 1
    from public.recipe_composite_sets sets
    where sets.id = composite_set_id
      and (sets.created_by = auth.uid() or sets.is_public = true)
  )
);

commit;
