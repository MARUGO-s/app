
-- sql/secure-hardening.sql — 本番RLS・所有者ガード（要: 自分のUUIDを置換）
create extension if not exists pgcrypto;
-- 1) オーナー補完（自分のUUIDに置換）
-- do $$ declare owner uuid := 'YOUR-UUID-HERE'; begin
--   update public.recipes set user_id = owner where user_id is null;
--   update public.cost_runs set user_id = owner where user_id is null;
-- end $$;

create or replace function public.set_owner_user_id()
returns trigger language plpgsql as $$
begin
  if new.user_id is null then new.user_id := auth.uid(); end if;
  return new;
end $$;

alter table public.recipes add column if not exists user_id uuid;
drop trigger if exists trg_recipes_owner on public.recipes;
create trigger trg_recipes_owner before insert on public.recipes for each row execute function public.set_owner_user_id();

alter table public.cost_runs add column if not exists user_id uuid;
drop trigger if exists trg_cost_runs_owner on public.cost_runs;
create trigger trg_cost_runs_owner before insert on public.cost_runs for each row execute function public.set_owner_user_id();

alter table public.favorites add column if not exists user_id uuid;

alter table public.recipes            enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps       enable row level security;
alter table public.cost_runs          enable row level security;
alter table public.cost_items         enable row level security;
alter table public.favorites          enable row level security;

-- 既存の開放ポリシー削除は省略（必要なら drop policy ... を先に）

-- recipes
create policy if not exists "recipes sel own" on public.recipes for select using (auth.uid() = user_id);
create policy if not exists "recipes ins own" on public.recipes for insert with check (auth.uid() = user_id);
create policy if not exists "recipes upd own" on public.recipes for update using (auth.uid() = user_id);
create policy if not exists "recipes del own" on public.recipes for delete using (auth.uid() = user_id);

-- ingredients
create policy if not exists "ings sel via parent" on public.recipe_ingredients for select using ( exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid()) );
create policy if not exists "ings ins via parent"  on public.recipe_ingredients for insert with check ( exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid()) );
create policy if not exists "ings upd via parent"  on public.recipe_ingredients for update using ( exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid()) );
create policy if not exists "ings del via parent"  on public.recipe_ingredients for delete using ( exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid()) );

-- steps
create policy if not exists "steps sel via parent" on public.recipe_steps for select using ( exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid()) );
create policy if not exists "steps ins via parent"  on public.recipe_steps for insert with check ( exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid()) );
create policy if not exists "steps upd via parent"  on public.recipe_steps for update using ( exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid()) );
create policy if not exists "steps del via parent"  on public.recipe_steps for delete using ( exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid()) );

-- cost_runs
create policy if not exists "runs sel own" on public.cost_runs for select using (auth.uid() = user_id);
create policy if not exists "runs ins own" on public.cost_runs for insert with check (auth.uid() = user_id);
create policy if not exists "runs upd own" on public.cost_runs for update using (auth.uid() = user_id);
create policy if not exists "runs del own" on public.cost_runs for delete using (auth.uid() = user_id);

-- cost_items
create policy if not exists "items sel via parent" on public.cost_items for select using ( exists (select 1 from public.cost_runs r where r.id = run_id and r.user_id = auth.uid()) );
create policy if not exists "items ins via parent"  on public.cost_items for insert with check ( exists (select 1 from public.cost_runs r where r.id = run_id and r.user_id = auth.uid()) );
create policy if not exists "items upd via parent"  on public.cost_items for update using ( exists (select 1 from public.cost_runs r where r.id = run_id and r.user_id = auth.uid()) );
create policy if not exists "items del via parent"  on public.cost_items for delete using ( exists (select 1 from public.cost_runs r where r.id = run_id and r.user_id = auth.uid()) );

-- favorites
create policy if not exists "fav sel own" on public.favorites for select using (auth.uid() = user_id);
create policy if not exists "fav ins own" on public.favorites  for insert with check (auth.uid() = user_id);
create policy if not exists "fav del own" on public.favorites  for delete using (auth.uid() = user_id);

-- 最後に NOT NULL を付与（オーナー補完後に）
-- alter table public.recipes   alter column user_id set not null;
-- alter table public.cost_runs alter column user_id set not null;
-- alter table public.favorites alter column user_id set not null;
