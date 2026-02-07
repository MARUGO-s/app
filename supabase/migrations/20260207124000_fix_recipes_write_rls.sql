-- Ensure non-admin authenticated users can create/update/delete recipes.
-- This migration normalizes conflicting legacy policies on public.recipes.

begin;

alter table public.recipes enable row level security;

-- Remove legacy/overlapping recipe policies that can block inserts.
drop policy if exists "Allow anonymous read access" on public.recipes;
drop policy if exists "Allow anonymous insert" on public.recipes;
drop policy if exists "Allow anonymous update" on public.recipes;
drop policy if exists "Allow anonymous delete" on public.recipes;
drop policy if exists "Enable read access for all users" on public.recipes;
drop policy if exists "Enable insert for all users" on public.recipes;
drop policy if exists "Enable update for all users" on public.recipes;
drop policy if exists "Enable delete for all users" on public.recipes;
drop policy if exists "Public read access" on public.recipes;
drop policy if exists "Public read access for recipes" on public.recipes;
drop policy if exists "Limited insert access" on public.recipes;
drop policy if exists "Authenticated users can insert recipes" on public.recipes;
drop policy if exists "Allow recipe updates" on public.recipes;
drop policy if exists "Recent recipe updates only" on public.recipes;
drop policy if exists "Allow recipe deletes" on public.recipes;
drop policy if exists "Very recent recipe deletes only" on public.recipes;
drop policy if exists "Users can only update own recipes" on public.recipes;
drop policy if exists "Users can only delete own recipes" on public.recipes;
drop policy if exists "recipes_select_all" on public.recipes;
drop policy if exists "recipes_insert_authenticated" on public.recipes;
drop policy if exists "recipes_update_authenticated" on public.recipes;
drop policy if exists "recipes_delete_authenticated" on public.recipes;

-- Public read is kept for existing list/detail flows.
create policy "recipes_select_all"
on public.recipes
for select
using (true);

-- Logged-in users can create recipes.
-- Keep lightweight validation, but handle null description safely.
create policy "recipes_insert_authenticated"
on public.recipes
for insert
to authenticated
with check (
  char_length(title) <= 200
  and char_length(coalesce(description, '')) <= 1000
  and jsonb_array_length(coalesce(ingredients, '[]'::jsonb)) <= 200
);

-- Logged-in users can update recipes.
create policy "recipes_update_authenticated"
on public.recipes
for update
to authenticated
using (true)
with check (
  char_length(title) <= 200
  and char_length(coalesce(description, '')) <= 1000
  and jsonb_array_length(coalesce(ingredients, '[]'::jsonb)) <= 200
);

-- Logged-in users can delete recipes.
create policy "recipes_delete_authenticated"
on public.recipes
for delete
to authenticated
using (true);

commit;
