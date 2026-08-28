-- Isolate "recent views" per authenticated user
-- so one account's history is never shown to another account.

begin;

alter table public.recent_views
  add column if not exists viewer_user_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recent_views_viewer_user_id_fkey'
      and conrelid = 'public.recent_views'::regclass
  ) then
    alter table public.recent_views
      add constraint recent_views_viewer_user_id_fkey
      foreign key (viewer_user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

alter table public.recent_views
  alter column viewer_user_id set default auth.uid();

-- Legacy schema allowed only one row per recipe globally.
alter table public.recent_views
  drop constraint if exists recent_views_recipe_id_key;

-- User-scoped uniqueness: same user + same recipe only one row.
create unique index if not exists recent_views_user_recipe_unique
  on public.recent_views (viewer_user_id, recipe_id)
  where viewer_user_id is not null;

create index if not exists idx_recent_views_user_viewed_at
  on public.recent_views (viewer_user_id, viewed_at desc);

drop policy if exists "Enable access to all users" on public.recent_views;
drop policy if exists recent_views_authenticated_access on public.recent_views;

create policy recent_views_authenticated_access
  on public.recent_views
  for all
  to authenticated
  using (viewer_user_id = auth.uid())
  with check (viewer_user_id = auth.uid());

commit;

