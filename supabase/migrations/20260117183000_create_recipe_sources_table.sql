-- Create table for storing source URLs
create table if not exists recipe_sources (
    id uuid default gen_random_uuid() primary key,
    recipe_id uuid references recipes(id) on delete cascade not null,
    url text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint unique_recipe_source unique (recipe_id, url)
);
-- Enable RLS
alter table recipe_sources enable row level security;
-- Policies
drop policy if exists "Enable all access for anon" on recipe_sources;
drop policy if exists "Enable all access for authenticated" on recipe_sources;
create policy "Enable all access for anon" on recipe_sources
    for all using (true) with check (true);
create policy "Enable all access for authenticated" on recipe_sources
    for all using (true) with check (true);
