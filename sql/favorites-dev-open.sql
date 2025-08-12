-- favorites-dev-open.sql — 開発用（Anonでも動く）
-- create extension if not exists pgcrypto;

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,             -- dev-openではNULL許可
  client_id text,           -- 未ログイン時の端末識別子（localStorageで保持）
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 重複防止（どちらか一意）
create unique index if not exists uq_fav_user on public.favorites (user_id, recipe_id);
create unique index if not exists uq_fav_client on public.favorites (client_id, recipe_id);

alter table public.favorites enable row level security;

-- 開発用：全開放（公開運用では使用しない）
drop policy if exists "open favorites read" on public.favorites;
drop policy if exists "open favorites write" on public.favorites;
drop policy if exists "open favorites delete" on public.favorites;

create policy "open favorites read" on public.favorites
  for select using (true);

create policy "open favorites write" on public.favorites
  for insert with check (true);

create policy "open favorites delete" on public.favorites
  for delete using (true);
