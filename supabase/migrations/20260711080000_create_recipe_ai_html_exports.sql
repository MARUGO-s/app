-- Create recipe_ai_html_exports table for saving AI analysis HTML
create table if not exists public.recipe_ai_html_exports (
    id uuid primary key default gen_random_uuid(),
    created_at timestamp with time zone not null default now(),
    user_id uuid not null references auth.users(id) on delete cascade,
    recipe_id bigint references public.recipes(id) on delete cascade,
    title text not null,
    html_content text not null,
    metadata jsonb not null default '{}'::jsonb
);

-- Index for scoping by user and recipe
create index if not exists idx_recipe_ai_html_exports_user_recipe_created
    on public.recipe_ai_html_exports (user_id, recipe_id, created_at desc);

-- Enable RLS
alter table public.recipe_ai_html_exports enable row level security;

-- Policies
drop policy if exists "Recipe AI HTML exports: insert own" on public.recipe_ai_html_exports;
create policy "Recipe AI HTML exports: insert own"
    on public.recipe_ai_html_exports
    for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "Recipe AI HTML exports: select own" on public.recipe_ai_html_exports;
create policy "Recipe AI HTML exports: select own"
    on public.recipe_ai_html_exports
    for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "Recipe AI HTML exports: delete own" on public.recipe_ai_html_exports;
create policy "Recipe AI HTML exports: delete own"
    on public.recipe_ai_html_exports
    for delete
    to authenticated
    using (auth.uid() = user_id);
