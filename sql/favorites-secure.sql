-- favorites-secure.sql — 本番用（Auth必須）
-- create extension if not exists pgcrypto;

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_fav_user on public.favorites (user_id, recipe_id);

alter table public.favorites enable row level security;

drop policy if exists "favorites own read" on public.favorites;
drop policy if exists "favorites own write" on public.favorites;
drop policy if exists "favorites own delete" on public.favorites;

create policy "favorites own read" on public.favorites
  for select using (auth.uid() = user_id);

create policy "favorites own write" on public.favorites
  for insert with check (auth.uid() = user_id);

create policy "favorites own delete" on public.favorites
  for delete using (auth.uid() = user_id);
